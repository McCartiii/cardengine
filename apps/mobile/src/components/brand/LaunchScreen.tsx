import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path, Rect } from "react-native-svg";
import { color } from "@/design/tokens";
import { MARK_CARD, MARK_RING, MARK_SIZE, WORDMARK_CAP, WORDMARK_CARD, WORDMARK_ENGINE, WORDMARK_WIDTH } from "./logoGeometry";

const TURN_MS = 1600;
// Long enough to read as a deliberate turn of the ring, not a flicker.
const MIN_VISIBLE_MS = 900;
const FADE_MS = 280;

/** The logo mark with its colour ring turning around a still card; use it as a loading spinner. */
export function SpinningMark({ size, cardColor = color.text }: { size: number; cardColor?: string }) {
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withRepeat(withTiming(360, { duration: TURN_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [turn]);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));

  const viewBox = `0 0 ${MARK_SIZE} ${MARK_SIZE}`;
  return (
    <View style={{ width: size, height: size }} accessibilityRole="progressbar" accessibilityLabel="Loading">
      <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
        <Svg width={size} height={size} viewBox={viewBox}>
          {MARK_RING.map((seg) => (
            <Path key={seg.fill} d={seg.d} fill={seg.fill} />
          ))}
        </Svg>
      </Animated.View>
      <Svg width={size} height={size} viewBox={viewBox} style={StyleSheet.absoluteFill}>
        <Rect
          x={MARK_CARD.x}
          y={MARK_CARD.y}
          width={MARK_CARD.width}
          height={MARK_CARD.height}
          rx={MARK_CARD.rx}
          transform={`rotate(${MARK_CARD.rotate} ${MARK_SIZE / 2} ${MARK_SIZE / 2})`}
          fill={cardColor}
        />
      </Svg>
    </View>
  );
}

// Must match the expo-splash-screen `imageWidth` in app.json.
const SPLASH_WIDTH = 320;

// Layout of assets/splash-icon.png (docs/brand/splash-icon.svg), as fractions of its width:
// ring 30% wide, wordmark 62% wide, 0.32 ring-widths between them, the pair centred.
const RING = 0.3 * SPLASH_WIDTH;
const MARK_BOX = (RING * 740) / 730; // the 100-unit mark box spans 740 units of the splash's ring scale
const WORD_W = 0.62 * SPLASH_WIDTH;
const CAP_H = (WORD_W * WORDMARK_CAP) / WORDMARK_WIDTH;
const GAP = 0.32 * RING;
const TOP = (SPLASH_WIDTH - (RING + GAP + CAP_H)) / 2;
// Round letters overshoot the cap height a little; pad the wordmark viewBox so they aren't clipped.
const WORD_PAD = 4;

/**
 * Stands in for the native splash screen: it draws the same picture at the same size,
 * so the handoff is invisible, then turns the ring until `ready` and fades away.
 */
export function LaunchScreen({ ready, onShown, onHidden }: { ready: boolean; onShown: () => void; onHidden: () => void }) {
  const opacity = useSharedValue(1);
  const shownAt = useRef(Date.now());

  useEffect(() => {
    if (!ready) return;
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current));
    const timer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: FADE_MS }, (finished) => {
        if (finished) runOnJS(onHidden)();
      });
    }, wait);
    return () => clearTimeout(timer);
  }, [ready, opacity, onHidden]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const wordScale = WORD_W / WORDMARK_WIDTH;

  return (
    <Animated.View style={[styles.root, fade]} onLayout={onShown} pointerEvents={ready ? "none" : "auto"}>
      <View style={styles.image}>
        <View style={{ position: "absolute", left: (SPLASH_WIDTH - MARK_BOX) / 2, top: TOP + RING / 2 - MARK_BOX / 2 }}>
          <SpinningMark size={MARK_BOX} />
        </View>
        <Svg
          width={WORD_W}
          height={CAP_H + 2 * WORD_PAD * wordScale}
          viewBox={`0 ${-WORD_PAD} ${WORDMARK_WIDTH} ${WORDMARK_CAP + 2 * WORD_PAD}`}
          style={{ position: "absolute", left: (SPLASH_WIDTH - WORD_W) / 2, top: TOP + RING + GAP - WORD_PAD * wordScale }}
        >
          <Path d={WORDMARK_CARD} fill={color.text} />
          <Path d={WORDMARK_ENGINE} fill={color.text} />
        </Svg>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: color.bg, alignItems: "center", justifyContent: "center", zIndex: 10 },
  image: { width: SPLASH_WIDTH, height: SPLASH_WIDTH },
});
