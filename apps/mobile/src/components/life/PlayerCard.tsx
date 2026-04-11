import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  interpolateColor,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useLifeStore, type Player, formatTime } from "../../store/lifeStore";
import { LC, SHADOWS, randomQuip } from "../../lib/lifeConstants";
import { CounterDrawer } from "./CounterDrawer";

interface Props {
  player: Player;
  playerIndex: number;
  isActivePlayer: boolean;
  hasTimer: boolean;
  compact?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const DANGER_THRESHOLD = 5;
const HOLD_INITIAL_DELAY_MS = 400;
const HOLD_INITIAL_INTERVAL_MS = 320;
const HOLD_MIN_INTERVAL_MS = 55;
const HOLD_ACCELERATION = 0.8;

const COUNTER_DOT_COLORS: Record<string, string> = {
  poison: "#A78BFA",
  energy: "#FB923C",
  commander: "#F43F5E",
  experience: "#22C55E",
};

export function PlayerCard({
  player,
  playerIndex,
  isActivePlayer,
  hasTimer,
  compact = false,
}: Props) {
  const { adjustLife, startClock, isClockRunning } = useLifeStore();

  // ── Quip (stable, created once on mount) ─────────────────────────────────
  const [quip] = useState(() => randomQuip());
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Derived state ─────────────────────────────────────────────────────────
  const isDanger = player.life > 0 && player.life <= DANGER_THRESHOLD && !player.isEliminated;
  const showTapToStart =
    isActivePlayer && hasTimer && !isClockRunning && !player.isEliminated;

  // ── Delta accumulator ─────────────────────────────────────────────────────
  const accDelta = useRef(0);
  const [displayDelta, setDisplayDelta] = useState<number | null>(null);
  const deltaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Hold-to-repeat refs ───────────────────────────────────────────────────
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdSpeed = useRef(HOLD_INITIAL_INTERVAL_MS);

  // ── Reanimated shared values ──────────────────────────────────────────────
  // 0 = no flash, 1 = flashed color (red for damage, green for heal)
  const numColorProgress = useSharedValue(0);
  // 1 = red (damage), 0 = green (heal)
  const flashIsRed = useSharedValue(1);

  // Number scale
  const numScale = useSharedValue(1);

  // Shake
  const shakeX = useSharedValue(0);
  const shakeRot = useSharedValue(0);

  // Border flash
  const borderColorProgress = useSharedValue(0);
  const borderFlashIsRed = useSharedValue(1);

  // Damage vignette
  const vignetteOpacity = useSharedValue(0);

  // Floating delta
  const deltaOpacity = useSharedValue(0);
  const deltaTranslateY = useSharedValue(0);

  // Danger pulse
  const dangerPulse = useSharedValue(0);

  // Edge glow danger transition
  const glowDanger = useSharedValue(isDanger ? 1 : 0);

  // ── Danger pulse effect ───────────────────────────────────────────────────
  useEffect(() => {
    if (isDanger) {
      dangerPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 750, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
      glowDanger.value = withTiming(1, { duration: 400 });
    } else {
      dangerPulse.value = withTiming(0, { duration: 300 });
      glowDanger.value = withTiming(0, { duration: 400 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDanger]);

  // ── Small life change (abs < 5) ───────────────────────────────────────────
  const triggerSmallAnimation = useCallback(
    (delta: number) => {
      const isDamage = delta < 0;
      flashIsRed.value = isDamage ? 1 : 0;
      borderFlashIsRed.value = isDamage ? 1 : 0;

      numColorProgress.value = 0;
      numColorProgress.value = withSequence(
        withTiming(1, { duration: 60 }),
        withTiming(0, { duration: 600 })
      );

      borderColorProgress.value = 0;
      borderColorProgress.value = withSequence(
        withTiming(1, { duration: 60 }),
        withTiming(0, { duration: 600 })
      );

      if (isDamage) {
        shakeX.value = withSequence(
          withTiming(-6, { duration: 50 }),
          withTiming(6, { duration: 60 }),
          withTiming(-4, { duration: 50 }),
          withTiming(4, { duration: 60 }),
          withTiming(0, { duration: 80 })
        );
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── Big life change (abs >= 5) ────────────────────────────────────────────
  const triggerBigAnimation = useCallback(
    (delta: number) => {
      const isDamage = delta < 0;
      flashIsRed.value = isDamage ? 1 : 0;
      borderFlashIsRed.value = isDamage ? 1 : 0;

      numScale.value = withSequence(
        withTiming(isDamage ? 1.12 : 1.08, { duration: 150 }),
        withSpring(1, { damping: 10, stiffness: 120 })
      );

      numColorProgress.value = 0;
      numColorProgress.value = withSequence(
        withTiming(1, { duration: 60 }),
        withTiming(0, { duration: 800 })
      );

      borderColorProgress.value = 0;
      borderColorProgress.value = withSequence(
        withTiming(1, { duration: 60 }),
        withTiming(0, { duration: 800 })
      );

      if (isDamage) {
        shakeX.value = withSequence(
          withTiming(-12, { duration: 50 }),
          withTiming(12, { duration: 70 }),
          withTiming(-8, { duration: 60 }),
          withTiming(8, { duration: 60 }),
          withTiming(-4, { duration: 50 }),
          withTiming(0, { duration: 80 })
        );
        shakeRot.value = withSequence(
          withTiming(-1.5, { duration: 50 }),
          withTiming(1.5, { duration: 70 }),
          withTiming(-1, { duration: 60 }),
          withTiming(1, { duration: 60 }),
          withTiming(0, { duration: 80 })
        );

        vignetteOpacity.value = withSequence(
          withTiming(0.12, { duration: 120 }),
          withTiming(0, { duration: 800 })
        );
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── Floating delta display ────────────────────────────────────────────────
  const showDeltaIndicator = useCallback(
    (delta: number) => {
      accDelta.current += delta;
      setDisplayDelta(accDelta.current);

      deltaOpacity.value = 1;
      deltaTranslateY.value = 0;

      if (deltaTimer.current) clearTimeout(deltaTimer.current);

      deltaTimer.current = setTimeout(() => {
        deltaOpacity.value = withTiming(0, { duration: 500 });
        deltaTranslateY.value = withTiming(-40, { duration: 500 });
        setTimeout(() => {
          setDisplayDelta(null);
          accDelta.current = 0;
        }, 520);
      }, 1200);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── Core delta application ────────────────────────────────────────────────
  const applyDelta = useCallback(
    (delta: number) => {
      if (player.isEliminated) return;
      adjustLife(player.id, delta);

      const isBig = Math.abs(delta) >= 5;
      if (isBig) {
        triggerBigAnimation(delta);
      } else {
        triggerSmallAnimation(delta);
      }
      showDeltaIndicator(delta);
    },
    [player.id, player.isEliminated, adjustLife, triggerSmallAnimation, triggerBigAnimation, showDeltaIndicator]
  );

  // ── Hold-to-repeat ────────────────────────────────────────────────────────
  const startHold = useCallback(
    (delta: number) => {
      holdSpeed.current = HOLD_INITIAL_INTERVAL_MS;
      const fire = () => {
        applyDelta(delta);
        holdSpeed.current = Math.max(HOLD_MIN_INTERVAL_MS, holdSpeed.current * HOLD_ACCELERATION);
        holdTimer.current = setTimeout(fire, holdSpeed.current);
      };
      holdTimer.current = setTimeout(fire, HOLD_INITIAL_DELAY_MS);
    },
    [applyDelta]
  );

  const stopHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  // ── Animated styles ───────────────────────────────────────────────────────
  const numAnimStyle = useAnimatedStyle(() => {
    const flashColor = flashIsRed.value === 1 ? LC.danger : LC.success;
    const defaultColor = LC.textPrimary;

    const color = isDanger
      ? interpolateColor(dangerPulse.value, [0, 1], [LC.textPrimary, LC.danger])
      : interpolateColor(numColorProgress.value, [0, 1], [defaultColor, flashColor]);

    return {
      color,
      transform: [
        { scale: numScale.value },
        { translateX: shakeX.value },
        { rotate: `${shakeRot.value}deg` },
      ],
    };
  });

  const borderAnimStyle = useAnimatedStyle(() => {
    const flashRed = "rgba(244,63,94,0.6)";
    const flashGreen = "rgba(34,197,94,0.5)";
    const flashColor = borderFlashIsRed.value === 1 ? flashRed : flashGreen;

    if (isDanger) {
      return { borderColor: "rgba(244,63,94,0.25)" };
    }

    return {
      borderColor: interpolateColor(
        borderColorProgress.value,
        [0, 1],
        [LC.border, flashColor]
      ),
    };
  });

  const vignetteStyle = useAnimatedStyle(() => ({
    opacity: vignetteOpacity.value,
  }));

  const deltaStyle = useAnimatedStyle(() => ({
    opacity: deltaOpacity.value,
    transform: [{ translateY: deltaTranslateY.value }],
  }));

  const glowColorStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      glowDanger.value,
      [0, 1],
      [player.color.base, LC.danger]
    ),
    shadowColor: interpolateColor(
      glowDanger.value,
      [0, 1],
      [player.color.base, LC.danger]
    ),
  }));

  // ── Counter dots ──────────────────────────────────────────────────────────
  const cmdTotal = Object.values(player.commanderDamage).reduce((a, b) => a + b, 0);
  const counterDots: { key: string; color: string }[] = [];
  if (player.poison > 0) counterDots.push({ key: "poison", color: COUNTER_DOT_COLORS.poison });
  if (player.energy > 0) counterDots.push({ key: "energy", color: COUNTER_DOT_COLORS.energy });
  if (cmdTotal > 0) counterDots.push({ key: "commander", color: COUNTER_DOT_COLORS.commander });
  if (player.experience > 0) counterDots.push({ key: "experience", color: COUNTER_DOT_COLORS.experience });

  // ── Sizes ─────────────────────────────────────────────────────────────────
  const lifeSize = compact ? 56 : 88;
  const deltaFontSize = displayDelta !== null && Math.abs(displayDelta) >= 5 ? 36 : 28;
  const timerActive = isActivePlayer && isClockRunning;

  return (
    <View style={[styles.card, SHADOWS.card]}>
      {/* Animated border overlay */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.borderOverlay, borderAnimStyle]}
        pointerEvents="none"
      />

      {/* Edge glow bar */}
      <Animated.View style={[styles.edgeGlow, glowColorStyle]} pointerEvents="none" />

      {/* Damage vignette overlay */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.vignetteOverlay, vignetteStyle]}
        pointerEvents="none"
      />

      {/* ── Top row: tap-to-start badge + timer badge ────────────────── */}
      <View style={styles.topRow} pointerEvents="box-none">
        {showTapToStart ? (
          <TouchableOpacity
            style={styles.tapToStartBadge}
            onPress={startClock}
            activeOpacity={0.7}
          >
            <Text style={styles.tapToStartText}>Tap to start</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}

        {hasTimer && (
          <View style={[styles.timerBadge, timerActive && styles.timerBadgeActive]}>
            <Text style={[styles.timerText, timerActive && styles.timerTextActive]}>
              {formatTime(player.timeRemainingMs)}
            </Text>
          </View>
        )}
      </View>

      {/* ── Player name ──────────────────────────────────────────────── */}
      <Text
        style={[styles.playerName, { color: `${player.color.active}99` }]}
        numberOfLines={1}
      >
        {player.name}
      </Text>

      {/* ── Life total ───────────────────────────────────────────────── */}
      <View style={styles.lifeContainer} pointerEvents="none">
        <Animated.Text
          style={[
            styles.lifeNumber,
            { fontSize: lifeSize, lineHeight: lifeSize * 1.1 },
            numAnimStyle,
          ]}
        >
          {player.life}
        </Animated.Text>
        <Text style={styles.lifeLabel}>life</Text>
      </View>

      {/* ── Floating delta ───────────────────────────────────────────── */}
      <Animated.Text
        style={[
          styles.deltaText,
          {
            fontSize: deltaFontSize,
            color: (displayDelta ?? 0) < 0 ? LC.danger : LC.success,
            top: "25%",
          },
          deltaStyle,
        ]}
        pointerEvents="none"
      >
        {displayDelta !== null
          ? displayDelta > 0
            ? `+${displayDelta}`
            : `${displayDelta}`
          : ""}
      </Animated.Text>

      {/* ── Left tap zone (-1) ───────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.tapZone, styles.tapZoneLeft]}
        onPress={() => applyDelta(-1)}
        onLongPress={() => startHold(-1)}
        onPressOut={stopHold}
        delayLongPress={400}
        activeOpacity={1}
      >
        <Text style={styles.zoneGlyph}>−</Text>
      </TouchableOpacity>

      {/* ── Right tap zone (+1) ──────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.tapZone, styles.tapZoneRight]}
        onPress={() => applyDelta(1)}
        onLongPress={() => startHold(1)}
        onPressOut={stopHold}
        delayLongPress={400}
        activeOpacity={1}
      >
        <Text style={styles.zoneGlyph}>+</Text>
      </TouchableOpacity>

      {/* ── Counter dots (when drawer closed) ────────────────────────── */}
      {!drawerOpen && counterDots.length > 0 && (
        <View style={styles.counterDots} pointerEvents="none">
          {counterDots.map((dot) => (
            <View
              key={dot.key}
              style={[styles.counterDot, { backgroundColor: dot.color }]}
            />
          ))}
        </View>
      )}

      {/* ── Swipe-up pill trigger ────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.drawerTrigger}
        onPress={() => setDrawerOpen(true)}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 24, right: 24 }}
      >
        <View style={styles.drawerPill} />
      </TouchableOpacity>

      {/* ── Elimination overlay ──────────────────────────────────────── */}
      {player.isEliminated && (
        <View style={styles.eliminationOverlay}>
          <Text style={styles.eliminationX}>✕</Text>
          <Text style={styles.eliminationText}>ELIMINATED</Text>
          <Text style={[styles.eliminationName, { color: `${player.color.active}80` }]}>
            {player.name}
          </Text>
          <Text style={styles.eliminationQuip}>{quip}</Text>
        </View>
      )}

      {/* ── Counter drawer ───────────────────────────────────────────── */}
      <CounterDrawer
        player={player}
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: LC.surface,
    borderWidth: 1,
    borderColor: LC.border,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },

  borderOverlay: {
    borderWidth: 1,
    borderRadius: 16,
    zIndex: 2,
  },

  edgeGlow: {
    position: "absolute",
    top: 0,
    left: "20%",
    right: "20%",
    height: 2,
    borderRadius: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    zIndex: 3,
  },

  vignetteOverlay: {
    borderWidth: 8,
    borderColor: "rgba(244,63,94,0.3)",
    borderRadius: 16,
    zIndex: 10,
  },

  topRow: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 5,
  },

  tapToStartBadge: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.25)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  tapToStartText: {
    color: LC.success,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  timerBadge: {
    backgroundColor: "rgba(71,85,105,0.2)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  timerBadgeActive: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.25)",
  },

  timerText: {
    fontFamily: "monospace",
    fontSize: 11,
    fontWeight: "700",
    color: LC.textMuted,
  },

  timerTextActive: {
    color: LC.success,
  },

  playerName: {
    position: "absolute",
    top: 36,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    zIndex: 4,
  },

  lifeContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },

  lifeNumber: {
    fontWeight: "900",
    letterSpacing: -4,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },

  lifeLabel: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: LC.textMuted,
    marginTop: 2,
  },

  deltaText: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontWeight: "800",
    zIndex: 15,
  },

  tapZone: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "40%",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 8,
  },

  tapZoneLeft: {
    left: 0,
  },

  tapZoneRight: {
    right: 0,
  },

  zoneGlyph: {
    fontSize: 36,
    fontWeight: "200",
    color: "rgba(255,255,255,0.08)",
    lineHeight: 44,
  },

  counterDots: {
    position: "absolute",
    bottom: 22,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    zIndex: 6,
  },

  counterDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },

  drawerTrigger: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 7,
  },

  drawerPill: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.12)",
  },

  eliminationOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,13,19,0.85)",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
    gap: 4,
  },

  eliminationX: {
    fontSize: 64,
    fontWeight: "900",
    color: LC.danger,
    lineHeight: 72,
  },

  eliminationText: {
    fontSize: 13,
    fontWeight: "800",
    color: LC.danger,
    letterSpacing: 3,
    textTransform: "uppercase",
  },

  eliminationName: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },

  eliminationQuip: {
    fontSize: 11,
    fontWeight: "500",
    fontStyle: "italic",
    color: LC.textSecondary,
    marginTop: 2,
    textAlign: "center",
    paddingHorizontal: 20,
  },
});
