// Things that keep the table feeling alive: slow aurora light drifting in
// each panel, a soft halo behind the life total, a foil sheen that sweeps
// across now and then, and sunrays for the winner.
import React, { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from "react-native-svg";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

let gradientId = 0;
const useGradientId = (prefix: string) => useMemo(() => `${prefix}${++gradientId}`, [prefix]);

/** A soft round glow, transparent at the edge. */
export function Glow({ size, color, opacity = 0.6 }: { size: number; color: string; opacity?: number }) {
  const id = useGradientId("glow");
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.55" stopColor={color} stopOpacity={opacity * 0.35} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
}

/** Two blobs of light drifting slowly around the panel. */
export function Aurora({ width, height, color, seed }: { width: number; height: number; color: string; seed: number }) {
  const a = useSharedValue(0);
  const b = useSharedValue(0);
  useEffect(() => {
    a.value = withRepeat(withTiming(1, { duration: 7000 + (seed % 3) * 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    b.value = withDelay(seed * 400, withRepeat(withTiming(1, { duration: 9000 + (seed % 2) * 1300, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => {
      cancelAnimation(a);
      cancelAnimation(b);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const big = Math.max(width, height) * 1.1;
  const small = Math.max(width, height) * 0.8;
  const one = useAnimatedStyle(() => ({
    transform: [{ translateX: -big * 0.35 + a.value * width * 0.55 }, { translateY: -big * 0.45 + a.value * height * 0.3 }, { scale: 0.9 + a.value * 0.2 }],
  }));
  const two = useAnimatedStyle(() => ({
    transform: [{ translateX: width - small * 0.55 - b.value * width * 0.5 }, { translateY: height - small * 0.5 - b.value * height * 0.4 }],
  }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      <Animated.View style={[styles.abs, one]}>
        <Glow size={big} color={color} opacity={0.55} />
      </Animated.View>
      <Animated.View style={[styles.abs, two]}>
        <Glow size={small} color="#FFFFFF" opacity={0.22} />
      </Animated.View>
    </View>
  );
}

/** A band of light that sweeps across the panel every few seconds, like foil catching the light. */
export function Sheen({ width, height, seed }: { width: number; height: number; seed: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      1200 + seed * 700,
      withRepeat(withSequence(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.cubic) }), withDelay(6500, withTiming(0, { duration: 0 }))), -1)
    );
    return () => cancelAnimation(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const band = Math.max(width, height) * 0.45;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: -band * 1.5 + p.value * (width + band * 2.5) }, { rotate: "18deg" }],
  }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      <Animated.View style={[{ position: "absolute", top: -height * 0.5, width: band, height: height * 2 }, style]}>
        <LinearGradient
          colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.16)", "rgba(255,255,255,0.32)", "rgba(255,255,255,0.16)", "rgba(255,255,255,0)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

/** The glow behind the life total: breathes gently, blooms on heals, flares red on hits. */
export function Halo({ size, bloom, hurt }: { size: number; bloom: SharedValue<number>; hurt: SharedValue<number> }) {
  const breathe = useSharedValue(0);
  useEffect(() => {
    breathe.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breathe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const white = useAnimatedStyle(() => ({
    opacity: 0.55 + breathe.value * 0.2 + bloom.value * 0.5,
    transform: [{ scale: 0.92 + breathe.value * 0.08 + bloom.value * 0.45 }],
  }));
  const red = useAnimatedStyle(() => ({ opacity: hurt.value, transform: [{ scale: 0.9 + hurt.value * 0.35 }] }));
  return (
    <View pointerEvents="none" style={{ position: "absolute", width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[styles.abs, white]}>
        <Glow size={size} color="#FFFFFF" opacity={0.42} />
      </Animated.View>
      <Animated.View style={[styles.abs, red]}>
        <Glow size={size} color="#FF2D55" opacity={0.75} />
      </Animated.View>
    </View>
  );
}

/** Slowly turning rays of light, for the winner. */
export function SunRays({ size, color = "#FFE7A3", rays = 18 }: { size: number; color?: string; rays?: number }) {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 16000, easing: Easing.linear }), -1);
    return () => cancelAnimation(spin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const id = useGradientId("rays");
  const r = size / 2;
  const half = Math.PI / rays / 2;
  const paths = Array.from({ length: rays }, (_, i) => {
    const t = (i / rays) * Math.PI * 2;
    const x1 = r + Math.cos(t - half) * r;
    const y1 = r + Math.sin(t - half) * r;
    const x2 = r + Math.cos(t + half) * r;
    const y2 = r + Math.sin(t + half) * r;
    return `M${r},${r} L${x1},${y1} L${x2},${y2} Z`;
  });
  return (
    <Animated.View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.55} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <G>
          {paths.map((d, i) => (
            <Path key={i} d={d} fill={`url(#${id})`} />
          ))}
        </G>
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  abs: { position: "absolute" },
});
