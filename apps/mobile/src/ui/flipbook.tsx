// A binder page you can turn: drag sideways (or tap the page corner) and the
// page lifts off the rings and folds over to reveal the next one.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
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
  // As the page lifts it turns away from the light: a soft gradient deepens toward its free edge...
  const sheetShade = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0, 0.5], [0, 1], "clamp") }));
  // ...a band of light runs along the curve...
  const sheetGloss = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.15, 0.45], [0, 0.9, 0], "clamp"),
    transform: [{ translateX: interpolate(t.value, [0, 0.5], [width * 0.55, width * 0.05], "clamp") }],
  }));
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
                  colors={["rgba(12,16,48,0)", "rgba(12,16,48,0.22)", "rgba(12,16,48,0)"]}
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
              <View style={[StyleSheet.absoluteFill, styles.back, pageStyle]}>
                <LinearGradient
                  colors={["#DCE0EC", "#EEF0F7", "#E3E6F0"]}
                  locations={[0, 0.35, 1]}
                  start={{ x: 1, y: 0 }}
                  end={{ x: 0, y: 0 }}
                  style={[StyleSheet.absoluteFill, pageStyle]}
                />
              </View>
            </Animated.View>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.face, sheetFront]}>
              {renderPage(sheetIndex)}
              <Animated.View style={[StyleSheet.absoluteFill, sheetShade]}>
                <LinearGradient
                  colors={["rgba(255,255,255,0.18)", "rgba(12,16,48,0)", "rgba(12,16,48,0.28)"]}
                  locations={[0, 0.4, 1]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[StyleSheet.absoluteFill, pageStyle]}
                />
              </Animated.View>
              <Animated.View style={[styles.gloss, { width: width * 0.35 }, sheetGloss]}>
                <LinearGradient
                  colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.55)", "rgba(255,255,255,0)"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
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
              colors={["rgba(255,255,255,0)", "rgba(255,255,255,0)", "#FFFFFF", "#D9DDEA", "#BCC3D8"]}
              locations={[0, 0.5, 0.5, 0.75, 1]}
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
  castShadow: { position: "absolute", top: 0, bottom: 0, left: 0 },
  gloss: { position: "absolute", top: 0, bottom: 0, left: 0 },
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

// Cylindrical chrome: dark rims, a hot highlight just off-center, a soft mid-tone.
const CHROME = ["#4E566E", "#C9CFDD", "#FFFFFF", "#AEB6C8", "#7A8299", "#3E4559"] as const;
const CHROME_STOPS = [0, 0.22, 0.38, 0.6, 0.82, 1] as const;

/**
 * The ring mechanism along the spine: a chrome bar with rings that run out
 * across the page edge and disappear into punched holes. Fills its parent's
 * height; the arms reach `reach` points past the bar.
 */
export function BinderSpine({ rings = 3, reach = 22, inset = 24 }: { rings?: number; reach?: number; inset?: number }) {
  return (
    <View style={[spineStyles.root, { paddingVertical: inset }]} pointerEvents="none">
      <View style={spineStyles.bar}>
        <LinearGradient colors={CHROME} locations={CHROME_STOPS} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[StyleSheet.absoluteFill, { borderRadius: 5 }]} />
        <View style={[spineStyles.rivet, { top: 6 }]} />
        <View style={[spineStyles.rivet, { bottom: 6 }]} />
      </View>
      <View style={[spineStyles.arms, { top: inset, bottom: inset }]}>
        {Array.from({ length: rings }, (_, i) => (
          <View key={i} style={[spineStyles.arm, { width: reach + 10 }]}>
            <View style={[spineStyles.hole, { left: reach + 1 }]} />
            <View style={[spineStyles.armShadow, { width: reach + 4 }]} />
            <View style={[spineStyles.tube, { width: reach + 6 }]}>
              <LinearGradient colors={CHROME} locations={CHROME_STOPS} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 3.5 }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const spineStyles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, flexDirection: "row" },
  bar: {
    width: 10,
    borderRadius: 5,
    shadowColor: "#05081E",
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 2, height: 2 },
    elevation: 4,
  },
  rivet: { position: "absolute", left: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: "#5A6178", borderWidth: 0.5, borderColor: "#E6E9F2" },
  arms: { position: "absolute", left: 5, justifyContent: "space-around", paddingVertical: 12 },
  arm: { height: 14, justifyContent: "center" },
  // The punched hole in the page that the ring runs into.
  hole: {
    position: "absolute",
    top: 2,
    width: 9,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#262D52",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
  },
  armShadow: { position: "absolute", left: 2, top: 7, height: 5, borderRadius: 3, backgroundColor: "rgba(8,10,30,0.28)" },
  tube: { height: 7, borderRadius: 3.5, overflow: "hidden" },
});

/** Light paper with a soft gutter shadow along the rings. Children sit on top. */
export function PaperFill({ gutter = 26 }: { gutter?: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={["#FBFCFF", "#EEF0F7", "#E6E9F2"]} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={["rgba(20,26,66,0.16)", "rgba(20,26,66,0.04)", "rgba(20,26,66,0)"]}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: gutter }}
      />
    </View>
  );
}

/** Stacks the pages under the open one so the binder has thickness. */
export function PageStack({ children, pageStyle, depth = 2 }: { children: React.ReactNode; pageStyle?: StyleProp<ViewStyle>; depth?: number }) {
  return (
    <View style={{ marginRight: depth * 3, marginBottom: depth * 3 }}>
      {Array.from({ length: depth }, (_, i) => depth - i).map((d) => (
        <View
          key={d}
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            pageStyle,
            ringStyles.sheet,
            d === depth && ringStyles.sheetShadow,
            { transform: [{ translateX: d * 3 }, { translateY: d * 3 }], backgroundColor: d === 1 ? "#E1E4EE" : "#C9CEDD" },
          ]}
        />
      ))}
      {children}
    </View>
  );
}

/** Paper clipped to the page's corners. */
export function PaperPage({ pageStyle, gutter }: { pageStyle?: StyleProp<ViewStyle>; gutter?: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, pageStyle, { overflow: "hidden" }]} pointerEvents="none">
      <PaperFill gutter={gutter} />
    </View>
  );
}

const ringStyles = StyleSheet.create({
  sheet: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(20,26,66,0.12)" },
  sheetShadow: { shadowColor: "#05081E", shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
});
