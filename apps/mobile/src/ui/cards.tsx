import React, { useEffect, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";
import { CARD_ASPECT, cardRadius, color, rarity as rarityColor, space } from "../design/tokens";
import { font } from "../design/fonts";
import { formatDeltaPct, formatUsd } from "../design/format";
import { Text, Touchable } from "./primitives";

// Muted, painterly gradients so art-less cards still read as distinct objects.
const PLACEHOLDER_GRADIENTS: ReadonlyArray<readonly [string, string, string]> = [
  ["#3A3550", "#211E30", "#121019"],
  ["#4A3426", "#2A1D16", "#140E0B"],
  ["#2A4840", "#18292A", "#0C1514"],
  ["#4A2C4E", "#28182B", "#140C16"],
  ["#2C3F5C", "#182436", "#0C121C"],
];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Diagonal light band that sweeps across foil cards. */
function FoilSheen({ width }: { width: number }) {
  const x = useSharedValue(-1);
  useEffect(() => {
    x.value = withDelay(
      hash(String(width)) % 900,
      withRepeat(withTiming(1.6, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1, false)
    );
  }, [x, width]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * width }, { rotate: "20deg" }] }));
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden" }]} pointerEvents="none">
      <LinearGradient
        colors={["rgba(255,255,255,0.07)", "rgba(196,181,253,0.10)", "rgba(110,231,183,0.08)", "rgba(255,255,255,0.0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[styles.sheen, { width: width * 0.45 }, style]}>
        <LinearGradient
          colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.28)", "rgba(255,255,255,0)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

interface CardArtProps {
  uri: string | null | undefined;
  name: string;
  foil?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Card image at the real 63:88 ratio and corner radius, with a named fallback. */
export function CardArt({ uri, name, foil, style }: CardArtProps) {
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState(false);
  const gradient = PLACEHOLDER_GRADIENTS[hash(name) % PLACEHOLDER_GRADIENTS.length];
  const w = width || 120;
  const r = cardRadius(w);
  const showImage = !!uri && !failed;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={[styles.art, { borderRadius: r }, style]}>
      <LinearGradient colors={gradient} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      {showImage ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={220}
          recyclingKey={uri}
          accessibilityLabel={name}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={[styles.placeholderFrame, { borderRadius: Math.max(2, r - 3) }]}>
          <Text
            align="center"
            numberOfLines={3}
            color="rgba(255,255,255,0.78)"
            style={{ fontFamily: font.serifItalic, fontSize: Math.max(13, Math.round(w * 0.12)), lineHeight: Math.max(16, Math.round(w * 0.14)) }}
          >
            {name}
          </Text>
        </View>
      )}
      {foil && width > 0 && <FoilSheen width={width} />}
      <View style={[StyleSheet.absoluteFill, styles.edge, { borderRadius: r }]} pointerEvents="none" />
    </View>
  );
}

export function PricePill({ amount }: { amount: number | null | undefined }) {
  if (amount == null) return null;
  return (
    <View style={styles.pill}>
      <Text variant="number">{formatUsd(amount, { compact: true })}</Text>
    </View>
  );
}

interface CardTileProps {
  name: string;
  imageUri: string | null | undefined;
  price?: number | null;
  foil?: boolean;
  quantity?: number;
  subtitle?: string;
  rarity?: string | null;
  deltaPct?: number | null;
  showName?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Grid tile: the card itself, price and count on the art, set and movement below. */
export function CardTile({
  name,
  imageUri,
  price,
  foil,
  quantity,
  subtitle,
  rarity,
  deltaPct,
  showName = false,
  onPress,
  style,
}: CardTileProps) {
  const hasDelta = deltaPct != null && Number.isFinite(deltaPct);
  const up = (deltaPct ?? 0) >= 0;
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={name} pressedScale={0.96} style={style}>
      <View style={styles.shadow}>
        <CardArt uri={imageUri} name={name} foil={foil} />
        <View style={styles.overlay} pointerEvents="none">
          {quantity != null && quantity > 1 ? (
            <View style={styles.pill}>
              <Text variant="number">×{quantity}</Text>
            </View>
          ) : (
            <View />
          )}
          <View style={styles.overlayRight}>
            {foil && (
              <View style={styles.foilBadge}>
                <Ionicons name="sparkles" size={9} color={color.onAccent} />
              </View>
            )}
            <PricePill amount={price} />
          </View>
        </View>
      </View>
      <View style={styles.meta}>
        {showName && (
          <Text variant="callout" numberOfLines={1}>
            {name}
          </Text>
        )}
        <View style={styles.subRow}>
          {rarity && <View style={[styles.rarityDot, { backgroundColor: rarityColor[rarity] ?? color.textTertiary }]} />}
          {!!subtitle && (
            <Text variant="code" color={color.textTertiary} numberOfLines={1} style={{ flexShrink: 1 }}>
              {subtitle}
            </Text>
          )}
          {hasDelta && (
            <View style={styles.deltaRow}>
              <Ionicons name={up ? "arrow-up" : "arrow-down"} size={10} color={up ? color.positive : color.negative} />
              <Text variant="number" color={up ? color.positive : color.negative}>
                {formatDeltaPct(Math.abs(deltaPct!)).replace(/^\+/, "")}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Touchable>
  );
}

/**
 * Pads a list with nulls so a multi-column FlatList's last row keeps
 * column-width tiles instead of stretching them. Render null as an empty cell.
 */
export function padToColumns<T>(items: T[], columns: number): Array<T | null> {
  const remainder = items.length % columns;
  return remainder === 0 ? items : [...items, ...Array<null>(columns - remainder).fill(null)];
}

export function GridSpacer() {
  return <View style={{ flex: 1 }} />;
}

const styles = StyleSheet.create({
  art: { width: "100%", aspectRatio: CARD_ASPECT, overflow: "hidden", backgroundColor: color.surface2 },
  edge: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.14)" },
  placeholderFrame: {
    flex: 1,
    margin: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    padding: space.sm,
  },
  sheen: { position: "absolute", top: "-30%", bottom: "-30%", left: 0 },
  shadow: {
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  overlay: {
    position: "absolute",
    left: 5,
    right: 5,
    bottom: 5,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  overlayRight: { flexDirection: "row", alignItems: "center", gap: 3 },
  pill: {
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: "rgba(9,9,11,0.82)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
  },
  foilBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: { paddingTop: space.sm, paddingHorizontal: 1, gap: 3 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  rarityDot: { width: 5, height: 5, borderRadius: 3 },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: 1, marginLeft: "auto" },
});
