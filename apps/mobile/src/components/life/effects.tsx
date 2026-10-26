// Small one-shot effects for the life counter: tap ripples, heal sparks,
// damage shards and confetti. Each animates once on mount and removes itself.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { font } from "@/design/fonts";

type Done = () => void;

function useProgress(duration: number, delay: number, onDone: Done, easing = Easing.out(Easing.cubic)) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      delay,
      withTiming(1, { duration, easing }, (finished) => {
        if (finished) runOnJS(onDone)();
      })
    );
    // Runs once per effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return p;
}

export interface RippleSpec {
  kind: "ripple";
  x: number;
  y: number;
  color: string;
  size: number;
}

function Ripple({ x, y, color, size, onDone }: RippleSpec & { onDone: Done }) {
  const p = useProgress(560, 0, onDone);
  const style = useAnimatedStyle(() => ({
    opacity: 0.42 * (1 - p.value),
    transform: [{ scale: 0.15 + p.value * 1.25 }],
  }));
  return (
    <Animated.View
      style={[
        { position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

export interface ParticleSpec {
  kind: "particle";
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** Extra downward pull, for falling shards. */
  gravity: number;
  color: string;
  size: number;
  delay: number;
  duration: number;
  shape: "dot" | "plus" | "shard" | "heart";
  spin: number;
}

function Particle({ x, y, dx, dy, gravity, color, size, delay, duration, shape, spin, onDone }: ParticleSpec & { onDone: Done }) {
  const p = useProgress(duration, delay, onDone, Easing.out(Easing.quad));
  const style = useAnimatedStyle(() => ({
    opacity: p.value < 0.15 ? p.value / 0.15 : 1 - (p.value - 0.15) / 0.85,
    transform: [
      { translateX: dx * p.value },
      { translateY: dy * p.value + gravity * p.value * p.value },
      { rotate: `${spin * p.value}deg` },
      { scale: 1 - 0.35 * p.value },
    ],
  }));
  const box = { position: "absolute" as const, left: x - size / 2, top: y - size / 2, width: size, height: size };
  if (shape === "plus" || shape === "heart") {
    return (
      <Animated.View style={[box, { alignItems: "center", justifyContent: "center" }, style]}>
        <Ionicons name={shape === "plus" ? "add" : "heart"} size={size} color={color} />
      </Animated.View>
    );
  }
  return (
    <Animated.View
      style={[
        box,
        shape === "dot"
          ? { borderRadius: size / 2, backgroundColor: color }
          : { width: size * 0.45, height: size, borderRadius: 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

export interface WaveSpec {
  kind: "wave";
  x: number;
  y: number;
  color: string;
  size: number;
  /** Ring thickness. */
  width: number;
  delay?: number;
}

/** A ring that expands from a point and fades, like a shockwave. */
function Wave({ x, y, color, size, width, delay = 0, onDone }: WaveSpec & { onDone: Done }) {
  const p = useProgress(650, delay, onDone, Easing.out(Easing.exp));
  const style = useAnimatedStyle(() => ({
    opacity: p.value < 0.1 ? p.value * 10 : 1 - p.value,
    transform: [{ scale: 0.15 + p.value * 0.85 }],
  }));
  return (
    <Animated.View
      style={[
        { position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size / 2, borderWidth: width, borderColor: color },
        style,
      ]}
    />
  );
}

export interface FlyTextSpec {
  kind: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
}

/** A number that pops out of the total and flies up. */
function FlyText({ x, y, text, color, size, onDone }: FlyTextSpec & { onDone: Done }) {
  const p = useProgress(900, 0, onDone, Easing.out(Easing.cubic));
  const style = useAnimatedStyle(() => ({
    opacity: p.value < 0.6 ? 1 : 1 - (p.value - 0.6) / 0.4,
    transform: [
      { translateY: -size * 1.6 * p.value },
      { scale: p.value < 0.18 ? 0.5 + (p.value / 0.18) * 0.75 : 1.25 - (p.value - 0.18) * 0.35 },
    ],
  }));
  return (
    <Animated.Text
      style={[
        {
          position: "absolute",
          left: x - Math.max(size * 4, text.length * size * 0.72) / 2,
          width: Math.max(size * 4, text.length * size * 0.72),
          top: y - size * 0.6,
          textAlign: "center",
          fontFamily: font.heavy,
          fontSize: size,
          color,
          textShadowColor: "rgba(0,0,0,0.35)",
          textShadowOffset: { width: 0, height: 3 },
          textShadowRadius: 10,
        },
        style,
      ]}
    >
      {text}
    </Animated.Text>
  );
}

export type EffectSpec = RippleSpec | ParticleSpec | WaveSpec | FlyTextSpec;

let nextId = 1;

/** A layer of effects plus a function to add more. Render `layer` last so it sits on top. */
export function useEffectsLayer() {
  const [items, setItems] = useState<Array<EffectSpec & { id: number }>>([]);
  const add = useCallback((specs: EffectSpec[]) => {
    setItems((prev) => [...prev.slice(-48), ...specs.map((s) => ({ ...s, id: nextId++ }))]);
  }, []);
  const remove = useCallback((id: number) => setItems((prev) => prev.filter((i) => i.id !== id)), []);
  const layer = (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {items.map((it) => {
        const done = () => remove(it.id);
        switch (it.kind) {
          case "ripple":
            return <Ripple key={it.id} {...it} onDone={done} />;
          case "wave":
            return <Wave key={it.id} {...it} onDone={done} />;
          case "text":
            return <FlyText key={it.id} {...it} onDone={done} />;
          default:
            return <Particle key={it.id} {...it} onDone={done} />;
        }
      })}
    </View>
  );
  return { add, layer };
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Sparks that float up from (x, y) when a player gains life. */
export function healBurst(x: number, y: number, tint: string, strength: number): ParticleSpec[] {
  const n = Math.min(14, 5 + strength * 2);
  return Array.from({ length: n }, (_, i) => ({
    kind: "particle" as const,
    x: x + rand(-40, 40),
    y: y + rand(-10, 20),
    dx: rand(-26, 26),
    dy: rand(-120, -70),
    gravity: 0,
    color: i % 3 === 0 ? "#FFFFFF" : tint,
    size: i % 4 === 0 ? rand(14, 20) : rand(5, 9),
    delay: i * 22,
    duration: rand(700, 1000),
    shape: i % 4 === 0 ? ("plus" as const) : ("dot" as const),
    spin: 0,
  }));
}

/** Shards that burst out and fall when a player takes damage. */
export function damageBurst(x: number, y: number, strength: number): ParticleSpec[] {
  const n = Math.min(16, 5 + strength * 2);
  return Array.from({ length: n }, (_, i) => {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(50, 90 + strength * 8);
    return {
      kind: "particle" as const,
      x,
      y,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed - 20,
      gravity: 90,
      color: i % 3 === 0 ? "#FFFFFF" : "#FF5A6E",
      size: rand(7, 13),
      delay: 0,
      duration: rand(550, 800),
      shape: "shard" as const,
      spin: rand(-260, 260),
    };
  });
}

/** Sparks flying out in every direction from (x, y). */
export function starBurst(x: number, y: number, colors: string[], count = 22, reach = 160): ParticleSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + rand(-0.15, 0.15);
    const speed = rand(reach * 0.55, reach);
    return {
      kind: "particle" as const,
      x,
      y,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      gravity: 30,
      color: colors[i % colors.length],
      size: i % 3 === 0 ? rand(14, 18) : rand(6, 10),
      delay: rand(0, 60),
      duration: rand(700, 1050),
      shape: i % 3 === 0 ? ("plus" as const) : ("dot" as const),
      spin: rand(-180, 180),
    };
  });
}

// ── Confetti ────────────────────────────────────────────────────────────────

function ConfettiPiece({ x, delay, duration, color, w, h, spin, drift, height }: { x: number; delay: number; duration: number; color: string; w: number; h: number; spin: number; drift: number; height: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration, easing: Easing.in(Easing.quad) }));
    // Runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: p.value > 0.85 ? (1 - p.value) / 0.15 : 1,
    transform: [
      { translateY: -40 + p.value * (height + 80) },
      { translateX: Math.sin(p.value * Math.PI * 3) * drift },
      { rotate: `${p.value * spin}deg` },
      { rotateX: `${p.value * spin * 1.5}deg` },
    ],
  }));
  return <Animated.View style={[{ position: "absolute", top: 0, left: x, width: w, height: h, borderRadius: 2, backgroundColor: color }, style]} />;
}

export function Confetti({ colors, count = 70 }: { colors: string[]; count?: number }) {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        key: i,
        x: rand(0, width),
        delay: rand(0, 900),
        duration: rand(1900, 3200),
        color: colors[i % colors.length],
        w: rand(6, 10),
        h: rand(10, 16),
        spin: rand(-720, 720),
        drift: rand(10, 40),
      })),
    [colors, count, width]
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map(({ key, ...p }) => (
        <ConfettiPiece key={key} {...p} height={height} />
      ))}
    </View>
  );
}
