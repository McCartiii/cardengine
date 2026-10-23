// Motion and foil effects that give the "Holo" direction its life.
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, LinearGradient as SvgGradient, Path, Polyline, Stop, Circle } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { blobs, color, holo } from "../design/tokens";
import { Text, type TextProps } from "./primitives";

/** Iridescent border that slowly rotates its colors. Children sit inside the ring. */
export function HoloRing({
  children,
  radius,
  thickness = 2,
  duration = 6000,
  style,
}: {
  children: React.ReactNode;
  radius: number;
  thickness?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withRepeat(withTiming(360, { duration, easing: Easing.linear }), -1, false);
  }, [turn, duration]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return (
    <View style={[{ borderRadius: radius, padding: thickness, overflow: "hidden" }, style]}>
      <Animated.View style={[styles.ringSpinner, spin]} pointerEvents="none">
        <LinearGradient colors={holo} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      {children}
    </View>
  );
}

function Blob({ size, left, top, tint, delay }: { size: number; left: number; top: number; tint: string; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [t, delay]);
  const drift = useAnimatedStyle(() => ({
    transform: [{ translateX: t.value * 30 }, { translateY: t.value * 20 }, { scale: 1 + t.value * 0.15 }],
  }));
  return (
    <Animated.View
      style={[{ position: "absolute", width: size, height: size, left, top, borderRadius: size / 2, backgroundColor: tint }, drift]}
    />
  );
}

const canBlur = Platform.OS === "ios" || Platform.OS === "web";

/** Drifting pastel blobs, softened by a blur, behind the top of a screen. */
export function HoloBackdrop({ height = 420 }: { height?: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: color.bg }]} pointerEvents="none">
      <View style={{ height, overflow: "hidden", opacity: canBlur ? 0.85 : 0.45 }}>
        <Blob size={280} left={-90} top={-100} tint={blobs[0]} delay={0} />
        <Blob size={250} left={220} top={30} tint={blobs[1]} delay={1500} />
        <Blob size={210} left={110} top={150} tint={blobs[2]} delay={3000} />
        {canBlur && <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={["rgba(243,244,250,0)", color.bg]} locations={[0.55, 1]} style={StyleSheet.absoluteFill} />
      </View>
    </View>
  );
}

/** A band of light that sweeps across its parent on a loop. Parent needs overflow hidden. */
export function FoilSweep({ width, delay = 0, strength = 0.55 }: { width: number; delay?: number; strength?: number }) {
  const x = useSharedValue(-1);
  useEffect(() => {
    x.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1.8, { duration: 2200, easing: Easing.inOut(Easing.quad) }), withTiming(1.8, { duration: 1400 })), -1, false)
    );
  }, [x, delay]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * width }, { rotate: "20deg" }] }));
  return (
    <Animated.View style={[styles.sweep, { width: width * 0.45 }, style]} pointerEvents="none">
      <LinearGradient
        colors={["rgba(255,255,255,0)", `rgba(255,255,255,${strength})`, `rgba(190,170,255,${strength * 0.6})`, "rgba(255,255,255,0)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/** Gently floats and turns its child, like a card held up to the light. */
export function Floaty({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t]);
  const float = useAnimatedStyle(() => ({
    transform: [
      { perspective: 700 },
      { rotateY: `${-9 + t.value * 18}deg` },
      { rotateX: `${4 - t.value * 7}deg` },
      { translateY: -t.value * 8 },
    ],
  }));
  return <Animated.View style={[float, style]}>{children}</Animated.View>;
}

interface TiltProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/** Pressable that tilts toward the finger and springs back. */
export function Tilt({ style, children, onPressIn, onPressOut, ...rest }: TiltProps) {
  const p = useSharedValue(0);
  const tilt = useAnimatedStyle(() => ({
    transform: [
      { perspective: 600 },
      { rotateY: `${-10 * p.value}deg` },
      { rotateX: `${6 * p.value}deg` },
      { translateY: -5 * p.value },
      { scale: 1 - 0.02 * p.value },
    ],
  }));
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        p.value = withSpring(1, { damping: 14, stiffness: 220 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        p.value = withSpring(0, { damping: 12, stiffness: 180 });
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, tilt]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Text that counts up to a number once, e.g. a collection value. */
export function CountUp({ value, format, duration = 900, ...text }: { value: number; format: (n: number) => string; duration?: number } & TextProps) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    const began = Date.now();
    let frame = 0;
    const step = () => {
      const k = Math.min(1, (Date.now() - began) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(start + (value - start) * eased);
      if (k < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return <Text {...text}>{format(shown)}</Text>;
}

/** Small price line with a soft fill; draws nothing for fewer than two points. */
export function Sparkline({
  values,
  width,
  height,
  stroke = color.accent,
}: {
  values: number[];
  width: number;
  height: number;
  stroke?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 4;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `M${pts[0][0]},${height} L${pts.map(([x, y]) => `${x},${y}`).join(" L")} L${pts[pts.length - 1][0]},${height} Z`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <SvgGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stroke} stopOpacity={0.28} />
          <Stop offset="1" stopColor={stroke} stopOpacity={0} />
        </SvgGradient>
      </Defs>
      <Path d={area} fill="url(#spark)" />
      <Polyline points={line} fill="none" stroke={stroke} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={lx} cy={ly} r={4} fill={stroke} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  ringSpinner: { position: "absolute", top: "-50%", left: "-50%", width: "200%", height: "200%" },
  sweep: { position: "absolute", top: "-40%", bottom: "-40%", left: 0 },
});
