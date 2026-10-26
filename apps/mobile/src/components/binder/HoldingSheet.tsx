// Press and hold a card in a binder: move copies to another binder, take them
// out, or open the card.
import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { color, radius, space } from "@/design/tokens";
import { font } from "@/design/fonts";
import { formatUsd } from "@/design/format";
import type { Binder, OwnedCard } from "@/lib/api";
import { Button, CardArt, Chip, FieldLabel, Sheet, Text, tap } from "@/ui";
import { BINDER_LOOK } from "./BinderSheet";

const FINISH_NAME = { nonfoil: "Non-foil", foil: "Foil", etched: "Etched" } as const;

export function HoldingSheet({
  card,
  binders,
  onMove,
  onRemove,
  onOpen,
  onClose,
}: {
  card: OwnedCard | null;
  binders: Binder[];
  onMove: (to: Binder, quantity: number) => Promise<void>;
  onRemove: (quantity: number) => Promise<void>;
  onOpen: () => void;
  onClose: () => void;
}) {
  const last = useRef(card);
  if (card) last.current = card;
  const c = card ?? last.current;
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (card) setCount(card.quantity);
  }, [card]);

  if (!c) return null;
  const here = binders.find((b) => b.id === c.binderId);
  const others = binders.filter((b) => b.id !== c.binderId);
  const finish = FINISH_NAME[c.finish as keyof typeof FINISH_NAME] ?? "Non-foil";

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet visible={!!card} onClose={onClose} title={c.name} subtitle={`${finish} · in ${here?.name ?? "Collection"}`}>
      <View style={styles.top}>
        <View style={styles.art}>
          <CardArt uri={c.imageUri} name={c.name} foil={c.finish !== "nonfoil"} />
        </View>
        <View style={{ flex: 1, gap: space.sm }}>
          <Text variant="caption" color={color.textSecondary}>
            {c.quantity} {c.quantity === 1 ? "copy" : "copies"}
            {c.priceUsd != null ? ` · ${formatUsd(c.priceUsd)} each` : ""}
          </Text>
          {c.quantity > 1 && (
            <>
              <FieldLabel>How many</FieldLabel>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => {
                    tap();
                    setCount((n) => Math.max(1, n - 1));
                  }}
                  style={styles.stepBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Fewer"
                >
                  <Ionicons name="remove" size={18} color={color.ink} />
                </Pressable>
                <Text style={styles.count}>{count}</Text>
                <Pressable
                  onPress={() => {
                    tap();
                    setCount((n) => Math.min(c.quantity, n + 1));
                  }}
                  style={styles.stepBtn}
                  accessibilityRole="button"
                  accessibilityLabel="More"
                >
                  <Ionicons name="add" size={18} color={color.ink} />
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>

      {others.length > 0 && (
        <>
          <FieldLabel>{`Move ${count === c.quantity && count > 1 ? "all" : count} to`}</FieldLabel>
          <View style={styles.chips}>
            {others.map((b) => (
              <Chip key={b.id} label={busy === b.id ? "Moving…" : b.name} icon={(BINDER_LOOK[b.kind] ?? BINDER_LOOK.custom).icon} onPress={() => act(b.id, () => onMove(b, count))} />
            ))}
          </View>
        </>
      )}

      <View style={styles.row}>
        <Button label="Card details" icon="open-outline" variant="secondary" onPress={onOpen} style={{ flex: 1 }} />
        <Button
          label={count === c.quantity ? "Remove" : `Remove ${count}`}
          icon="trash-outline"
          variant="danger"
          loading={busy === "remove"}
          onPress={() => act("remove", () => onRemove(count))}
          style={{ flex: 1 }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", gap: space.lg, alignItems: "center" },
  art: { width: 88 },
  stepper: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: space.xs, padding: 4, borderRadius: radius.pill, backgroundColor: color.surface2 },
  stepBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: color.surface },
  count: { minWidth: 36, textAlign: "center", fontFamily: font.heavy, fontSize: 18, color: color.ink, fontVariant: ["tabular-nums"] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  row: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
});
