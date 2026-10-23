// A binder page you can turn: drag sideways (or tap the page corner) and the
// page lifts off the rings and folds over to reveal the next one.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { binder } from "../design/tokens";
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
  /** Show the curled corner that turns to the next page when tapped. */
  corner?: boolean;
}

const TURN_MS = 520;

export function FlipBook({ pageCount, renderPage, initialIndex = 0, onIndexChange, pageStyle, corner = true }: FlipBookProps) {
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

  const run = (d: Direction, commit: boolean, velocity = 0) => {
    const target = d === "next" ? (commit ? 1 : 0) : commit ? 0 : 1;
    const remaining = Math.abs(target - t.value);
    const duration = Math.max(160, (TURN_MS * remaining) / (1 + Math.min(2, Math.abs(velocity))));
    t.value = withTiming(target, { duration, easing: Easing.out(Easing.cubic) }, (done) => {
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

  const turn = (d: Direction) => {
    if (start(d)) run(d, true);
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
          const vx = e.velocityX / 1000;
          const commit = d === "next" ? t.value > 0.3 || vx < -0.4 : t.value < 0.7 || vx > 0.4;
          run(d, commit, vx);
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
  // The lifted page darkens as it turns away from the light...
  const sheetShade = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.5], [0, 0.35], "clamp"),
  }));
  // ...and casts a shadow on the page underneath.
  const baseShade = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.25, 0.9, 1], [0, 0.28, 0.08, 0], "clamp"),
  }));

  const sheetIndex = dir === "next" ? index : dir === "prev" ? index - 1 : null;
  const baseIndex = dir === "next" ? index + 1 : index;

  return (
    <GestureDetector gesture={pan}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View>
          {renderPage(baseIndex)}
          {dir && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade, pageStyle, baseShade]} />}
        </View>

        {sheetIndex != null && width > 0 && (
          // Clipped so the folded-over sheet never covers what's left of the page.
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }, pageStyle]}>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.face, sheetBack]}>
              <View style={[StyleSheet.absoluteFill, styles.back, pageStyle]}>
                <LinearGradient
                  colors={["rgba(0,0,0,0.12)", "rgba(0,0,0,0)"]}
                  start={{ x: 1, y: 0 }}
                  end={{ x: 0.7, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              </View>
            </Animated.View>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.face, sheetFront]}>
              {renderPage(sheetIndex)}
              <Animated.View style={[StyleSheet.absoluteFill, styles.shade, pageStyle, sheetShade]} />
            </Animated.View>
          </View>
        )}

        {corner && !dir && index < pageCount - 1 && (
          <Pressable
            onPress={() => turn("next")}
            accessibilityRole="button"
            accessibilityLabel="Next page"
            hitSlop={10}
            style={styles.corner}
          >
            <LinearGradient
              colors={["rgba(255,255,255,0)", "rgba(255,255,255,0)", "#FFFFFF", "#B9C0D6"]}
              locations={[0, 0.5, 0.5, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.curl}
            />
          </Pressable>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  face: { backfaceVisibility: "hidden" },
  back: { backgroundColor: binder.page },
  shade: { backgroundColor: "#0A0D24" },
  corner: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 34,
    height: 34,
    alignItems: "flex-end",
    justifyContent: "flex-end",
  },
  curl: {
    width: 30,
    height: 30,
    borderBottomRightRadius: 18,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: -2, height: -2 },
  },
});
