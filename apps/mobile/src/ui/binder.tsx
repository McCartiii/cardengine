// The binder page: a matte black sheet of pockets, each holding one card
// behind clear plastic.
import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import { CARD_ASPECT, cardRadius } from "../design/tokens";
import { font } from "../design/fonts";
import { formatUsd } from "../design/format";
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
  /** Replaces the price in the corner chip, e.g. a price change. */
  chip?: { label: string; color?: string };
  /** Stagger for the fade-in. */
  order?: number;
  onPress: () => void;
}

/** A sleeved card in its pocket, with the plastic catching a little light. */
export function Pocket({ width, name, uri, price, foil, quantity, chip, order = 0, onPress }: PocketProps) {
  const inner = cardWidthIn(width);
  return (
    <Animated.View entering={FadeIn.delay(order * 35).duration(260)}>
      <Tilt onPress={onPress} accessibilityRole="button" accessibilityLabel={price != null ? `${name}, ${formatUsd(price)}` : name}>
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
          {(chip || price != null) && (
            <View style={styles.priceRow} pointerEvents="none">
              <View style={styles.price}>
                <Text variant="number" color={chip?.color ?? "#FFFFFF"} style={{ fontSize: 10, lineHeight: 13 }}>
                  {chip ? chip.label : formatUsd(price, { compact: true })}
                </Text>
              </View>
            </View>
          )}
        </View>
      </Tilt>
    </Animated.View>
  );
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
    height: 17,
    paddingHorizontal: 6,
    borderRadius: 9,
    justifyContent: "center",
    backgroundColor: "rgba(8,9,12,0.72)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
});
