// Things that sit over the table: the center menu button and its menu, coin
// and dice results, the "who goes first?" prompt, and the winner celebration.
import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { font } from "@/design/fonts";
import { PLAYER_COLORS } from "@/lib/lifeConstants";
import type { LifePlayer } from "@/lib/lifeGame";
import { Confetti } from "./effects";
import { feel } from "./feel";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function formatElapsed(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ── Center button ─────────────────────────────────────────────────────────────

export function HubButton({ onPress, label, attention, small }: { onPress: () => void; label: string; attention: boolean; small?: boolean }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = attention ? withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })), -1) : withTiming(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attention]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.25 + pulse.value * 0.6, transform: [{ scale: 1 + pulse.value * 0.18 }] }));
  return (
    <View style={[styles.hubWrap, small && { transform: [{ scale: 0.8 }] }]} pointerEvents="box-none">
      <Animated.View pointerEvents="none" style={[styles.hubRing, ring]} />
      <Pressable
        onPress={() => {
          feel.tick();
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel="Game menu"
        style={({ pressed }) => [styles.hub, pressed && { transform: [{ scale: 0.92 }] }]}
      >
        <LinearGradient colors={["#2A2C36", "#121318"]} style={StyleSheet.absoluteFill} />
        <Ionicons name="apps" size={18} color="#FFFFFF" />
        <Text style={styles.hubLabel} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

// ── Menu ──────────────────────────────────────────────────────────────────────

export interface MenuAction {
  key: string;
  icon: IconName;
  label: string;
  hint?: string;
  tone?: "primary" | "danger";
  disabled?: boolean;
  onPress: () => void;
}

export function GameMenu({ visible, title, subtitle, sections, onClose }: { visible: boolean; title: string; subtitle: string; sections: Array<{ title: string; actions: MenuAction[] }>; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu">
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(5,5,8,0.6)" }]} />
      </Pressable>
      <View style={styles.menuCenter} pointerEvents="box-none">
        <Animated.View entering={ZoomIn.springify().damping(16)} style={styles.menu}>
          <View style={styles.menuHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>{title}</Text>
              <Text style={styles.menuSub}>{subtitle}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.menuClose} accessibilityRole="button" accessibilityLabel="Close menu">
              <Ionicons name="close" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
          {sections.map((s) => (
            <View key={s.title} style={{ gap: 8 }}>
              <Text style={styles.menuSection}>{s.title}</Text>
              <View style={styles.menuGrid}>
                {s.actions.map((a) => (
                  <Pressable
                    key={a.key}
                    disabled={a.disabled}
                    onPress={() => {
                      feel.tick();
                      a.onPress();
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !!a.disabled }}
                    style={({ pressed }) => [
                      styles.menuItem,
                      a.tone === "primary" && styles.menuItemPrimary,
                      a.disabled && { opacity: 0.35 },
                      pressed && { transform: [{ scale: 0.95 }] },
                    ]}
                  >
                    <Ionicons name={a.icon} size={20} color={a.tone === "primary" ? "#111" : a.tone === "danger" ? "#FF8A9A" : "#FFFFFF"} />
                    <Text style={[styles.menuLabel, a.tone === "primary" && { color: "#111" }, a.tone === "danger" && { color: "#FF8A9A" }]} numberOfLines={1}>
                      {a.label}
                    </Text>
                    {a.hint && (
                      <Text style={[styles.menuHint, a.tone === "primary" && { color: "rgba(0,0,0,0.55)" }]} numberOfLines={1}>
                        {a.hint}
                      </Text>
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Coin and dice ─────────────────────────────────────────────────────────────

export type ToolRollInput = { kind: "coin"; heads: boolean } | { kind: "die"; sides: number; value: number };
export type ToolRoll = ToolRollInput & { id: number };

export function RollResult({ roll, onDone }: { roll: ToolRoll; onDone: () => void }) {
  const spin = useSharedValue(0);
  const land = useSharedValue(0);
  const [shown, setShown] = useState<string>(roll.kind === "die" ? "?" : "");
  const [settled, setSettled] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    spin.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
    if (roll.kind === "die") {
      timer.current = setInterval(() => setShown(String(1 + Math.floor(Math.random() * roll.sides))), 70);
    }
    const t = setTimeout(() => {
      if (timer.current) clearInterval(timer.current);
      setShown(roll.kind === "die" ? String(roll.value) : roll.heads ? "H" : "T");
      setSettled(true);
      land.value = withSequence(withTiming(1.18, { duration: 120 }), withSpring(1, { damping: 7, stiffness: 180 }));
      feel.success();
    }, 1100);
    return () => {
      clearTimeout(t);
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll.id]);

  const coinStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateY: `${spin.value * (roll.kind === "coin" ? 1800 : 0)}deg` }, { rotateZ: `${roll.kind === "die" ? spin.value * 720 : 0}deg` }, { scale: land.value || 1 }],
  }));

  const label = roll.kind === "coin" ? (roll.heads ? "Heads" : "Tails") : `d${roll.sides}`;
  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.rollScrim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityLabel="Close" />
      <Animated.View style={coinStyle} pointerEvents="none">
        {roll.kind === "coin" ? (
          <LinearGradient colors={["#FFE7A3", "#E0A21B"]} style={styles.coin}>
            <Text style={styles.coinText}>{settled ? shown : ""}</Text>
          </LinearGradient>
        ) : (
          <LinearGradient colors={["#FFFFFF", "#D9DBE6"]} style={styles.die}>
            <Text style={styles.dieText}>{shown}</Text>
          </LinearGradient>
        )}
      </Animated.View>
      <Text style={[styles.rollLabel, !settled && { opacity: 0.4 }]}>
        {settled ? (roll.kind === "die" ? `Rolled ${roll.value} on a d${roll.sides}` : label) : roll.kind === "coin" ? "Flipping…" : `Rolling a ${label}…`}
      </Text>
      <Text style={styles.rollHint}>
        Tap anywhere to close
      </Text>
    </Animated.View>
  );
}

// ── Who goes first ────────────────────────────────────────────────────────────

export function FirstPrompt({ onRoll, onSkip }: { onRoll: () => void; onSkip: () => void }) {
  return (
    <Animated.View entering={ZoomIn.springify().damping(15).delay(250)} style={styles.prompt}>
      <Text style={styles.promptTitle}>Who goes first?</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable onPress={onRoll} style={({ pressed }) => [styles.promptBtn, styles.promptPrimary, pressed && { transform: [{ scale: 0.95 }] }]} accessibilityRole="button">
          <Ionicons name="dice" size={16} color="#111" />
          <Text style={[styles.promptBtnText, { color: "#111" }]}>Roll for it</Text>
        </Pressable>
        <Pressable onPress={onSkip} style={({ pressed }) => [styles.promptBtn, pressed && { opacity: 0.7 }]} accessibilityRole="button">
          <Text style={styles.promptBtnText}>Skip</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ── Winner ────────────────────────────────────────────────────────────────────

export function WinnerOverlay({
  winner,
  rotation,
  turn,
  elapsedMs,
  onRematch,
  onUndo,
  onNewGame,
  onClose,
}: {
  winner: LifePlayer;
  rotation: number;
  turn: number;
  elapsedMs: number;
  onRematch: () => void;
  onUndo: () => void;
  onNewGame: () => void;
  onClose: () => void;
}) {
  const color = PLAYER_COLORS[winner.color];
  const bob = useSharedValue(0);
  useEffect(() => {
    feel.success();
    bob.value = withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) })), -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const trophy = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(bob.value, [0, 1], [0, -8]) }, { rotate: `${interpolate(bob.value, [0, 1], [-4, 4])}deg` }] }));

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.winScrim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <Confetti colors={[color.from, color.glow, "#FFFFFF", "#FFE7A3", color.to]} />
      <Animated.View entering={ZoomIn.springify().damping(13).delay(150)} style={[styles.winCard, { transform: [{ rotate: `${rotation}deg` }] }]}>
        <LinearGradient colors={[color.from, color.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={["rgba(255,255,255,0.25)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0.3, y: 0.6 }} style={StyleSheet.absoluteFill} />
        <Animated.View style={[styles.trophy, trophy]}>
          <Ionicons name="trophy" size={40} color="#E0A21B" />
        </Animated.View>
        <Text style={styles.winName} numberOfLines={1}>
          {winner.name} wins!
        </Text>
        <Text style={styles.winSub}>
          Turn {Math.max(1, turn)} · {formatElapsed(elapsedMs)} · {winner.life} life left
        </Text>
        <Pressable onPress={onRematch} style={({ pressed }) => [styles.winPrimary, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityRole="button">
          <Ionicons name="refresh" size={17} color="#111" />
          <Text style={styles.winPrimaryText}>Rematch</Text>
        </Pressable>
        <View style={{ flexDirection: "row", gap: 8, alignSelf: "stretch" }}>
          <Pressable onPress={onUndo} style={({ pressed }) => [styles.winSecondary, pressed && { opacity: 0.7 }]} accessibilityRole="button">
            <Ionicons name="arrow-undo" size={15} color="#FFFFFF" />
            <Text style={styles.winSecondaryText}>Undo</Text>
          </Pressable>
          <Pressable onPress={onNewGame} style={({ pressed }) => [styles.winSecondary, pressed && { opacity: 0.7 }]} accessibilityRole="button">
            <Ionicons name="options" size={15} color="#FFFFFF" />
            <Text style={styles.winSecondaryText}>New game</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const HUB = 62;

const styles = StyleSheet.create({
  hubWrap: { width: HUB + 24, height: HUB + 24, alignItems: "center", justifyContent: "center" },
  hubRing: { position: "absolute", width: HUB + 14, height: HUB + 14, borderRadius: (HUB + 14) / 2, borderWidth: 2, borderColor: "#FFFFFF" },
  hub: {
    width: HUB,
    height: HUB,
    borderRadius: HUB / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#0B0C10",
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  hubLabel: { fontFamily: font.bold, fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 1, fontVariant: ["tabular-nums"] },
  menuCenter: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 20 },
  menu: { width: "100%", maxWidth: 380, padding: 18, gap: 16, borderRadius: 28, backgroundColor: "#15161C", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  menuHead: { flexDirection: "row", alignItems: "center" },
  menuTitle: { fontFamily: font.heavy, fontSize: 22, color: "#FFFFFF", letterSpacing: -0.5 },
  menuSub: { fontFamily: font.medium, fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 2 },
  menuClose: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)" },
  menuSection: { fontFamily: font.bold, fontSize: 11, letterSpacing: 0.8, color: "rgba(255,255,255,0.4)" },
  menuGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  menuItem: { flexGrow: 1, flexBasis: "30%", minHeight: 74, padding: 12, gap: 6, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.07)", justifyContent: "flex-end" },
  menuItemPrimary: { backgroundColor: "#FFFFFF" },
  menuLabel: { fontFamily: font.bold, fontSize: 14, color: "#FFFFFF" },
  menuHint: { fontFamily: font.medium, fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: -4 },
  rollScrim: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 18, backgroundColor: "rgba(5,5,8,0.78)" },
  coin: { width: 150, height: 150, borderRadius: 75, alignItems: "center", justifyContent: "center", borderWidth: 6, borderColor: "#F6C94C" },
  coinText: { fontFamily: font.heavy, fontSize: 64, color: "#7A4A00" },
  die: { width: 130, height: 130, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  dieText: { fontFamily: font.heavy, fontSize: 60, color: "#111", fontVariant: ["tabular-nums"] },
  rollLabel: { fontFamily: font.heavy, fontSize: 24, color: "#FFFFFF", letterSpacing: -0.4 },
  rollHint: { position: "absolute", bottom: 60, fontFamily: font.medium, fontSize: 12, color: "rgba(255,255,255,0.45)" },
  prompt: { alignItems: "center", gap: 10, padding: 14, borderRadius: 22, backgroundColor: "rgba(16,17,22,0.94)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  promptTitle: { fontFamily: font.heavy, fontSize: 16, color: "#FFFFFF" },
  promptBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.1)" },
  promptPrimary: { backgroundColor: "#FFFFFF" },
  promptBtnText: { fontFamily: font.bold, fontSize: 14, color: "#FFFFFF" },
  winScrim: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(5,5,8,0.55)" },
  winCard: { width: 300, alignItems: "center", gap: 10, padding: 22, borderRadius: 30, overflow: "hidden" },
  trophy: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF6DA", marginBottom: 4 },
  winName: { fontFamily: font.heavy, fontSize: 28, color: "#FFFFFF", letterSpacing: -0.8 },
  winSub: { fontFamily: font.semibold, fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 6 },
  winPrimary: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 48, borderRadius: 24, backgroundColor: "#FFFFFF" },
  winPrimaryText: { fontFamily: font.heavy, fontSize: 16, color: "#111" },
  winSecondary: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 42, borderRadius: 21, backgroundColor: "rgba(0,0,0,0.25)" },
  winSecondaryText: { fontFamily: font.bold, fontSize: 14, color: "#FFFFFF" },
});
