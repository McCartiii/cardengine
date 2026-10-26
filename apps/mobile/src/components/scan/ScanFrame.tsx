// The viewfinder: a card-shaped window in a dimmed camera feed, corner
// brackets that turn green on a match, a scan line sweeping while it looks,
// and a status pill saying what the scanner is doing.
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { font } from "@/design/fonts";
import { Text } from "@/ui";
import type { ScanPhase } from "@/store/scanStore";

export interface FrameRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const DIM = "rgba(4,5,9,0.74)";
const GREEN = "#5CE0A0";
const AMBER = "#FFB547";
const BRACKET = 30;
const STROKE = 4;
const RADIUS = 18;

const STATUS: Record<ScanPhase, { icon?: React.ComponentProps<typeof Ionicons>["name"]; color: string; text: (name: string | null) => string }> = {
  searching: { icon: "scan-outline", color: "#FFFFFF", text: () => "Fit one card inside the frame" },
  reading: { color: "#FFFFFF", text: (n) => (n ? `Scrying “${n}”…` : "Scrying…") },
  identifying: { color: "#FFFFFF", text: (n) => (n ? `Looking up “${n}”` : "Looking it up…") },
  matched: { icon: "checkmark-circle", color: GREEN, text: (n) => (n ? `Into the binder: ${n}` : "Into the binder!") },
  nomatch: { icon: "alert-circle", color: AMBER, text: () => "Nothing in sight. Try more light" },
};

export function ScanFrame({ rect, phase, name, paused }: { rect: FrameRect; phase: ScanPhase; name: string | null; paused: boolean }) {
  const { top, left, width, height } = rect;
  const tint = phase === "matched" ? GREEN : phase === "nomatch" ? AMBER : "#FFFFFF";

  // The scan line sweeps while the scanner is looking or reading.
  const sweep = useSharedValue(0);
  const looking = !paused && (phase === "searching" || phase === "reading");
  useEffect(() => {
    if (looking) {
      sweep.value = 0;
      sweep.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, true);
    } else {
      cancelAnimation(sweep);
    }
  }, [looking, sweep]);
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sweep.value * (height - 40) }] }));

  // The brackets close in a touch when a card is matched.
  const pop = useSharedValue(1);
  useEffect(() => {
    if (phase === "matched") pop.value = withSequence(withTiming(0.96, { duration: 110 }), withSpring(1, { damping: 9, stiffness: 220 }));
  }, [phase, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const status = paused ? { icon: "pause" as const, color: "#FFFFFF", text: () => "Paused" } : STATUS[phase];
  const busy = !paused && (phase === "reading" || phase === "identifying");

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Dim everything outside the window. */}
      <View style={[styles.dim, { top: 0, left: 0, right: 0, height: top }]} />
      <View style={[styles.dim, { top: top + height, left: 0, right: 0, bottom: 0 }]} />
      <View style={[styles.dim, { top, left: 0, width: left, height }]} />
      <View style={[styles.dim, { top, left: left + width, right: 0, height }]} />

      <Animated.View style={[{ position: "absolute", top, left, width, height }, popStyle]}>
        {looking && (
          <Animated.View style={[styles.line, lineStyle]}>
            <LinearGradient
              colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.lineCore} />
          </Animated.View>
        )}
        {(["tl", "tr", "bl", "br"] as const).map((corner) => (
          <View
            key={corner}
            style={[
              styles.bracket,
              {
                borderColor: tint,
                top: corner[0] === "t" ? -STROKE / 2 : undefined,
                bottom: corner[0] === "b" ? -STROKE / 2 : undefined,
                left: corner[1] === "l" ? -STROKE / 2 : undefined,
                right: corner[1] === "r" ? -STROKE / 2 : undefined,
                borderTopWidth: corner[0] === "t" ? STROKE : 0,
                borderBottomWidth: corner[0] === "b" ? STROKE : 0,
                borderLeftWidth: corner[1] === "l" ? STROKE : 0,
                borderRightWidth: corner[1] === "r" ? STROKE : 0,
                borderTopLeftRadius: corner === "tl" ? RADIUS : 0,
                borderTopRightRadius: corner === "tr" ? RADIUS : 0,
                borderBottomLeftRadius: corner === "bl" ? RADIUS : 0,
                borderBottomRightRadius: corner === "br" ? RADIUS : 0,
              },
            ]}
          />
        ))}
      </Animated.View>

      <Animated.View
        key={`${paused}-${phase}`}
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(120)}
        style={[styles.status, { top: top - 52 }]}
      >
        {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : status.icon && <Ionicons name={status.icon} size={16} color={status.color} />}
        <Text style={[styles.statusText, { color: status.color }]} numberOfLines={1}>
          {status.text(name)}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { position: "absolute", backgroundColor: DIM },
  bracket: { position: "absolute", width: BRACKET, height: BRACKET },
  line: { position: "absolute", left: 10, right: 10, top: 0, height: 40, justifyContent: "center" },
  lineCore: { height: 2, marginHorizontal: 6, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.7)" },
  status: {
    position: "absolute",
    alignSelf: "center",
    maxWidth: "88%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "rgba(10,11,16,0.78)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
  },
  statusText: { fontFamily: font.semibold, fontSize: 14, flexShrink: 1 },
});
