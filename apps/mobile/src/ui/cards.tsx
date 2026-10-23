import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { CARD_ASPECT, color, radius, rarity as rarityColor, space } from "../design/tokens";
import { PricePill, Text, Touchable, Delta } from "./primitives";

// Hand-picked dark gradients so art-less cards still read as distinct objects.
const PLACEHOLDER_GRADIENTS: ReadonlyArray<readonly [string, string]> = [
  ["#2B2F45", "#14151F"],
  ["#3A2A22", "#17110E"],
  ["#1F3A33", "#0E1916"],
  ["#3B2340", "#160E18"],
  ["#22324A", "#0D141E"],
];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface CardArtProps {
  uri: string | null | undefined;
  name: string;
  style?: StyleProp<ViewStyle>;
  rounded?: number;
}

/** Card image at the real 63:88 ratio, cached, with a named gradient fallback. */
export function CardArt({ uri, name, style, rounded = radius.card }: CardArtProps) {
  const [from, to] = PLACEHOLDER_GRADIENTS[hash(name) % PLACEHOLDER_GRADIENTS.length];
  return (
    <View style={[styles.art, { borderRadius: rounded }, style]}>
      <LinearGradient colors={[from, to]} style={StyleSheet.absoluteFill} />
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={180}
          recyclingKey={uri}
          accessibilityLabel={name}
        />
      ) : (
        <View style={styles.placeholder}>
          <Text variant="callout" color="rgba(255,255,255,0.72)" align="center" numberOfLines={4}>
            {name}
          </Text>
        </View>
      )}
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

/** Grid tile: art first, price and quantity overlaid, metadata underneath. */
export function CardTile({
  name,
  imageUri,
  price,
  foil,
  quantity,
  subtitle,
  rarity,
  deltaPct,
  showName = true,
  onPress,
  style,
}: CardTileProps) {
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      style={[styles.tile, style]}
    >
      <View>
        <CardArt uri={imageUri} name={name} />
        <View style={styles.overlayRow} pointerEvents="none">
          {quantity != null && quantity > 1 ? (
            <View style={styles.qty}>
              <Text variant="number" style={{ fontSize: 12 }}>
                {quantity}×
              </Text>
            </View>
          ) : (
            <View />
          )}
          <PricePill amount={price} foil={foil} />
        </View>
      </View>
      {(showName || subtitle || deltaPct != null) && (
        <View style={styles.meta}>
          {showName && (
            <Text variant="callout" numberOfLines={1}>
              {name}
            </Text>
          )}
          <View style={styles.subRow}>
            {rarity && <View style={[styles.rarityDot, { backgroundColor: rarityColor[rarity] ?? color.textTertiary }]} />}
            {!!subtitle && (
              <Text variant="caption" color={color.textTertiary} numberOfLines={1} style={{ flexShrink: 1 }}>
                {subtitle}
              </Text>
            )}
            {deltaPct != null && <Delta pct={deltaPct} variant="caption" />}
          </View>
        </View>
      )}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  art: { width: "100%", aspectRatio: CARD_ASPECT, overflow: "hidden", backgroundColor: color.surface2 },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.md },
  tile: {},
  overlayRow: {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  qty: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: color.overlay,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: { paddingTop: space.sm, paddingHorizontal: 2, gap: 2 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rarityDot: { width: 6, height: 6, borderRadius: 3 },
});

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
