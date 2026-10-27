// One player's panel: a big life total on their color, tap the left half to
// lose life and the right half to gain it (hold for tens). Every change has a
// little hit or heal effect; low life gets a heartbeat; a knocked-out player
// gets a skull, and can be healed back in. The panel flips over to show the
// player's counters and commander damage.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { font } from "@/design/fonts";
import { highestCommanderDamage, outReason, type LifeGame, type LifePlayer } from "@/lib/lifeGame";
import { COUNTER_INFO, DANGER_LIFE, OUT_LABEL, PLAYER_COLORS } from "@/lib/lifeConstants";
import { FIRST_BANNERS, LOW_LIFE_LINES, TURN_BANNERS, damageCallout, healCallout, knockoutLine, pick } from "@/lib/flavor";
import { Image } from "expo-image";
import { useLifeStore } from "@/store/lifeStore";
import { damageBurst, healBurst, starBurst, useEffectsLayer } from "./effects";
import { Aurora, Halo, Sheen } from "./ambience";
import { CountersBack } from "./CountersBack";
import { feel } from "./feel";

const RADIUS = 26;
const HOLD_STEP = 10;
const HOLD_REPEAT_MS = 520;

export interface PanelProps {
  player: LifePlayer;
  game: LifeGame;
  width: number;
  height: number;
  active: boolean;
  turnsOn: boolean;
  clockLeft: number | null;
  clockRunning: boolean;
  highlighted: boolean;
  winner: boolean;
}

