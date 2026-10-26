// Switch binders, make new ones (trade binder, wishlist…), rename or delete
// them, and import or export cards.
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { color, radius, space, type BubbleColor } from "@/design/tokens";
import { font } from "@/design/fonts";
import { formatUsd } from "@/design/format";
import type { Binder, BinderKind } from "@/lib/api";
import { Button, Chip, IconBubble, Sheet, Text, Touchable, tap } from "@/ui";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export const BINDER_LOOK: Record<BinderKind, { icon: IconName; tint: BubbleColor; label: string }> = {
  collection: { icon: "albums", tint: "violet", label: "Collection" },
  trade: { icon: "swap-horizontal", tint: "green", label: "Trade binder" },
  wishlist: { icon: "heart", tint: "pink", label: "Wishlist" },
  custom: { icon: "folder", tint: "blue", label: "Binder" },
};

const NEW_KINDS: ReadonlyArray<{ kind: Exclude<BinderKind, "collection">; label: string; hint: string; suggestion: string }> = [
  { kind: "trade", label: "Trade", hint: "Cards you'd trade away. Counts toward your value.", suggestion: "Trade binder" },
  { kind: "wishlist", label: "Wishlist", hint: "Cards you want. Doesn't count toward your value.", suggestion: "Wishlist" },
  { kind: "custom", label: "Other", hint: "Anything else: a cube, a set you're completing, bulk.", suggestion: "" },
];

/** "23 cards · $1,285", or what a wishlist would cost. */
export function binderSummary(b: Binder): string {
  const cards = `${b.copies ?? 0} ${b.copies === 1 ? "card" : "cards"}`;
  if (!b.copies) return "Empty";
  return b.kind === "wishlist" ? `${cards} · ${formatUsd(b.value ?? 0)} to buy` : `${cards} · ${formatUsd(b.value ?? 0)}`;
}

type Mode = { at: "list" } | { at: "create" } | { at: "rename"; binder: Binder };

