// Search any card and add it to the deck, one tap per copy. Cards already in
// the deck show their count with a minus button.
import React, { useEffect, useRef, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, radius, space } from "@/design/tokens";
import { font } from "@/design/fonts";
import { formatUsd, setLabel } from "@/design/format";
import { searchCards, type DeckCard } from "@/lib/api";
import { countOf } from "@/lib/deckEdits";
import { CardArt, SearchField, Segmented, Text, tap } from "@/ui";

export type SearchResult = Awaited<ReturnType<typeof searchCards>>["cards"][number];
type Section = "mainboard" | "sideboard";

const SECTIONS: ReadonlyArray<{ value: Section; label: string }> = [
  { value: "mainboard", label: "Main deck" },
  { value: "sideboard", label: "Sideboard" },
];

const IDEAS = ["Sol Ring", "Counterspell", "Swords to Plowshares", "Cultivate", "Lightning Bolt", "Rhystic Study"];

export function AddCardsSheet({
  visible,
  cards,
  onAdd,
  onRemoveOne,
  onClose,
}: {
  visible: boolean;
  cards: DeckCard[];
  onAdd: (card: SearchResult, section: Section) => void;
  onRemoveOne: (name: string, section: Section) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<Section>("mainboard");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (visible) setAdded(0);
  }, [visible]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { cards: found } = await searchCards(q, 40);
        if (n !== seq.current) return;
        // One row per card name: the deck counts by name, not printing.
        const seen = new Set<string>();
        setResults(found.filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true))));
      } catch {
        if (n === seq.current) setResults([]);
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const add = (c: SearchResult) => {
    tap();
    setAdded((n) => n + 1);
    onAdd(c, section);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: space.lg }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text variant="section">Add cards</Text>
            <Text variant="callout" color={color.textSecondary}>
              {added ? `${added} added` : "Tap + to add a copy"}
            </Text>
          </View>
          <Pressable onPress={onClose} style={styles.done} accessibilityRole="button">
            <Text variant="bodyStrong" color="#FFFFFF">
              Done
            </Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: space.lg, gap: space.md, marginTop: space.lg }}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search any card" loading={loading} autoFocus />
          <Segmented options={SECTIONS} value={section} onChange={setSection} />
        </View>

        {query.trim().length < 2 ? (
          <View style={styles.ideas}>
            <Text variant="label" color={color.textSecondary} style={{ width: "100%" }}>
              Try
            </Text>
            {IDEAS.map((s) => (
              <Pressable key={s} onPress={() => setQuery(s)} style={styles.idea} accessibilityRole="button">
                <Text variant="callout">{s}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(r) => r.variantId}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.xxl }}
            ItemSeparatorComponent={() => <View style={styles.divider} />}
            ListEmptyComponent={
              loading ? undefined : (
                <Text variant="body" color={color.textSecondary} align="center" style={{ marginTop: space.xl }}>
                  No cards found for “{query.trim()}”.
                </Text>
              )
            }
            renderItem={({ item }) => {
              const n = countOf(cards, item.name, section);
              const meta = [setLabel(item.setId, item.collectorNumber), item.typeLine].filter(Boolean).join(" · ");
              return (
                <View style={styles.row}>
                  <View style={styles.art}>
                    <CardArt uri={item.imageUri} name={item.name} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {item.name}
                    </Text>
                    {!!meta && (
                      <Text variant="caption" color={color.textSecondary} numberOfLines={1}>
                        {meta}
                      </Text>
                    )}
                    <Text variant="price" style={{ marginTop: 2 }}>
                      {item.priceUsd != null ? formatUsd(item.priceUsd) : "—"}
                    </Text>
                  </View>
                  {n > 0 && (
                    <>
                      <Pressable
                        onPress={() => {
                          tap();
                          onRemoveOne(item.name, section);
                        }}
                        style={[styles.roundBtn, styles.minus]}
                        hitSlop={4}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove a copy of ${item.name}`}
                      >
                        <Ionicons name="remove" size={18} color={color.ink} />
                      </Pressable>
                      <Text style={styles.count}>{n}</Text>
                    </>
                  )}
                  <Pressable
                    onPress={() => add(item)}
                    style={[styles.roundBtn, n > 0 ? styles.plusOn : styles.plus]}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${item.name}`}
                  >
                    <Ionicons name="add" size={20} color={n > 0 ? "#FFFFFF" : color.ink} />
                  </Pressable>
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg },
  done: { height: 38, paddingHorizontal: 18, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: color.ink },
  ideas: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, padding: space.lg },
  idea: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 16, backgroundColor: color.surface2 },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.borderStrong, marginLeft: 56 },
  art: { width: 44 },
  roundBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  plus: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.borderStrong },
  plusOn: { backgroundColor: color.accent },
  minus: { backgroundColor: color.surface3 },
  count: { minWidth: 22, textAlign: "center", fontFamily: font.heavy, fontSize: 16, color: color.ink, fontVariant: ["tabular-nums"] },
});
