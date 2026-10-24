// A binder page you can turn: drag sideways and the
// page lifts off the rings and folds over to reveal the next one.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { tap } from "./primitives";

type Direction = "next" | "prev";

interface FlipBookProps {
  pageCount: number;
  renderPage: (index: number) => React.ReactNode;
  /** Page the book opens on; change the component's key to reopen it. */
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  /** Corner radius of the pages, so the turning sheet matches them. */
  pageStyle?: StyleProp<ViewStyle>;
  /** Color of the back of a turning page. */
  backColor?: string;
}

export function FlipBook({ pageCount, renderPage, initialIndex = 0, onIndexChange, pageStyle, backColor = "#EEF0F5" }: FlipBookProps) {
  const [index, setIndex] = useState(Math.min(initialIndex, Math.max(0, pageCount - 1)));
  const [dir, setDir] = useState<Direction | null>(null);
  const [width, setWidth] = useState(0);
  // 0: the turning sheet lies flat on the right; 1: it has folded over to the left.
  const t = useSharedValue(0);
  const busy = useRef(false);

  // Keep the index valid when pages are removed (filters, search).
  useEffect(() => {
    if (index > pageCount - 1) setIndex(Math.max(0, pageCount - 1));
  }, [pageCount, index]);

  const latest = useRef({ index, pageCount, width, onIndexChange });
  latest.current = { index, pageCount, width, onIndexChange };

  const finish = (d: Direction, committed: boolean) => {
    const { index: i, onIndexChange: cb } = latest.current;
    if (committed) {
      const next = d === "next" ? i + 1 : i - 1;
      setIndex(next);
      cb?.(next);
      tap();
    }
    t.value = 0;
    setDir(null);
    busy.current = false;
  };

  // Settle with a spring so a flick carries its speed into the turn.
  const run = (d: Direction, commit: boolean, velocity = 0) => {
    const target = d === "next" ? (commit ? 1 : 0) : commit ? 0 : 1;
    t.value = withSpring(target, { damping: 22, stiffness: 150, mass: 0.9, velocity, overshootClamping: true }, (done) => {
      if (done) runOnJS(finish)(d, commit);
    });
  };

  const start = (d: Direction) => {
    const { index: i, pageCount: n } = latest.current;
    if (busy.current || (d === "next" ? i >= n - 1 : i <= 0)) return false;
    busy.current = true;
    t.value = d === "next" ? 0 : 1;
    setDir(d);
    return true;
  };

  const dragDir = useRef<Direction | null>(null);
  // Sideways drags turn pages; vertical ones fail fast so the page still scrolls.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-12, 12])
        .failOffsetY([-14, 14])
        .onStart(() => {
          dragDir.current = null;
        })
        .onUpdate((e) => {
          // Pick the direction from the first real movement; the start event can report 0.
          if (!dragDir.current) {
            if (e.translationX === 0) return;
            const d: Direction = e.translationX < 0 ? "next" : "prev";
            if (!start(d)) return;
            dragDir.current = d;
          }
          const w = latest.current.width || 1;
          const p = dragDir.current === "next" ? -e.translationX / w : 1 - e.translationX / w;
          t.value = Math.min(1, Math.max(0, p));
        })
        .onEnd((e) => {
          const d = dragDir.current;
          if (!d) return;
          // Finger speed in page-widths per second; turning "next" moves t up as the finger moves left.
          const v = -e.velocityX / (latest.current.width || 1);
          const commit = d === "next" ? t.value > 0.3 || v > 0.6 : t.value < 0.7 || v < -0.6;
          run(d, commit, v);
          dragDir.current = null;
        })
        .onFinalize(() => {
          if (dragDir.current) run(dragDir.current, false);
          dragDir.current = null;
        }),
    // start/run read everything through refs and shared values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const half = width / 2;
  const sheetFront = useAnimatedStyle(() => ({
    transform: [{ perspective: 1400 }, { translateX: -half }, { rotateY: `${-180 * t.value}deg` }, { translateX: half }],
  }));
  // The back of the sheet: the same turn, flipped in place so it faces the other way.
  const sheetBack = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1400 },
      { translateX: -half },
      { rotateY: `${-180 * t.value}deg` },
      { translateX: half },
      { rotateY: "180deg" },
    ],
  }));
  // As the page lifts it dims slightly...
  const sheetShade = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0, 0.5], [0, 0.14], "clamp") }));
  // ...and its shadow falls across the page underneath, tightest when it's nearly flat.
  const baseShade = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.2, 0.85, 1], [0, 1, 0.25, 0], "clamp"),
    transform: [{ translateX: interpolate(t.value, [0, 0.5, 1], [width * 0.7, 0, -width * 0.2], "clamp") }],
  }));

  const sheetIndex = dir === "next" ? index : dir === "prev" ? index - 1 : null;
  const baseIndex = dir === "next" ? index + 1 : index;

  return (
    <GestureDetector gesture={pan}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View>
          {renderPage(baseIndex)}
          {dir && (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }, pageStyle]}>
              <Animated.View style={[styles.castShadow, { width: width * 0.6 }, baseShade]}>
                <LinearGradient
                  colors={["rgba(12,16,48,0)", "rgba(12,16,48,0.12)", "rgba(12,16,48,0)"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            </View>
          )}
        </View>

        {sheetIndex != null && width > 0 && (
          // Clipped so the folded-over sheet never covers what's left of the page.
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }, pageStyle]}>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.face, sheetBack]}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: backColor }, pageStyle]} />
            </Animated.View>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.face, sheetFront]}>
              {renderPage(sheetIndex)}
              <Animated.View style={[StyleSheet.absoluteFill, styles.shade, pageStyle, sheetShade]} />
            </Animated.View>
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  face: { backfaceVisibility: "hidden" },
  castShadow: { position: "absolute", top: 0, bottom: 0, left: 0 },
  shade: { backgroundColor: "#0B0E26" },
});
