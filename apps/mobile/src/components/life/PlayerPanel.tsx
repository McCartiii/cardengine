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

  // ── Delta indicator (floats absolutely — doesn't push life number) ────────
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

  // ── Zone press feedback ──────────────────────────────────────────────────
  const decPressScale = useRef(new Animated.Value(1)).current;
  const incPressScale = useRef(new Animated.Value(1)).current;

  const isLow = player.life > 0 && player.life <= 5;
  const isDead = player.isDead || player.life <= 0;

  // Low-life animation
  useEffect(() => {
    if (isLow) {
      lowPulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(lowPulse, { toValue: 1, duration: 650, useNativeDriver: true }),
          Animated.timing(lowPulse, { toValue: 0, duration: 650, useNativeDriver: true }),
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
    outputRange: [0, 0.3],
  });

  // ── Hold-to-repeat ───────────────────────────────────────────────────────
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdSpeed = useRef(300);

  // ── Core delta application ───────────────────────────────────────────────
  const applyDelta = useCallback(
    (delta: number) => {
      changeLife(player.id, delta);
      Haptics.selectionAsync();

      // Bounce: scale up on gain, compress on loss, spring back
      Animated.sequence([
        Animated.timing(numScale, {
          toValue: delta > 0 ? 1.22 : 0.84,
          duration: 60,
          useNativeDriver: true,
        }),
        Animated.spring(numScale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 32,
          bounciness: 5,
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
          Animated.timing(deltaFade, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(deltaSlide, { toValue: -24, duration: 500, useNativeDriver: true }),
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

  const pressIn = (anim: Animated.Value) =>
    Animated.spring(anim, { toValue: 0.91, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const pressOut = (anim: Animated.Value) =>
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 4 }).start();

  const cmdTotal = Object.values(player.commanderDamage).reduce((a, b) => a + b, 0);

  const lifeSize = compact ? 72 : 100;
  const deltaSize = compact ? 22 : 28;
  const glyphSize = compact ? 34 : 48;

  // 22% opacity tint so panels are clearly distinct
  const panelBg = `${color}38`;
  // 60% opacity strip at bottom edge — player's accent color
  const stripColor = `${color}99`;

  return (
    <View style={[styles.panel, { backgroundColor: panelBg }]}>
      {/* Low-life red pulse */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: "#ef4444", opacity: lowPulseOpacity }]}
        pointerEvents="none"
      />

      {/* Coloured accent strip at bottom */}
      <View style={[styles.accentStrip, { backgroundColor: stripColor }]} pointerEvents="none" />

      {/* Death overlay */}
      {isDead && (
        <View style={[StyleSheet.absoluteFill, styles.deadOverlay]} pointerEvents="none">
          <Ionicons name="skull-outline" size={compact ? 38 : 52} color="rgba(255,255,255,0.22)" />
          <Text style={[styles.deadText, compact && styles.deadTextCompact]}>DEFEATED</Text>
        </View>
      )}

      {/* Commander damage badge */}
      {isCommander && (
        <TouchableOpacity
          style={styles.cmdBadge}
          onPress={onCommanderPress}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={cmdTotal > 0 ? "skull" : "skull-outline"}
            size={13}
            color={cmdTotal >= 21 ? "#f87171" : "rgba(255,255,255,0.45)"}
          />
          {cmdTotal > 0 && (
            <Text style={[styles.cmdBadgeText, cmdTotal >= 21 && styles.cmdBadgeLethal]}>
              {cmdTotal}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* Life number — truly centered; delta floats above it */}
      <View style={styles.center} pointerEvents="none">
        <Animated.Text
          style={[
            styles.lifeNum,
            {
              fontSize: lifeSize,
              lineHeight: lifeSize,
              color: isDead ? "rgba(255,255,255,0.18)" : "#ffffff",
              transform: [{ scale: numScale }],
            },
          ]}
        >
          {player.life}
        </Animated.Text>
        <Text style={[styles.playerName, compact && styles.playerNameCompact]}>
          {player.name}
        </Text>
      </View>

      {/* Delta — absolutely positioned above center, slides up and fades */}
      <Animated.Text
        style={[
          styles.delta,
          {
            fontSize: deltaSize,
            top: compact ? "14%" : "18%",
            opacity: deltaFade,
            transform: [{ translateY: deltaSlide }],
            color: (displayDelta ?? 0) >= 0 ? "#4ade80" : "#f87171",
          },
        ]}
        pointerEvents="none"
      >
        {displayDelta !== null
          ? displayDelta > 0
            ? `+${displayDelta}`
            : `${displayDelta}`
          : ""}
      </Animated.Text>

      {/* Left zone — decrement, with visible pill background + scale feedback */}
      <Animated.View
        style={[styles.zoneWrap, styles.zoneLeft, { transform: [{ scale: decPressScale }] }]}
      >
        <TouchableOpacity
          style={styles.zoneTouchable}
          onPress={() => applyDelta(-1)}
          onLongPress={() => startHold(-1)}
          onPressIn={() => pressIn(decPressScale)}
          onPressOut={() => { pressOut(decPressScale); stopHold(); }}
          delayLongPress={350}
          activeOpacity={1}
        >
          <View style={styles.zonePill}>
            <Text style={[styles.zoneGlyph, { fontSize: glyphSize }]}>−</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Right zone — increment */}
      <Animated.View
        style={[styles.zoneWrap, styles.zoneRight, { transform: [{ scale: incPressScale }] }]}
      >
        <TouchableOpacity
          style={styles.zoneTouchable}
          onPress={() => applyDelta(1)}
          onLongPress={() => startHold(1)}
          onPressIn={() => pressIn(incPressScale)}
          onPressOut={() => { pressOut(incPressScale); stopHold(); }}
          delayLongPress={350}
          activeOpacity={1}
        >
          <View style={styles.zonePill}>
            <Text style={[styles.zoneGlyph, { fontSize: glyphSize }]}>+</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    overflow: "hidden",
    position: "relative",
  },
  accentStrip: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  lifeNum: {
    fontWeight: "900",
    letterSpacing: -2,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  playerName: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  playerNameCompact: {
    fontSize: 9,
  },
  delta: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  zoneWrap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "38%",
    justifyContent: "center",
  },
  zoneLeft: { left: 0 },
  zoneRight: { right: 0 },
  zoneTouchable: {
    flex: 1,
    justifyContent: "center",
  },
  zonePill: {
    marginHorizontal: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
  },
  zoneGlyph: {
    color: "rgba(255,255,255,0.55)",
    fontWeight: "200",
    lineHeight: 56,
  },
  deadOverlay: {
    backgroundColor: "rgba(0,0,0,0.68)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    zIndex: 10,
  },
  deadText: {
    color: "rgba(255,255,255,0.28)",
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
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    zIndex: 5,
  },
  cmdBadgeText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: "700",
  },
  cmdBadgeLethal: {
    color: "#f87171",
  },
});
