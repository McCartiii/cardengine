// Narrow a card search by color, type, rarity and price, and pick the order.
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { color, mana, radius, space } from "@/design/tokens";
import { font } from "@/design/fonts";
import { displaySymbol } from "@/design/format";
import {
  COLOR_OPTIONS,
  NO_FILTERS,
  PRICE_OPTIONS,
  RARITY_OPTIONS,
  SORT_OPTIONS,
  TYPE_OPTIONS,
  priceLabel,
  type FilterState,
} from "@/lib/searchFilters";
import { Button, Chip, FieldLabel, Segmented, Sheet, Text, tap } from "@/ui";

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function SearchFilterSheet({
  visible,
  value,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: FilterState;
  onApply: (f: FilterState) => void;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const symbol = displaySymbol();

  return (
    <Sheet visible={visible} onClose={onClose} title="Filters">
      <ScrollView style={{ maxHeight: Math.min(480, height * 0.52) }} contentContainerStyle={{ gap: space.md }} showsVerticalScrollIndicator={false}>
        <FieldLabel>Color</FieldLabel>
        <View style={styles.pips}>
          {COLOR_OPTIONS.map((c) => {
            const on = draft.colors.includes(c.code);
            return (
              <Pressable
                key={c.code}
                onPress={() => {
                  tap();
                  setDraft((d) => ({ ...d, colors: toggle(d.colors, c.code) }));
                }}
                accessibilityRole="button"
                accessibilityLabel={c.name}
                accessibilityState={{ selected: on }}
                style={[styles.pip, { backgroundColor: mana[c.code] }, on && styles.pipOn]}
              >
                {on ? (
                  <Ionicons name="checkmark" size={20} color={c.code === "W" || c.code === "C" ? color.ink : "#FFFFFF"} />
                ) : (
                  <Text style={[styles.pipText, { color: c.code === "W" || c.code === "C" ? color.ink : "#FFFFFF" }]}>{c.code}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
        {draft.colors.length > 1 && (
          <Text variant="caption" color={color.textTertiary}>
            Cards with all of these colors
          </Text>
        )}

        <FieldLabel>Type</FieldLabel>
        <View style={styles.wrap}>
          {TYPE_OPTIONS.map((t) => (
            <Chip key={t} label={t} active={draft.type === t} onPress={() => setDraft((d) => ({ ...d, type: d.type === t ? null : t }))} />
          ))}
        </View>

        <FieldLabel>Rarity</FieldLabel>
        <View style={styles.wrap}>
          {RARITY_OPTIONS.map((r) => (
            <Chip key={r.value} label={r.label} active={draft.rarity.includes(r.value)} onPress={() => setDraft((d) => ({ ...d, rarity: toggle(d.rarity, r.value) }))} />
          ))}
        </View>

        <FieldLabel>Price</FieldLabel>
        <View style={styles.wrap}>
          {PRICE_OPTIONS.map((p) => (
            <Chip key={p.key} label={priceLabel(p.key, symbol)} active={draft.price === p.key} onPress={() => setDraft((d) => ({ ...d, price: p.key }))} />
          ))}
        </View>

        <FieldLabel>Sort by</FieldLabel>
        <Segmented options={SORT_OPTIONS} value={draft.sort} onChange={(sort) => setDraft((d) => ({ ...d, sort }))} />
      </ScrollView>

      <View style={styles.actions}>
        <Button label="Reset" variant="secondary" onPress={() => setDraft(NO_FILTERS)} style={{ flex: 1 }} />
        <Button
          label="Show cards"
          onPress={() => {
            onApply(draft);
            onClose();
          }}
          style={{ flex: 2 }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pips: { flexDirection: "row", justifyContent: "space-between" },
  pip: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(12,14,31,0.12)" },
  pipOn: { borderWidth: 3, borderColor: color.accent, transform: [{ scale: 1.06 }] },
  pipText: { fontFamily: font.heavy, fontSize: 16 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.sm, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border, borderRadius: radius.sm },
});
