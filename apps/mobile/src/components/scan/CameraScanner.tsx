import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from "react-native";
import { Camera, useCameraDevice, useCameraFormat, useCameraPermission } from "react-native-vision-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "expo-router";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { CARD_ASPECT, space } from "@/design/tokens";
import { useCardScanner } from "@/hooks/useCardScanner";
import { useScanStore } from "@/store/scanStore";
import { ScanFrame, type FrameRect } from "@/components/scan/ScanFrame";
import { AlternativesSheet, ResultCard, ReviewSheet, SessionBar, useAddToBinder, useStack } from "@/components/scan/ScanPanels";
import { EmptyState, IconButton, Screen, tap } from "@/ui";

// Room reserved under the frame for the result card and the session bar.
const RESULT_SPACE = 150;
const SESSION_SPACE = 64;

/** Live camera scanner. Needs the VisionCamera native modules (dev or store build, not Expo Go). */
export default function CameraScanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const focused = useIsFocused();
  // The tab bar is hidden while scanning, so this is the way out.
  const close = () => router.navigate("/(tabs)");
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  // 720p is plenty for a card held close and much quicker to read than 4K.
  const format = useCameraFormat(device, [{ videoResolution: { width: 1280, height: 720 } }, { fps: 30 }]);
  const camera = useRef<Camera>(null);

  const [paused, setPaused] = useState(false);
  const [torch, setTorch] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number; id: number } | null>(null);

  const sheetsOpen = reviewOpen || fixing != null;
  const { frameProcessor } = useCardScanner({ enabled: !paused && !sheetsOpen });
  const { phase, detectedName, lastKey, pending } = useScanStore();
  const { waiting } = useStack();
  const { add, state: addState } = useAddToBinder();
  const result = pending.find((p) => p.key === lastKey && !p.added) ?? null;
  const fixingScan = pending.find((p) => p.key === fixing) ?? null;

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    if (!focusPoint) return;
    const t = setTimeout(() => setFocusPoint(null), 700);
    return () => clearTimeout(t);
  }, [focusPoint]);

  // The biggest card-shaped window that fits between the controls and the panels.
  const frameTop = insets.top + 112;
  const bottomReserve = Math.max(insets.bottom, space.md) + SESSION_SPACE + RESULT_SPACE + space.lg;
  const frameHeight = Math.max(200, height - frameTop - bottomReserve);
  const frameWidth = Math.min(width * 0.78, frameHeight * CARD_ASPECT);
  const rect: FrameRect = { top: frameTop, left: (width - frameWidth) / 2, width: frameWidth, height: frameWidth / CARD_ASPECT };

  const focusAt = (e: GestureResponderEvent) => {
    const { locationX: x, locationY: y } = e.nativeEvent;
    if (!device?.supportsFocus) return;
    camera.current?.focus({ x, y }).catch(() => {});
    setFocusPoint({ x, y, id: Date.now() });
    tap();
  };

  if (!hasPermission) {
    return (
      <Screen>
        <IconButton icon="close" label="Close scanner" onPress={close} style={styles.closeStandalone} />
        <EmptyState
          icon="camera-outline"
          title="Allow camera access"
          body="Card Engine reads the card's name and set through your camera. Nothing is recorded or uploaded."
          action="Allow camera"
          onAction={requestPermission}
        />
      </Screen>
    );
  }

  if (!device) {
    return (
      <Screen>
        <IconButton icon="close" label="Close scanner" onPress={close} style={styles.closeStandalone} />
        <EmptyState icon="camera-outline" title="No camera found" body="Scanning needs a device with a camera." />
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        fps={format ? Math.min(30, format.maxFps) : undefined}
        isActive={focused && !paused}
        frameProcessor={frameProcessor}
        photo={false}
        video={false}
        videoStabilizationMode="auto"
        androidPreviewViewType="texture-view"
        torch={torch ? "on" : "off"}
      />

      {/* Tap anywhere on the feed to focus there. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={focusAt} accessibilityLabel="Tap to focus" />
      {focusPoint && (
        <Animated.View
          key={focusPoint.id}
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(300)}
          pointerEvents="none"
          style={[styles.focusRing, { left: focusPoint.x - 32, top: focusPoint.y - 32 }]}
        />
      )}

      <ScanFrame rect={rect} phase={phase} name={detectedName} paused={paused} />

      <View style={[styles.topBar, { top: insets.top + space.sm }]} pointerEvents="box-none">
        <CameraButton icon="close" label="Close scanner" onPress={close} />
        <View style={styles.topRight}>
          {device.hasTorch && <CameraButton icon={torch ? "flash" : "flash-outline"} label={torch ? "Turn light off" : "Turn light on"} on={torch} onPress={() => setTorch((t) => !t)} />}
          <CameraButton icon={paused ? "play" : "pause"} label={paused ? "Resume scanning" : "Pause scanning"} on={paused} onPress={() => setPaused((p) => !p)} />
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, space.md) }]} pointerEvents="box-none">
        {result && <ResultCard key={result.key} scan={result} onWrongCard={() => setFixing(result.key)} />}
        <SessionBar onReview={() => setReviewOpen(true)} onAdd={() => add(waiting)} adding={addState} />
      </View>

      <ReviewSheet
        visible={reviewOpen}
        onClose={() => setReviewOpen(false)}
        adding={addState === "adding"}
        onAdd={async () => {
          if (await add(waiting)) setReviewOpen(false);
        }}
      />
      <AlternativesSheet scan={fixingScan} onClose={() => setFixing(null)} />
    </View>
  );
}

function CameraButton({ icon, label, on, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.camButton, on && styles.camButtonOn, pressed && { transform: [{ scale: 0.92 }] }]}
    >
      <Ionicons name={icon} size={20} color={on ? "#0E0F13" : "#FFFFFF"} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  closeStandalone: { marginLeft: 16, marginTop: 8 },
  topBar: { position: "absolute", left: space.lg, right: space.lg, flexDirection: "row", justifyContent: "space-between" },
  topRight: { flexDirection: "row", gap: space.sm },
  camButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(14,15,21,0.7)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
  },
  camButtonOn: { backgroundColor: "#FFFFFF" },
  bottom: { position: "absolute", left: space.md, right: space.md, bottom: 0, gap: 10 },
  focusRing: { position: "absolute", width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: "#FFFFFF" },
});
