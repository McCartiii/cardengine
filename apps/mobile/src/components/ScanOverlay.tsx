import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
} from "react-native";
import { COLORS } from "../lib/constants";

const { width: W, height: H } = Dimensions.get("window");

// Card dimensions: standard MTG card is 2.5" × 3.5" (portrait 1:1.4)
const CARD_W = W * 0.78;
const CARD_H = CARD_W * 1.4;
const CARD_RADIUS = 12;

interface Props {
  detectedName: string | null;
  detectedPrice?: string | null;
  isIdentifying?: boolean;
}

export function ScanOverlay({ detectedName, detectedPrice, isIdentifying }: Props) {
  const glow = useRef(new Animated.Value(0)).current;
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const priceOpacity = useRef(new Animated.Value(0)).current;
  const priceScale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    if (detectedName) {
      Animated.parallel([
        Animated.spring(glow, { toValue: 1, useNativeDriver: true, speed: 20 }),
        Animated.timing(nameOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(glow, { toValue: 0, useNativeDriver: true, speed: 12 }),
        Animated.timing(nameOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [detectedName, glow, nameOpacity]);

  useEffect(() => {
    if (detectedPrice) {
      Animated.parallel([
        Animated.timing(priceOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(priceScale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 6 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(priceOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(priceScale, { toValue: 0.85, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [detectedPrice, priceOpacity, priceScale]);

  const borderColor = glow.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(168,85,247,0.4)", "rgba(34,197,94,0.95)"],
  });

  const cardTop = (H - CARD_H) / 2 - 40; // slightly above center

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Dark vignette around the card cutout */}
      <View style={[styles.vignette, { top: 0, height: cardTop }]} />
      <View style={[styles.vignette, { top: cardTop + CARD_H, bottom: 0 }]} />
      <View
        style={[
          styles.vignette,
          { top: cardTop, height: CARD_H, left: 0, width: (W - CARD_W) / 2 },
        ]}
      />
      <View
        style={[
          styles.vignette,
          {
            top: cardTop,
            height: CARD_H,
            right: 0,
            width: (W - CARD_W) / 2,
          },
        ]}
      />

      {/* Animated border around the card target area */}
      <Animated.View
        style={[
          styles.cardFrame,
          {
            top: cardTop,
            left: (W - CARD_W) / 2,
            width: CARD_W,
            height: CARD_H,
            borderColor,
            shadowColor: detectedName ? COLORS.success : COLORS.accent,
            shadowOpacity: glow,
          },
        ]}
      />

      {/* Corner ticks */}
      {[
        { top: cardTop - 1, left: (W - CARD_W) / 2 - 1 },
        { top: cardTop - 1, right: (W - CARD_W) / 2 - 1 },
        { bottom: H - cardTop - CARD_H - 1, left: (W - CARD_W) / 2 - 1 },
        { bottom: H - cardTop - CARD_H - 1, right: (W - CARD_W) / 2 - 1 },
      ].map((pos, i) => (
        <Animated.View
          key={i}
          style={[styles.cornerTick, pos, { borderColor }]}
        />
      ))}

      {/* Detected card name label — sits above the frame */}
      <Animated.View
        style={[styles.nameBadge, { top: cardTop - 48, opacity: nameOpacity }]}
      >
        <Text style={styles.nameText} numberOfLines={1}>
          {detectedName ?? ""}
        </Text>
        {isIdentifying && <Text style={styles.identifyingDots}>...</Text>}
      </Animated.View>

      {/* Price overlay — centered in the card frame, pops in on match */}
      <Animated.View
        style={[
          styles.priceOverlay,
          {
            top: cardTop + CARD_H * 0.28,
            left: (W - CARD_W) / 2,
            width: CARD_W,
            opacity: priceOpacity,
            transform: [{ scale: priceScale }],
          },
        ]}
      >
        <Text style={styles.priceText}>{detectedPrice ?? ""}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  vignette: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  cardFrame: {
    position: "absolute",
    borderRadius: CARD_RADIUS,
    borderWidth: 2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  cornerTick: {
    position: "absolute",
    width: 20,
    height: 20,
    borderWidth: 3,
    borderRadius: 3,
    backgroundColor: "transparent",
  },
  nameBadge: {
    position: "absolute",
    left: (W - CARD_W) / 2,
    right: (W - CARD_W) / 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  nameText: {
    color: COLORS.success,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  identifyingDots: {
    color: COLORS.textMuted,
    fontSize: 15,
    marginLeft: 4,
  },
  priceOverlay: {
    position: "absolute",
    alignItems: "center",
  },
  priceText: {
    color: "#ffffff",
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: 0.5,
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
});
