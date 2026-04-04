import React from "react";
import { View, Text, StyleSheet, type ViewStyle, type TextStyle } from "react-native";
import { colors, radii } from "../../theme";

const t = colors.light;

type BadgeVariant =
  | "default"
  | "accent"
  | "success"
  | "danger"
  | "warning"
  | "mythic"
  | "rare"
  | "uncommon"
  | "common"
  | "mana-W"
  | "mana-U"
  | "mana-B"
  | "mana-R"
  | "mana-G"
  | "tcg"
  | "mkm";

interface BadgeProps {
  children: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: t.surfaceSunken, text: t.textSecondary },
  accent: { bg: t.accentLight, text: t.accentText },
  success: { bg: t.successLight, text: t.successText },
  danger: { bg: t.dangerLight, text: t.dangerText },
  warning: { bg: t.warningLight, text: t.warningText },
  mythic: { bg: t.rarityMythicBg, text: t.rarityMythic },
  rare: { bg: t.rarityRareBg, text: t.rarityRare },
  uncommon: { bg: t.rarityUncommonBg, text: t.rarityUncommon },
  common: { bg: t.rarityCommonBg, text: t.rarityCommon },
  "mana-W": { bg: t.manaW, text: t.manaWText },
  "mana-U": { bg: t.manaU, text: t.manaUText },
  "mana-B": { bg: t.manaB, text: t.manaBText },
  "mana-R": { bg: t.manaR, text: t.manaRText },
  "mana-G": { bg: t.manaG, text: t.manaGText },
  tcg: { bg: t.marketTcgBg, text: t.marketTcg },
  mkm: { bg: t.marketMkmBg, text: t.marketMkm },
};

export function Badge({ children, variant = "default", style }: BadgeProps) {
  const v = variantStyles[variant];
  return (
    <View style={[styles.badge, { backgroundColor: v.bg }, style]}>
      <Text style={[styles.text, { color: v.text }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 11,
    fontWeight: "700",
  },
});
