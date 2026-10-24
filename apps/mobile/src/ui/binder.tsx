// The binder page: a matte black sheet of pockets, each holding one card
// behind clear plastic.
import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import { CARD_ASPECT, cardRadius } from "../design/tokens";
import { font } from "../design/fonts";
import { formatDeltaPct, formatUsd } from "../design/format";
import { Text, Touchable } from "./primitives";
import { CardArt } from "./cards";
import { Tilt } from "./holo";

export const binderPage = {
  page: "#0E0F13",
  pocket: "#1A1C22",
  lip: "rgba(255,255,255,0.10)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.58)",
} as const;

/** Space a pocket adds around its card. */
export const POCKET_INSET = 3;

/** Card width for a pocket of the given outer width. */
export const cardWidthIn = (pocketWidth: number) => pocketWidth - POCKET_INSET * 2;

/** Outer height of a pocket of the given outer width. */
export const pocketHeight = (pocketWidth: number) => cardWidthIn(pocketWidth) / CARD_ASPECT + POCKET_INSET * 2;

/** Outer pocket width that fits a row of the given height. */
export const pocketWidthForHeight = (rowHeight: number) => (rowHeight - POCKET_INSET * 2) * CARD_ASPECT + POCKET_INSET * 2;

interface PocketProps {
  width: number;
  name: string;
  uri: string | null | undefined;
  price?: number | null;
  foil?: boolean;
  quantity?: number;
  /** Price change in percent, shown as the chip's color and arrow; null when unknown. */
  change?: number | null;
  /** Show the change itself in the chip instead of the price. */
  showChange?: boolean;
  /** Stagger for the fade-in. */
  order?: number;
  onPress: () => void;
}

/** A sleeved card in its pocket, with the plastic catching a little light. */
export function Pocket({ width, name, uri, price, foil, quantity, change, showChange, order = 0, onPress }: PocketProps) {
  const inner = cardWidthIn(width);
  const t = trend(change);
  const label = showChange ? (change != null ? formatDeltaPct(change) : "—") : price != null ? formatUsd(price, { compact: true }) : null;
  return (
    <Animated.View entering={FadeIn.delay(order * 35).duration(260)}>
      <Tilt
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={[name, price != null ? formatUsd(price) : null, t ? t.spoken : null].filter(Boolean).join(", ")}
      >
        <View style={[styles.pocket, { width, height: pocketHeight(width), borderRadius: cardRadius(inner) + POCKET_INSET }]}>
          <CardArt uri={uri} name={name} foil={foil} />
          {/* The sleeve: a soft diagonal glare over the card. */}
          <LinearGradient
            colors={["rgba(255,255,255,0.16)", "rgba(255,255,255,0)", "rgba(255,255,255,0)", "rgba(255,255,255,0.06)"]}
            locations={[0, 0.28, 0.72, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: cardRadius(inner) + POCKET_INSET }]}
            pointerEvents="none"
          />
          <View style={styles.lip} pointerEvents="none" />
          {quantity != null && quantity > 1 && (
            <View style={styles.qty} pointerEvents="none">
              <Text variant="number" color="#FFFFFF" style={{ fontSize: 10 }}>
                ×{quantity}
              </Text>
            </View>
          )}
          {label != null && (
            <View style={styles.priceRow} pointerEvents="none">
              <View style={[styles.price, t && { borderColor: t.edge }]}>
                {t && <Ionicons name={t.icon} size={9} color={t.color} />}
                <Text variant="number" color={t?.color ?? "#FFFFFF"} style={{ fontSize: 10, lineHeight: 13 }}>
                  {label}
                </Text>
              </View>
            </View>
          )}
        </View>
      </Tilt>
    </Animated.View>
  );
}

// Moves smaller than this read as holding steady.
const FLAT_PCT = 1;

/** Color, arrow and wording for a price change; null when there's no history. */
export function trend(change: number | null | undefined) {
  if (change == null || !Number.isFinite(change)) return null;
  if (change >= FLAT_PCT) return { color: "#5CE0A0", edge: "rgba(92,224,160,0.45)", icon: "caret-up" as const, spoken: `up ${formatDeltaPct(change)} this week` };
  if (change <= -FLAT_PCT) return { color: "#FF8A9A", edge: "rgba(255,138,154,0.45)", icon: "caret-down" as const, spoken: `down ${formatDeltaPct(change)} this week` };
  return { color: "rgba(255,255,255,0.72)", edge: "rgba(255,255,255,0.18)", icon: "remove" as const, spoken: "steady this week" };
}

/** An empty pocket waiting for a card. */
export function EmptyPocket({ width, label = "Add", onPress }: { width: number; label?: string; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel="Add a card to this pocket" pressedScale={0.95}>
      <View style={[styles.pocket, styles.empty, { width, height: pocketHeight(width), borderRadius: cardRadius(cardWidthIn(width)) + POCKET_INSET }]}>
        <View style={styles.lip} pointerEvents="none" />
        <Ionicons name="add" size={20} color="rgba(255,255,255,0.35)" />
        {width > 70 && (
          <Text variant="caption" color="rgba(255,255,255,0.35)" style={{ fontFamily: font.semibold }}>
            {label}
          </Text>
        )}
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  pocket: {
    padding: POCKET_INSET,
    backgroundColor: binderPage.pocket,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  // The open top edge of the pocket.
  lip: { position: "absolute", top: 0, left: 4, right: 4, height: 1, backgroundColor: binderPage.lip },
  empty: { alignItems: "center", justifyContent: "center", gap: 2 },
  qty: { position: "absolute", top: 7, left: 7, paddingHorizontal: 6, height: 18, borderRadius: 9, backgroundColor: "rgba(8,9,12,0.8)", justifyContent: "center" },
  priceRow: { position: "absolute", right: 7, bottom: 7 },
  price: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 17,
    paddingHorizontal: 6,
    borderRadius: 9,
    justifyContent: "center",
    backgroundColor: "rgba(8,9,12,0.72)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
});
