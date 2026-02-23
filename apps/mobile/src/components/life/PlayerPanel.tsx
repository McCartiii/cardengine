import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLifeStore, type Player, PLAYER_COLORS } from "../../store/lifeStore";

interface Props {
  player: Player;
  playerIndex: number;
  isCommander: boolean;
  allPlayers: Player[];
  /** Smaller text for 4-player quadrant layout */
  compact?: boolean;
  onCommanderPress?: () => void;
}

export function PlayerPanel({
  player,
  playerIndex,
  isCommander,
  compact = false,
  onCommanderPress,
}: Props) {
  const { changeLife } = useLifeStore();
  const color = PLAYER_COLORS[playerIndex] ?? PLAYER_COLORS[0];

  // ── Delta indicator ──────────────────────────────────────────────────────
  const accDelta = useRef(0);
  const [displayDelta, setDisplayDelta] = useState<number | null>(null);
  const deltaFade = useRef(new Animated.Value(0)).current;
  const deltaSlide = useRef(new Animated.Value(0)).current;
  const deltaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Number bounce ────────────────────────────────────────────────────────
  const numScale = useRef(new Animated.Value(1)).current;

  // ── Low-life pulse ───────────────────────────────────────────────────────
  const lowPulse = useRef(new Animated.Value(0)).current;
  const lowPulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const isLow = player.life > 0 && player.life <= 5;
  const isDead = player.isDead || player.life <= 0;

  useEffect(() => {
    if (isLow) {
      lowPulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(lowPulse, {
            toValue: 1,
            duration: 650,
            useNativeDriver: true,
          }),
          Animated.timing(lowPulse, {
            toValue: 0,
            duration: 650,
            useNativeDriver: true,
          }),
        ])
      );
      lowPulseLoop.current.start();
    } else {
      lowPulseLoop.current?.stop();
      lowPulse.setValue(0);
    }
    return () => lowPulseLoop.current?.stop();
  }, [isLow, lowPulse]);

  const lowPulseOpacity = lowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.25],
  });

  // ── Hold-to-repeat ───────────────────────────────────────────────────────
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdSpeed = useRef(300);

  // ── Core delta application ───────────────────────────────────────────────
  const applyDelta = useCallback(
    (delta: number) => {
      changeLife(player.id, delta);
      Haptics.selectionAsync();

      // Bounce the life number
      Animated.sequence([
        Animated.timing(numScale, {
          toValue: delta > 0 ? 1.2 : 0.86,
          duration: 65,
          useNativeDriver: true,
        }),
        Animated.spring(numScale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 30,
          bounciness: 4,
        }),
      ]).start();

      // Accumulate delta and (re)start fade-out timer
      accDelta.current += delta;
      setDisplayDelta(accDelta.current);
      deltaFade.setValue(1);
      deltaSlide.setValue(0);

      if (deltaTimer.current) clearTimeout(deltaTimer.current);
      deltaTimer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(deltaFade, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(deltaSlide, {
            toValue: -20,
            duration: 500,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setDisplayDelta(null);
          accDelta.current = 0;
        });
      }, 1400);
    },
    [changeLife, player.id, numScale, deltaFade, deltaSlide]
  );

  const startHold = useCallback(
    (delta: number) => {
      holdSpeed.current = 320;
      const fire = () => {
        applyDelta(delta);
        holdSpeed.current = Math.max(55, holdSpeed.current * 0.8);
        holdTimer.current = setTimeout(fire, holdSpeed.current);
      };
      holdTimer.current = setTimeout(fire, 400);
    },
    [applyDelta]
  );

  const stopHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  // ── Commander damage total ───────────────────────────────────────────────
  const cmdTotal = Object.values(player.commanderDamage).reduce(
    (a, b) => a + b,
    0
  );

  const lifeSize = compact ? 68 : 96;
  const deltaSize = compact ? 20 : 26;

  return (
    <View style={[styles.panel, { backgroundColor: `${color}18` }]}>
      {/* Low-life red pulse */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "#ef4444", opacity: lowPulseOpacity },
        ]}
        pointerEvents="none"
      />

      {/* Death overlay */}
      {isDead && (
        <View style={[StyleSheet.absoluteFill, styles.deadOverlay]} pointerEvents="none">
          <Ionicons name="skull-outline" size={compact ? 36 : 48} color="rgba(255,255,255,0.2)" />
          <Text style={[styles.deadText, compact && styles.deadTextCompact]}>
            DEFEATED
          </Text>
        </View>
      )}

      {/* Commander damage badge (top-right corner) */}
      {isCommander && (
        <TouchableOpacity
          style={styles.cmdBadge}
          onPress={onCommanderPress}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={cmdTotal > 0 ? "skull" : "skull-outline"}
            size={12}
            color={cmdTotal >= 21 ? "#f87171" : "rgba(255,255,255,0.4)"}
          />
          {cmdTotal > 0 && (
            <Text
              style={[
                styles.cmdBadgeText,
                cmdTotal >= 21 && styles.cmdBadgeLethal,
              ]}
            >
              {cmdTotal}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* Center content — pointerEvents none so touch zones work */}
      <View style={styles.center} pointerEvents="none">
        {/* Floating delta */}
        <Animated.Text
          style={[
            styles.delta,
            {
              fontSize: deltaSize,
              opacity: deltaFade,
              transform: [{ translateY: deltaSlide }],
              color:
                (displayDelta ?? 0) >= 0 ? "#4ade80" : "#f87171",
            },
          ]}
        >
          {displayDelta !== null
            ? displayDelta > 0
              ? `+${displayDelta}`
              : `${displayDelta}`
            : ""}
        </Animated.Text>

        {/* Life total */}
        <Animated.Text
          style={[
            styles.lifeNum,
            {
              fontSize: lifeSize,
              lineHeight: lifeSize,
              color: isDead ? "rgba(255,255,255,0.2)" : "#ffffff",
              transform: [{ scale: numScale }],
            },
          ]}
        >
          {player.life}
        </Animated.Text>

        {/* Player name */}
        <Text style={[styles.playerName, compact && styles.playerNameCompact]}>
          {player.name}
        </Text>
      </View>

      {/* Left tap zone → −1 (or +1 for rotated top player) */}
      <TouchableOpacity
        style={styles.decrementZone}
        onPress={() => applyDelta(-1)}
        onLongPress={() => startHold(-1)}
        onPressOut={stopHold}
        delayLongPress={350}
        activeOpacity={0.3}
      >
        <Text style={[styles.zoneGlyph, compact && styles.zoneGlyphCompact]}>
          −
        </Text>
      </TouchableOpacity>

      {/* Right tap zone → +1 */}
      <TouchableOpacity
        style={styles.incrementZone}
        onPress={() => applyDelta(1)}
        onLongPress={() => startHold(1)}
        onPressOut={stopHold}
        delayLongPress={350}
        activeOpacity={0.3}
      >
        <Text style={[styles.zoneGlyph, compact && styles.zoneGlyphCompact]}>
          +
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    overflow: "hidden",
    position: "relative",
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  delta: {
    fontWeight: "800",
    letterSpacing: 0.5,
    minHeight: 32,
    textAlign: "center",
  },
  lifeNum: {
    fontWeight: "900",
    letterSpacing: -4,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  playerName: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 6,
  },
  playerNameCompact: {
    fontSize: 9,
    marginTop: 4,
  },
  decrementZone: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "40%",
    justifyContent: "center",
    alignItems: "flex-start",
    paddingLeft: 18,
  },
  incrementZone: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "40%",
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: 18,
  },
  zoneGlyph: {
    color: "rgba(255,255,255,0.18)",
    fontSize: 44,
    fontWeight: "200",
    lineHeight: 50,
  },
  zoneGlyphCompact: {
    fontSize: 32,
    lineHeight: 38,
  },
  deadOverlay: {
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    zIndex: 10,
  },
  deadText: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 3,
  },
  deadTextCompact: {
    fontSize: 10,
    letterSpacing: 2,
  },
  cmdBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    zIndex: 5,
  },
  cmdBadgeText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontWeight: "700",
  },
  cmdBadgeLethal: {
    color: "#f87171",
  },
});
