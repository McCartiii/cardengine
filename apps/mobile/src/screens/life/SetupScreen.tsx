// apps/mobile/src/screens/life/SetupScreen.tsx

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useLifeStore } from "../../store/lifeStore";
import {
  LC,
  LIFE_OPTIONS,
  TIMER_OPTIONS,
  type StartingLife,
  type TimerMinutes,
} from "../../lib/lifeConstants";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ── Shimmer animation on the start button ───────────────────────────────────

function ShimmerButton({ onPress }: { onPress: () => void }) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [shimmer]);

  const shimmerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(shimmer.value, [0, 1], [0.7, 1]);
    return { opacity };
  });

  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withTiming(0.98, { duration: 80 });
  };

  const handlePressOut = () => {
    scale.value = withTiming(1, { duration: 120 });
  };

  return (
    <Animated.View style={[styles.startButtonWrap, pressStyle]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.startButtonShimmer, shimmerStyle]} />
      <Pressable
        style={styles.startButton}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Text style={styles.startButtonText}>Start Game</Text>
      </Pressable>
    </Animated.View>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function SetupScreen() {
  const startingLife = useLifeStore((s) => s.startingLife);
  const playerCount = useLifeStore((s) => s.playerCount);
  const timerMinutes = useLifeStore((s) => s.timerMinutes);
  const setStartingLife = useLifeStore((s) => s.setStartingLife);
  const setPlayerCount = useLifeStore((s) => s.setPlayerCount);
  const setTimerMinutes = useLifeStore((s) => s.setTimerMinutes);
  const startGame = useLifeStore((s) => s.startGame);

  const handleSelectLife = (life: StartingLife) => {
    Haptics.selectionAsync();
    setStartingLife(life);
  };

  const handleSelectPlayers = (count: number) => {
    Haptics.selectionAsync();
    setPlayerCount(count);
  };

  const handleSelectTimer = (minutes: TimerMinutes | null) => {
    Haptics.selectionAsync();
    setTimerMinutes(minutes);
  };

  const handleStartGame = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startGame();
  };

  const totalMinutes = timerMinutes ?? null;
  const perPlayerMinutes = totalMinutes !== null ? Math.round(totalMinutes / playerCount) : null;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View style={styles.headerWrap}>
          <View style={styles.ambientGlow} />
          <Text style={styles.title}>New Game</Text>
          <Text style={styles.subtitle}>Configure your battle</Text>
        </View>

        {/* ── Starting Life ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Starting Life</Text>
          <View style={styles.optionRow}>
            {LIFE_OPTIONS.map((life) => {
              const active = startingLife === life;
              return (
                <TouchableOpacity
                  key={life}
                  style={[
                    styles.optionCard,
                    active && styles.optionCardActiveLife,
                  ]}
                  onPress={() => handleSelectLife(life)}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.optionNumber,
                      active ? styles.optionNumberActiveLife : styles.optionNumberInactive,
                    ]}
                  >
                    {life}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Player Count ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Players</Text>
          <View style={styles.optionRow}>
            {[2, 3, 4, 5, 6].map((count) => {
              const active = playerCount === count;
              return (
                <TouchableOpacity
                  key={count}
                  style={[
                    styles.optionCard,
                    active && styles.optionCardActivePlayers,
                  ]}
                  onPress={() => handleSelectPlayers(count)}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.optionNumber,
                      active ? styles.optionNumberActivePlayers : styles.optionNumberInactive,
                    ]}
                  >
                    {count}
                  </Text>
                  {/* Dots */}
                  <View style={styles.dotsRow}>
                    {Array.from({ length: count }).map((_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.dot,
                          active ? styles.dotActive : styles.dotInactive,
                        ]}
                      />
                    ))}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Timer ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Game Timer</Text>
          <View style={styles.optionRow}>
            {TIMER_OPTIONS.map((mins) => {
              const active = timerMinutes === mins;
              return (
                <TouchableOpacity
                  key={mins}
                  style={[
                    styles.optionCard,
                    active && styles.optionCardActiveTimer,
                  ]}
                  onPress={() => handleSelectTimer(mins)}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.optionNumber,
                      active ? styles.optionNumberActiveTimer : styles.optionNumberInactive,
                    ]}
                  >
                    {mins}
                  </Text>
                  <Text
                    style={[
                      styles.optionUnit,
                      active ? styles.optionUnitActiveTimer : styles.optionUnitInactive,
                    ]}
                  >
                    min
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* No Timer chip */}
          <TouchableOpacity
            style={[
              styles.noTimerChip,
              timerMinutes === null && styles.noTimerChipActive,
            ]}
            onPress={() => handleSelectTimer(null)}
            activeOpacity={0.75}
          >
            <Text
              style={[
                styles.noTimerText,
                timerMinutes === null ? styles.noTimerTextActive : styles.noTimerTextInactive,
              ]}
            >
              No Timer
            </Text>
          </TouchableOpacity>

          {/* Timer summary bar */}
          {totalMinutes !== null && perPlayerMinutes !== null && (
            <View style={styles.timerSummaryBar}>
              <Text style={styles.timerSummaryText}>
                <Text style={styles.timerSummaryHighlight}>{perPlayerMinutes}</Text>
                <Text style={styles.timerSummaryMuted}> min per player  ·  </Text>
                <Text style={styles.timerSummaryHighlight}>{totalMinutes}</Text>
                <Text style={styles.timerSummaryMuted}> min total</Text>
              </Text>
            </View>
          )}
        </View>

        {/* Spacer so content isn't hidden behind pinned button */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* ── Pinned start button ── */}
      <View style={styles.startContainer}>
        <View style={styles.bottomGlow} />
        <ShimmerButton onPress={handleStartGame} />
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: LC.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 20,
  },

  // Header
  headerWrap: {
    alignItems: "center",
    marginBottom: 36,
    position: "relative",
  },
  ambientGlow: {
    position: "absolute",
    top: -40,
    left: "10%",
    right: "10%",
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(13,148,136,0.06)",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: LC.textPrimary,
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: LC.textMuted,
    letterSpacing: 0.5,
  },

  // Sections
  section: {
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: LC.textMuted,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 10,
  },

  // Option row
  optionRow: {
    flexDirection: "row",
    gap: 8,
  },

  // Option cards
  optionCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(30,45,61,0.4)",
    backgroundColor: "rgba(255,255,255,0.015)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  optionCardActiveLife: {
    borderColor: LC.accentText,
    backgroundColor: "rgba(45,212,191,0.07)",
  },
  optionCardActivePlayers: {
    borderColor: "#38BDF8",
    backgroundColor: "rgba(56,189,248,0.07)",
  },
  optionCardActiveTimer: {
    borderColor: LC.warning,
    backgroundColor: "rgba(251,146,60,0.07)",
  },

  // Numbers
  optionNumber: {
    fontSize: 22,
    fontWeight: "700",
  },
  optionNumberInactive: {
    color: LC.textSecondary,
  },
  optionNumberActiveLife: {
    color: LC.accentText,
  },
  optionNumberActivePlayers: {
    color: "#38BDF8",
  },
  optionNumberActiveTimer: {
    color: LC.warning,
  },

  // Units ("min" text)
  optionUnit: {
    fontSize: 10,
    marginTop: 2,
  },
  optionUnitInactive: {
    color: LC.textMuted,
  },
  optionUnitActiveTimer: {
    color: LC.warning,
  },

  // Player dots
  dotsRow: {
    flexDirection: "row",
    marginTop: 6,
    gap: 2,
    flexWrap: "wrap",
    justifyContent: "center",
    maxWidth: 40,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  dotInactive: {
    backgroundColor: LC.textMuted,
    opacity: 0.4,
  },
  dotActive: {
    backgroundColor: "#38BDF8",
  },

  // No Timer chip
  noTimerChip: {
    marginTop: 8,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: "rgba(30,45,61,0.4)",
    backgroundColor: "rgba(255,255,255,0.015)",
    paddingVertical: 12,
    alignItems: "center",
  },
  noTimerChipActive: {
    borderColor: LC.textMuted,
    backgroundColor: "rgba(71,85,105,0.15)",
  },
  noTimerText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  noTimerTextInactive: {
    color: LC.textMuted,
  },
  noTimerTextActive: {
    color: LC.textSecondary,
  },

  // Timer summary bar
  timerSummaryBar: {
    marginTop: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "rgba(251,146,60,0.05)",
    borderWidth: 1,
    borderColor: "rgba(251,146,60,0.15)",
    alignItems: "center",
  },
  timerSummaryText: {
    fontSize: 12,
  },
  timerSummaryHighlight: {
    fontSize: 12,
    fontWeight: "700",
    color: LC.warning,
  },
  timerSummaryMuted: {
    fontSize: 12,
    color: LC.textMuted,
  },

  // Bottom spacer
  bottomSpacer: {
    height: 100,
  },

  // Start button container (pinned)
  startContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    paddingTop: 12,
  },
  bottomGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(13,148,136,0.1)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },

  // Shimmer button
  startButtonWrap: {
    borderRadius: 18,
    overflow: "hidden",
  },
  startButtonShimmer: {
    backgroundColor: LC.accent,
    borderRadius: 18,
  },
  startButton: {
    backgroundColor: "transparent",
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
});