export function BinderSheet({
  visible,
  binders,
  activeId,
  onPick,
  onCreate,
  onRename,
  onDelete,
  onImport,
  onExport,
  onClose,
}: {
  visible: boolean;
  binders: Binder[];
  activeId: string;
  onPick: (b: Binder) => void;
  onCreate: (name: string, kind: Exclude<BinderKind, "collection">) => Promise<void>;
  onRename: (b: Binder, name: string) => Promise<void>;
  onDelete: (b: Binder, cards: "move" | "delete") => Promise<void>;
  onImport: () => void;
  onExport: () => Promise<void>;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>({ at: "list" });
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Exclude<BinderKind, "collection">>("trade");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (visible) setMode({ at: "list" });
  }, [visible]);

  const startCreate = () => {
    const taken = new Set(binders.map((b) => b.kind));
    const k = !taken.has("trade") ? "trade" : !taken.has("wishlist") ? "wishlist" : "custom";
    setKind(k);
    setName(NEW_KINDS.find((n) => n.kind === k)!.suggestion);
    setMode({ at: "create" });
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setMode({ at: "list" });
    } catch (e) {
      Alert.alert("Something went wrong", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const manage = (b: Binder) =>
    Alert.alert(b.name, binderSummary(b), [
      {
        text: "Rename",
        onPress: () => {
          setName(b.name);
          setMode({ at: "rename", binder: b });
        },
      },
      { text: "Delete binder", style: "destructive", onPress: () => confirmDelete(b) },
      { text: "Cancel", style: "cancel" },
    ]);

  const confirmDelete = (b: Binder) => {
    if (!b.copies) return void run(() => onDelete(b, "delete"));
    const move = { text: "Move cards to Collection", onPress: () => run(() => onDelete(b, "move")) };
    const del = { text: `Delete ${b.copies} cards`, style: "destructive" as const, onPress: () => run(() => onDelete(b, "delete")) };
    Alert.alert(
      `Delete ${b.name}?`,
      b.kind === "wishlist" ? "The cards on it are wishes, not cards you own." : "What should happen to the cards in it?",
      b.kind === "wishlist" ? [del, move, { text: "Cancel", style: "cancel" }] : [move, del, { text: "Cancel", style: "cancel" }]
    );
  };

  if (mode.at !== "list") {
    const creating = mode.at === "create";
    const hint = NEW_KINDS.find((n) => n.kind === kind)!.hint;
    return (
      <Sheet visible={visible} onClose={onClose} title={creating ? "New binder" : "Rename binder"}>
        {creating && (
          <>
            <View style={styles.kinds}>
              {NEW_KINDS.map((n) => (
                <Chip
                  key={n.kind}
                  label={n.label}
                  icon={BINDER_LOOK[n.kind].icon}
                  active={kind === n.kind}
                  onPress={() => {
                    // Swap a suggested name for the new kind's, but keep a typed one.
                    if (!name || NEW_KINDS.some((x) => x.suggestion === name)) setName(n.suggestion);
                    setKind(n.kind);
                  }}
                />
              ))}
            </View>
            <Text variant="caption" color={color.textSecondary}>
              {hint}
            </Text>
          </>
        )}
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Binder name"
          placeholderTextColor={color.textTertiary}
          maxLength={40}
          autoFocus={!creating}
          selectionColor={color.accent}
          style={styles.input}
        />
        <View style={styles.row}>
          <Button label="Back" variant="secondary" onPress={() => setMode({ at: "list" })} style={{ flex: 1 }} />
          <Button
            label={creating ? "Create" : "Save"}
            loading={busy}
            disabled={!name.trim()}
            onPress={() => run(() => (creating ? onCreate(name.trim(), kind) : onRename(mode.binder, name.trim())))}
            style={{ flex: 2 }}
          />
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Your binders">
      <ScrollView style={{ maxHeight: height * 0.42 }} contentContainerStyle={{ gap: space.sm }} showsVerticalScrollIndicator={false}>
        {binders.map((b) => {
          const look = BINDER_LOOK[b.kind] ?? BINDER_LOOK.custom;
          const on = b.id === activeId;
          return (
            <Touchable
              key={b.id}
              onPress={() => {
                tap();
                onPick(b);
              }}
              pressedScale={0.98}
              style={[styles.binder, on && styles.binderOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <IconBubble icon={look.icon} tint={look.tint} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {b.name}
                </Text>
                <Text variant="caption" color={color.textSecondary}>
                  {binderSummary(b)}
                </Text>
              </View>
              {on && <Ionicons name="checkmark-circle" size={22} color={color.accent} />}
              {b.kind !== "collection" && (
                <Pressable onPress={() => manage(b)} hitSlop={8} style={styles.more} accessibilityRole="button" accessibilityLabel={`Manage ${b.name}`}>
                  <Ionicons name="ellipsis-horizontal" size={18} color={color.textSecondary} />
                </Pressable>
              )}
            </Touchable>
          );
        })}
        <Touchable onPress={startCreate} pressedScale={0.98} style={styles.newBinder} accessibilityRole="button">
          <Ionicons name="add" size={20} color={color.accent} />
          <Text variant="bodyStrong" color={color.accent}>
            New binder
          </Text>
        </Touchable>
      </ScrollView>

      <View style={styles.row}>
        <Button label="Import" icon="download-outline" variant="secondary" onPress={onImport} style={{ flex: 1 }} />
        <Touchable
          onPress={async () => {
            setExporting(true);
            try {
              await onExport();
            } catch (e) {
              Alert.alert("Couldn't export", (e as Error).message);
            } finally {
              setExporting(false);
            }
          }}
          style={styles.exportBtn}
          accessibilityRole="button"
        >
          {exporting ? <ActivityIndicator color={color.ink} /> : <Ionicons name="share-outline" size={18} color={color.ink} />}
          <Text variant="bodyStrong" style={{ fontFamily: font.bold }}>
            Export CSV
          </Text>
        </Touchable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  binder: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: color.surface2 },
  binderOn: { backgroundColor: color.accentSoft },
  more: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  newBinder: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: color.accent,
  },
  kinds: { flexDirection: "row", gap: space.sm },
  input: { height: 52, borderRadius: radius.md, paddingHorizontal: space.md, backgroundColor: color.surface2, color: color.ink, fontFamily: font.semibold, fontSize: 17 },
  row: { flexDirection: "row", gap: space.sm },
  exportBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    borderRadius: 25,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
});