export function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function PlayerPanel({ player, game, width, height, active, turnsOn, clockLeft, clockRunning, highlighted, winner }: PanelProps) {
  const life = useLifeStore((s) => s.life);
  const passTurn = useLifeStore((s) => s.passTurn);
  const undoNonce = useLifeStore((s) => s.undoNonce);
  const color = PLAYER_COLORS[player.color];
  const reason = outReason(player);
  const out = reason !== null;
  const danger = !out && player.life <= DANGER_LIFE;

  const { add: addEffects, layer: effects } = useEffectsLayer();
  const [showBack, setShowBack] = useState(false);

  // ── Sizes ──
  const short = Math.min(width, height);
  const lifeSize = Math.max(44, Math.min(150, Math.min(width * 0.42, height * 0.52)));
  const compact = short < 200;
  const center = { x: width / 2, y: height / 2 - (compact ? 6 : 10) };

  // ── Animated values ──
  const numScale = useSharedValue(1);
  const numShift = useSharedValue(0);
  const shake = useSharedValue(0);
  const tint = useSharedValue(0); // -1 damage red … 1 heal green
  const flash = useSharedValue(0);
  const beat = useSharedValue(0);
  const glow = useSharedValue(0);
  const flip = useSharedValue(0);
  const outP = useSharedValue(out ? 1 : 0);
  const highlight = useSharedValue(0);
  const deltaP = useSharedValue(0);
  const bloom = useSharedValue(0);
  const hurt = useSharedValue(0);
  const banner = useSharedValue(0);
  const stamp = useSharedValue(out ? 1 : 0);
  const seat = Number(player.id.slice(1)) || 0;

  // ── Running delta ("-3") shown beside the total ──
  const [delta, setDelta] = useState(0);
  const deltaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── React to life changes from anywhere (taps, commander damage) but not undo ──
  const prevLife = useRef(player.life);
  const prevUndo = useRef(undoNonce);
  useEffect(() => {
    const d = player.life - prevLife.current;
    prevLife.current = player.life;
    const undone = prevUndo.current !== undoNonce;
    prevUndo.current = undoNonce;
    if (d === 0) return;
    if (undone) {
      setDelta(0);
      return;
    }
    const big = Math.abs(d) >= 5;
    tint.value = d < 0 ? -1 : 1;
    tint.value = withTiming(0, { duration: 700 });
    if (d < 0) {
      numShift.value = withSequence(withTiming(big ? 10 : 5, { duration: 70 }), withSpring(0, { damping: 9, stiffness: 260 }));
      numScale.value = withSequence(withTiming(big ? 0.88 : 0.94, { duration: 70 }), withSpring(1, { damping: 8, stiffness: 240 }));
      shake.value = withSequence(
        withTiming(big ? -14 : -6, { duration: 45 }),
        withTiming(big ? 12 : 5, { duration: 55 }),
        withTiming(big ? -8 : -3, { duration: 50 }),
        withTiming(0, { duration: 60 })
      );
      if (big) flash.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 560 }));
      hurt.value = withSequence(withTiming(big ? 1 : 0.6, { duration: 70 }), withTiming(0, { duration: big ? 900 : 550 }));
      addEffects([
        ...damageBurst(center.x, center.y, Math.min(10, Math.abs(d) + (big ? 3 : 0))),
        { kind: "wave", x: center.x, y: center.y, color: "rgba(255,200,210,0.9)", size: short * (big ? 1.7 : 0.95), width: big ? 7 : 3 },
        ...(big ? [{ kind: "wave" as const, x: center.x, y: center.y, color: "rgba(255,60,90,0.8)", size: short * 2.3, width: 4, delay: 90 }] : []),
        { kind: "text", x: center.x + lifeSize * 0.15, y: center.y - lifeSize * 0.35, text: `${d}`, color: "#FFE1E5", size: big ? lifeSize * 0.5 : lifeSize * 0.3 },
      ]);
      const shout = damageCallout(d);
      if (shout) addEffects([{ kind: "text", x: center.x, y: center.y + lifeSize * 0.85, text: shout, color: "#FFFFFF", size: Math.max(16, lifeSize * 0.2) }]);
      if (big) feel.heavy();
    } else {
      numScale.value = withSequence(withTiming(big ? 1.14 : 1.07, { duration: 90 }), withSpring(1, { damping: 7, stiffness: 200 }));
      bloom.value = withSequence(withTiming(big ? 1 : 0.6, { duration: 120 }), withTiming(0, { duration: big ? 1000 : 650 }));
      addEffects([
        ...healBurst(center.x, center.y, color.glow, Math.min(8, d + (big ? 3 : 0))),
        { kind: "wave", x: center.x, y: center.y, color: "rgba(255,255,255,0.85)", size: short * (big ? 1.6 : 0.9), width: big ? 6 : 3 },
        { kind: "text", x: center.x + lifeSize * 0.15, y: center.y - lifeSize * 0.35, text: `+${d}`, color: "#E9FFF3", size: big ? lifeSize * 0.5 : lifeSize * 0.3 },
      ]);
      const cheer = healCallout(d);
      if (cheer) addEffects([{ kind: "text", x: center.x, y: center.y + lifeSize * 0.85, text: cheer, color: "#FFFFFF", size: Math.max(16, lifeSize * 0.2) }]);
      if (big) feel.medium();
    }
    setDelta((x) => x + d);
    deltaP.value = withSpring(1, { damping: 12, stiffness: 260 });
    if (deltaTimer.current) clearTimeout(deltaTimer.current);
    deltaTimer.current = setTimeout(() => {
      deltaP.value = withTiming(0, { duration: 260 });
      setTimeout(() => setDelta(0), 270);
    }, 1500);
    // Effects fire on value changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.life]);

  useEffect(() => () => {
    if (deltaTimer.current) clearTimeout(deltaTimer.current);
  }, []);

  // ── Heartbeat at low life ──
  const [lowLine, setLowLine] = useState("");
  useEffect(() => {
    if (danger) setLowLine(pick("low", LOW_LIFE_LINES));
  }, [danger]);
  useEffect(() => {
    if (danger) {
      beat.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 110, easing: Easing.out(Easing.quad) }),
          withTiming(0.2, { duration: 130 }),
          withTiming(0.75, { duration: 110 }),
          withTiming(0, { duration: 650, easing: Easing.inOut(Easing.quad) })
        ),
        -1
      );
    } else {
      cancelAnimation(beat);
      beat.value = withTiming(0, { duration: 200 });
    }
    // Shared values are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [danger]);

  // ── Turn glow, and a banner that swooshes across when the turn arrives ──
  const [bannerText, setBannerText] = useState("");
  useEffect(() => {
    if (active && turnsOn) {
      const first = game.turn <= 1;
      setBannerText(first ? pick("first", FIRST_BANNERS) : pick("turn", TURN_BANNERS));
      banner.value = 0;
      banner.value = withSequence(withSpring(1, { damping: 14, stiffness: 140 }), withDelay(900, withTiming(2, { duration: 380, easing: Easing.in(Easing.cubic) })));
      addEffects(starBurst(width / 2, height / 2, [color.glow, "#FFFFFF", "#FFE7A3"], first ? 30 : 16, short * (first ? 0.9 : 0.6)));
      feel.success();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  useEffect(() => {
    if (active) {
      glow.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0.45, { duration: 900 })), -1, true);
    } else {
      cancelAnimation(glow);
      glow.value = withTiming(0, { duration: 250 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // ── Knocked out / back in ──
  const wasOut = useRef(out);
  useEffect(() => {
    if (out && !wasOut.current) {
      feel.warning();
      stamp.value = 0;
      stamp.value = withDelay(180, withSpring(1, { damping: 9, stiffness: 160 }));
      shake.value = withSequence(withTiming(-18, { duration: 40 }), withTiming(16, { duration: 50 }), withTiming(-10, { duration: 50 }), withTiming(6, { duration: 50 }), withTiming(0, { duration: 60 }));
      addEffects([
        { kind: "wave", x: center.x, y: center.y, color: "rgba(255,40,70,0.95)", size: short * 2.4, width: 10 },
        { kind: "wave", x: center.x, y: center.y, color: "rgba(255,255,255,0.7)", size: short * 1.6, width: 4, delay: 120 },
        ...damageBurst(center.x, center.y, 10),
      ]);
    }
    if (!out) stamp.value = 0;
    if (!out && wasOut.current) feel.success();
    wasOut.current = out;
    outP.value = out ? withSpring(1, { damping: 11, stiffness: 120 }) : withTiming(0, { duration: 260 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [out]);

  useEffect(() => {
    highlight.value = withTiming(highlighted ? 1 : 0, { duration: highlighted ? 60 : 220 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlighted]);

  useEffect(() => {
    flip.value = withSpring(showBack ? 1 : 0, { damping: 16, stiffness: 140 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBack]);

  // ── Input ──
  const hold = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopHold = useCallback(() => {
    if (hold.current) clearInterval(hold.current);
    hold.current = null;
  }, []);
  useEffect(() => stopHold, [stopHold]);

  const ripple = (e: GestureResponderEvent, offsetX: number, sign: 1 | -1) => {
    const { locationX, locationY } = e.nativeEvent;
    addEffects([{ kind: "ripple", x: offsetX + (locationX ?? width / 4), y: locationY ?? height / 2, color: sign > 0 ? "#FFFFFF" : "#FF2D55", size: short * 0.9 }]);
  };

  const zone = (sign: 1 | -1) => ({
    onPress: (e: GestureResponderEvent) => {
      feel.light();
      ripple(e, sign > 0 ? width / 2 : 0, sign);
      life(player.id, sign);
    },
    onLongPress: (e: GestureResponderEvent) => {
      ripple(e, sign > 0 ? width / 2 : 0, sign);
      life(player.id, sign * HOLD_STEP);
      stopHold();
      hold.current = setInterval(() => life(player.id, sign * HOLD_STEP), HOLD_REPEAT_MS);
    },
    onPressOut: stopHold,
    delayLongPress: 380,
  });

  // ── Styles ──
  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${flip.value * 180}deg` }, { translateX: shake.value }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${flip.value * 180 - 180}deg` }],
  }));
  const numStyle = useAnimatedStyle(() => ({
    color: interpolateColor(tint.value, [-1, 0, 1], ["#FFD3D9", "#FFFFFF", "#DFFFEE"]),
    transform: [{ translateY: numShift.value }, { scale: numScale.value * (1 + beat.value * 0.07) }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.55 }));
  const dangerStyle = useAnimatedStyle(() => ({ opacity: 0.25 + beat.value * 0.55 }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const outStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, outP.value) }));
  const skullStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(outP.value, [0, 1], [-50, 0]) }, { rotate: `${interpolate(outP.value, [0, 1], [-25, 0])}deg` }, { scale: interpolate(outP.value, [0, 1], [0.4, 1]) }],
  }));
  const highlightStyle = useAnimatedStyle(() => ({ opacity: highlight.value * 0.45 }));
  const deltaStyle = useAnimatedStyle(() => ({ opacity: deltaP.value, transform: [{ scale: 0.7 + deltaP.value * 0.3 }] }));
  const bannerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(banner.value, [0, 0.4, 1, 1.6, 2], [0, 1, 1, 1, 0]),
    transform: [{ translateX: interpolate(banner.value, [0, 1, 2], [-width, 0, width]) }, { skewX: `${interpolate(banner.value, [0, 1, 2], [-14, 0, 14])}deg` }],
  }));
  const stampStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, stamp.value * 1.6),
    transform: [{ scale: interpolate(stamp.value, [0, 1], [2.6, 1]) }, { rotate: "-9deg" }],
  }));

  // ── Counter chips under the total ──
  const cmdHigh = highestCommanderDamage(player);
  const chips: Array<{ key: string; icon: React.ComponentProps<typeof Ionicons>["name"]; value: string; tint: string }> = [];
  if (player.poison > 0) chips.push({ key: "poison", icon: COUNTER_INFO.poison.icon, value: `${player.poison}`, tint: COUNTER_INFO.poison.tint });
  if (cmdHigh > 0) chips.push({ key: "cmd", icon: "shield", value: `${cmdHigh}`, tint: "#FF9AA8" });
  if (player.energy > 0) chips.push({ key: "energy", icon: COUNTER_INFO.energy.icon, value: `${player.energy}`, tint: COUNTER_INFO.energy.tint });
  if (player.experience > 0) chips.push({ key: "xp", icon: COUNTER_INFO.experience.icon, value: `${player.experience}`, tint: COUNTER_INFO.experience.tint });
  if (player.tax > 0) chips.push({ key: "tax", icon: COUNTER_INFO.tax.icon, value: `+${player.tax * 2}`, tint: COUNTER_INFO.tax.tint });

  const lowClock = clockLeft != null && clockLeft < 60_000;

  return (
    <View style={{ width, height }}>
      {/* ── Front ── */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.face, frontStyle]} pointerEvents={showBack ? "none" : "auto"}>
        {player.art ? (
          <>
            <Image source={{ uri: player.art.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
            {/* The player's color washes over the art so the total stays readable. */}
            <LinearGradient colors={[`${color.from}73`, `${color.to}D9`]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
          </>
        ) : (
          <LinearGradient colors={[color.from, color.to]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0.2, y: 0.55 }} style={StyleSheet.absoluteFill} />
        <Aurora width={width} height={height} color={color.glow} seed={seat} />
        <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.28)"]} start={{ x: 0.5, y: 0.5 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
        {!out && <Sheen width={width} height={height} seed={seat} />}
        {danger && (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, dangerStyle]}>
            <LinearGradient colors={["rgba(255,30,60,0)", "rgba(255,30,60,0.55)"]} start={{ x: 0.5, y: 0.2 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, styles.dangerRing]} />
          </Animated.View>
        )}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#FF1F45" }, flashStyle]} />

        {/* Tap halves */}
        <Pressable style={[styles.zone, { left: 0, width: width / 2 }]} {...zone(-1)} accessibilityRole="button" accessibilityLabel={`${player.name}: lose 1 life`}>
          <Text style={[styles.zoneGlyph, { left: compact ? 10 : 18 }]}>−</Text>
        </Pressable>
        <Pressable style={[styles.zone, { right: 0, width: width / 2 }]} {...zone(1)} accessibilityRole="button" accessibilityLabel={`${player.name}: gain 1 life`}>
          <Text style={[styles.zoneGlyph, { right: compact ? 10 : 18 }]}>+</Text>
        </Pressable>

        {/* Life total, with its halo */}
        <View pointerEvents="none" style={[styles.center, out && { opacity: 0 }]}>
          <Halo size={lifeSize * 2.4} bloom={bloom} hurt={hurt} />
        </View>
        <View pointerEvents="none" style={[styles.center, out && { opacity: 0 }]}>
          {winner && <Ionicons name="trophy" size={compact ? 20 : 26} color="#FFE7A3" style={{ marginBottom: -4 }} />}
          <Animated.Text
            accessibilityRole="text"
            accessibilityLabel={`${player.name} has ${player.life} life`}
            style={[styles.life, { fontSize: lifeSize, lineHeight: lifeSize * 1.06 }, numStyle]}
          >
            {player.life}
          </Animated.Text>
          {danger && lowLine !== "" && !compact && <Text style={styles.lowLine}>{lowLine}</Text>}
          {chips.length > 0 && (
            <View style={styles.chips}>
              {chips.map((c) => (
                <View key={c.key} style={styles.chip}>
                  <Ionicons name={c.icon} size={compact ? 11 : 13} color={c.tint} />
                  <Text style={[styles.chipText, compact && { fontSize: 12 }]}>{c.value}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {delta !== 0 && (
          <Animated.View pointerEvents="none" style={[styles.delta, { top: center.y - lifeSize * 0.62, left: center.x + lifeSize * 0.55 }, deltaStyle]}>
            <Text style={[styles.deltaText, { color: delta < 0 ? "#FFE1E5" : "#E2FFEF" }]}>{delta > 0 ? `+${delta}` : `${delta}`}</Text>
          </Animated.View>
        )}

        {/* Bottom: name, pass, counters */}
        <View style={[styles.bottomBar, compact && { paddingHorizontal: 10, paddingBottom: 8 }]}>
          {player.art && <Image source={{ uri: player.art.uri }} style={[styles.avatar, { borderColor: color.glow }]} contentFit="cover" />}
          <Text style={[styles.name, compact && { fontSize: 13 }]} numberOfLines={1}>
            {player.name}
          </Text>
          {clockLeft != null && (
            <View style={[styles.clock, active && clockRunning && styles.clockLive, lowClock && styles.clockLow]}>
              {active && clockRunning && <View style={styles.liveDot} />}
              <Text style={styles.clockText}>{formatClock(clockLeft)}</Text>
            </View>
          )}
          {active && turnsOn && !out && (
            <Pressable
              onPress={() => {
                feel.medium();
                passTurn();
              }}
              accessibilityRole="button"
              accessibilityLabel="Pass the turn"
              style={({ pressed }) => [styles.pass, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              <Text style={styles.passText}>Pass</Text>
              <Ionicons name="arrow-forward" size={14} color="#111" />
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              feel.tick();
              setShowBack(true);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${player.name}'s counters and commander damage`}
            style={({ pressed }) => [styles.more, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="ellipsis-horizontal" size={16} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* Knocked out */}
        {(out || wasOut.current) && (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.out, outStyle]}>
            <Animated.View style={skullStyle}>
              <Ionicons name="skull" size={compact ? 34 : 48} color="#FFFFFF" />
            </Animated.View>
            <Animated.View style={[styles.stamp, compact && { paddingHorizontal: 10, paddingVertical: 4 }, stampStyle]}>
              <Text style={[styles.stampText, compact && { fontSize: 15 }]}>{reason ? OUT_LABEL[reason].toUpperCase() : ""}</Text>
            </Animated.View>
            <Text style={styles.outQuip}>{compact ? `${player.life} life` : `${(reason ? knockoutLine(`${game.id}${player.id}`, reason) : "")} · ${player.life} life`}</Text>
            <Text style={styles.outHint}>Tap + to bring them back</Text>
          </Animated.View>
        )}

        {effects}
        <Animated.View pointerEvents="none" style={[styles.bannerWrap, bannerStyle]}>
          <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.bannerBand}>
            <Text style={[styles.bannerText, { fontSize: Math.max(18, Math.min(34, short * 0.15)) }]} numberOfLines={1}>
              {bannerText}
            </Text>
          </LinearGradient>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#FFFFFF" }, highlightStyle]} />
      </Animated.View>

      {/* ── Back: counters ── */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.face, styles.back, backStyle]} pointerEvents={showBack ? "auto" : "none"}>
        <LinearGradient colors={["#16171D", "#0E0F13"]} style={StyleSheet.absoluteFill} />
        <View style={[styles.backStripe, { backgroundColor: color.from }]} />
        {showBack && <CountersBack player={player} game={game} compact={compact} onClose={() => setShowBack(false)} />}
      </Animated.View>

      {/* Turn ring */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.turnRing, { shadowColor: color.glow }, glowStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  face: { borderRadius: RADIUS, overflow: "hidden", backfaceVisibility: "hidden" },
  back: { borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  backStripe: { position: "absolute", top: 0, left: 0, right: 0, height: 4 },
  zone: { position: "absolute", top: 0, bottom: 0, justifyContent: "center" },
  zoneGlyph: { position: "absolute", fontFamily: font.bold, fontSize: 30, color: "rgba(255,255,255,0.35)" },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  life: {
    fontFamily: font.heavy,
    letterSpacing: -3,
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(0,0,0,0.22)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 14,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 4, paddingHorizontal: 12 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, height: 24, paddingHorizontal: 8, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.28)" },
  chipText: { fontFamily: font.bold, fontSize: 13, color: "#FFFFFF", fontVariant: ["tabular-nums"] },
  delta: { position: "absolute", paddingHorizontal: 9, height: 28, borderRadius: 14, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.3)" },
  deltaText: { fontFamily: font.heavy, fontSize: 16, fontVariant: ["tabular-nums"] },
  clock: { flexDirection: "row", alignItems: "center", gap: 6, height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.25)" },
  clockLive: { backgroundColor: "rgba(0,0,0,0.45)" },
  clockLow: { backgroundColor: "#E5203E" },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#5CFFB0" },
  clockText: { fontFamily: font.bold, fontSize: 13, color: "#FFFFFF", fontVariant: ["tabular-nums"] },
  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  name: { flex: 1, fontFamily: font.bold, fontSize: 15, color: "rgba(255,255,255,0.92)", letterSpacing: -0.2 },
  pass: { flexDirection: "row", alignItems: "center", gap: 4, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: "#FFFFFF" },
  passText: { fontFamily: font.heavy, fontSize: 13, color: "#111" },
  more: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" },
  dangerRing: { borderRadius: RADIUS, borderWidth: 3, borderColor: "rgba(255,70,95,0.9)" },
  out: { alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: "rgba(9,9,13,0.84)" },
  avatar: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5 },
  lowLine: { fontFamily: font.bold, fontSize: 13, color: "#FFE1E5", marginTop: -2, letterSpacing: 0.2 },
  stamp: { marginTop: 10, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 3, borderColor: "#FF4D6A", borderRadius: 10, backgroundColor: "rgba(255,40,70,0.12)" },
  stampText: { fontFamily: font.heavy, fontSize: 20, letterSpacing: 2, color: "#FF6B83" },
  bannerWrap: { ...StyleSheet.absoluteFill, justifyContent: "center" },
  bannerBand: { paddingVertical: 10, alignItems: "center" },
  bannerText: { fontFamily: font.heavy, letterSpacing: 3, color: "#FFFFFF", textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  outTitle: { fontFamily: font.heavy, fontSize: 19, color: "#FFFFFF", marginTop: 6, letterSpacing: -0.3 },
  outQuip: { fontFamily: font.medium, fontSize: 13, color: "rgba(255,255,255,0.6)" },
  outHint: { position: "absolute", bottom: 14, fontFamily: font.semibold, fontSize: 11, color: "rgba(255,255,255,0.45)" },
  turnRing: {
    borderRadius: RADIUS,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowOpacity: 0.9,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
});
