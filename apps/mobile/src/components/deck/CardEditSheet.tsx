// Tap a card in a deck: change how many copies, move it between main,
// sideboard and command zone, open its page or take it out.
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { color, radius, space } from "@/design/tokens";
import { font } from "@/design/fonts";
import { formatUsd } from "@/design/format";
import type { DeckCard } from "@/lib/api";
import { MAX_COPIES, hasCommandZone } from "@/lib/deckEdits";
import { Button, CardArt, Segmented, Sheet, Text, tap } from "@/ui";

const SECTION_LABEL: Record<string, string> = { mainboard: "Main", sideboard: "Sideboard", commander: "Commander", companion: "Companion" };

export function CardEditSheet({
  card,
  format,
  onClose,
  onSetCount,
  onMove,
  onRemove,
  onOpen,
}: {
  card: DeckCard | null;
  format: string;
  onClose: () => void;
  onSetCount: (quantity: number) => void;
  onMove: (section: string) => void;
  onRemove: () => void;
  onOpen: () => void;
}) {
  // Keep the last card while the sheet slides away.
  const last = React.useRef(card);
  if (card) last.current = card;
  const c = card ?? last.current;
  if (!c) return null;

  const sections = hasCommandZone(format) ? ["mainboard", "sideboard", "commander"] : ["mainboard", "sideboard"];
  if (!sections.includes(c.section)) sections.push(c.section);
  const typeLine = c.variant?.typeLine;
  const each = c.price ?? null;

  return (
    <Sheet visible={!!card} onClose={onClose} title={c.cardName} subtitle={typeLine ?? undefined}>
      <View style={styles.top}>
        <View style={styles.art}>
          <CardArt uri={c.variant?.imageUri} name={c.cardName} />
        </View>
        <View style={{ flex: 1, gap: space.md }}>
          <View>
            <Text variant="caption" color={color.textSecondary}>
              {each != null ? `${formatUsd(each)} each` : "No price yet"}
            </Text>
            {each != null && c.quantity > 1 && (
              <Text variant="price" style={{ marginTop: 2 }}>
                {formatUsd(each * c.quantity)}
              </Text>
            )}
          </View>
          <Stepper value={c.quantity} onChange={onSetCount} />
        </View>
      </View>

      <Text variant="label" color={color.textSecondary} style={{ marginTop: space.xs }}>
        In
      </Text>
      <Segmented options={sections.map((s) => ({ value: s, label: SECTION_LABEL[s] ?? s }))} value={c.section} onChange={onMove} />

      <View style={styles.actions}>
        {c.variantId && <Button label="Card details" icon="open-outline" variant="secondary" onPress={onOpen} style={{ flex: 1 }} />}
        <Button label="Remove" icon="trash-outline" variant="danger" onPress={onRemove} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const step = (d: number) => {
    tap();
    onChange(value + d);
  };
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => step(-1)} style={styles.stepBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={value <= 1 ? "Remove" : "One fewer"}>
        <Ionicons name={value <= 1 ? "trash-outline" : "remove"} size={20} color={value <= 1 ? color.negative : color.ink} />
      </Pressable>
      <Text style={styles.count} accessibilityLabel={`${value} copies`}>
        {value}
      </Text>
      <Pressable
        onPress={() => step(1)}
        disabled={value >= MAX_COPIES}
        style={[styles.stepBtn, value >= MAX_COPIES && { opacity: 0.35 }]}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="One more"
      >
        <Ionicons name="add" size={20} color={color.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", gap: space.lg, alignItems: "center" },
  art: { width: 96 },
  stepper: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: space.xs, padding: 4, borderRadius: radius.pill, backgroundColor: color.surface2 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: color.surface },
  count: { minWidth: 44, textAlign: "center", fontFamily: font.heavy, fontSize: 22, color: color.ink, fontVariant: ["tabular-nums"] },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
});
