import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useCardScanner } from "@/hooks/useCardScanner";
import { ScanOverlay } from "@/components/ScanOverlay";
import { ScannedCardTray } from "@/components/ScannedCardTray";
import { LastScannedThumb } from "@/components/LastScannedThumb";
import { useScanStore } from "@/store/scanStore";
import { COLORS } from "@/lib/constants";

export default function ScanScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [cameraPosition, setCameraPosition] = useState<"back" | "front">("back");
  const [paused, setPaused] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);

  const device = useCameraDevice(cameraPosition);
  const { frameProcessor } = useCardScanner();
  const { detectedName, detectedPrice, pending } = useScanStore();

  const unaddedPending = pending.filter((p) => !p.added);
  const lastScanned = unaddedPending[0] ?? null;
  const totalPending = unaddedPending.reduce((s, p) => s + p.quantity, 0);

  // Request camera permission on mount
  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // Close tray if all cards were cleared externally
  useEffect(() => {
    if (trayOpen && unaddedPending.length === 0) setTrayOpen(false);
  }, [trayOpen, unaddedPending.length]);

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permText}>Camera access is required to scan cards.</Text>
        <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permText}>No camera found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Full-screen camera feed */}
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!paused}
        frameProcessor={frameProcessor}
        photo={false}
        video={false}
        videoStabilizationMode="auto"
        androidPreviewViewType="texture-view"
        torch={flashOn ? "on" : "off"}
      />

      {/* Vignette, bounding box, name badge, price overlay */}
      <ScanOverlay
        detectedName={detectedName}
        detectedPrice={detectedPrice}
      />

      {/* Top control bar */}
      <View style={styles.topBarWrap} pointerEvents="box-none">
        <SafeAreaView edges={["top"]}>
          <View style={styles.topBar}>
            {/* Flash toggle */}
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setFlashOn((f) => !f)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={flashOn ? "flash" : "flash-outline"}
                size={20}
                color="#fff"
              />
            </TouchableOpacity>

            <View style={styles.topBarRight}>
              {/* Pause / resume */}
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => setPaused((p) => !p)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={paused ? "play" : "pause"}
                  size={20}
                  color="#fff"
                />
              </TouchableOpacity>

              {/* Camera flip */}
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() =>
                  setCameraPosition((pos) => (pos === "back" ? "front" : "back"))
                }
                activeOpacity={0.75}
              >
                <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>

      {/* Last-scanned thumbnail (collapsed state) */}
      {!trayOpen && lastScanned && (
        <LastScannedThumb
          scan={lastScanned}
          totalCount={totalPending}
          onViewMore={() => setTrayOpen(true)}
        />
      )}

      {/* Full pending tray (expanded state) */}
      {trayOpen && (
        <ScannedCardTray onClose={() => setTrayOpen(false)} />
      )}

      {/* Hint when nothing is pending and not paused */}
      {!lastScanned && !paused && (
        <SafeAreaView edges={["bottom"]} style={styles.bottomHint} pointerEvents="none">
          <Text style={styles.bottomHintText}>
            Point at a card — it'll scan automatically
          </Text>
        </SafeAreaView>
      )}

      {/* Paused indicator */}
      {paused && (
        <View style={styles.pausedBadge} pointerEvents="none">
          <Ionicons name="pause-circle" size={18} color={COLORS.textMuted} />
          <Text style={styles.pausedText}>Paused</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  permText: {
    color: COLORS.text,
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  permButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  permButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  topBarWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  topBarRight: {
    flexDirection: "row",
    gap: 6,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomHint: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingBottom: 8,
  },
  bottomHintText: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
  },
  pausedBadge: {
    position: "absolute",
    bottom: 56,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pausedText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
});
