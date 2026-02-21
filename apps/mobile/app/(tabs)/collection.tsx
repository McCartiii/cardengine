import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/lib/constants";
import { getCollectionCards, type OwnedCard } from "@/lib/api";

type SortMode = "value" | "name" | "qty" | "added";

const SORT_OPTIONS: Array<{ key: SortMode; label: string }> = [
  { key: "value", label: "Value" },
  { key: "name", label: "Name" },
  { key: "qty", label: "Qty" },
  { key: "added", label: "Newest" },
];

const RARITY_COLOR: Record<string, string> = {
  common: "#9CA3AF", uncommon: "#CBD5E1", rare: "#F59E0B", mythic: "#EF4444", special: "#A855F7",
};

export default function CollectionScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("value");
  const [cards, setCards] = useState<OwnedCard[]>([]);
  const [totalCards, setTotalCards] = useState(0);
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSort = useRef(sort);

  const load = useCallback(async (q: string, s: SortMode, p: number, append = false) => {
    if (!append) { if (!refreshing) setLoading(true); }
    else setLoadingMore(true);
    try {
      const res = await getCollectionCards({ q: q || undefined, sort: s, page: p, limit: 60 });
      setCards((prev) => append ? [...prev, ...res.cards] : res.cards);
      setTotalCards(res.totalCards);
      setTotalValue(res.totalValue);
      setHasMore(res.hasMore);
      setPage(p);
    } catch {
      // not authed or empty
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  // Load when tab gains focus (pick up newly scanned cards)
  useFocusEffect(useCallback(() => {
    load(query, sort, 1);
  }, [sort]));

  // Debounced search input
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(query, sort, 1), 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  const handleSort = (s: SortMode) => {
    setSort(s);
    currentSort.current = s;
    load(query, s, 1);
  };

  const onRefresh = () => { setRefreshing(true); load(query, sort, 1); };
  const onEndReached = () => { if (hasMore && !loadingMore) load(query, sort, page + 1, true); };

  const renderCard = ({ item }: { item: OwnedCard }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push({ pathname: "/(card)/[id]", params: { id: item.variantId } } as never)}
      activeOpacity={0.8}
    >
      {item.imageUri ? (
        <Image source={{ uri: item.imageUri }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Text style={styles.cardInitials}>{item.name.slice(0, 2).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.qtyBadge}>
        <Text style={styles.qtyText}>×{item.quantity}</Text>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.cardMeta}>
          {item.rarity && (
            <View style={[styles.rarityDot, { backgroundColor: RARITY_COLOR[item.rarity] ?? "#666" }]} />
          )}
          <Text style={styles.cardPrice}>
            {item.lineValue != null ? `$${item.lineValue.toFixed(2)}` : "—"}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Collection</Text>
          {totalCards > 0 && (
            <View style={styles.valuePill}>
              <Text style={styles.valuePillText}>
                ${totalValue.toFixed(0)} · {totalCards} cards
              </Text>
            </View>
          )}
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={16} color={COLORS.textMuted} style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search your collection…"
            placeholderTextColor={COLORS.textMuted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        <View style={styles.sortRow}>
          {SORT_OPTIONS.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[styles.sortChip, sort === key && styles.sortChipActive]}
              onPress={() => handleSort(key)}
            >
              <Text style={[styles.sortChipText, sort === key && styles.sortChipTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      ) : cards.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="albums-outline" size={52} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>
            {query ? `No results for "${query}"` : "Your collection is empty"}
          </Text>
          <Text style={styles.emptyHint}>
            {query ? "Try a different search" : "Scan cards or browse to add them"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={cards}
          keyExtractor={(c) => c.variantId}
          numColumns={3}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
          renderItem={renderCard}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={COLORS.accent} style={{ marginVertical: 16 }} /> : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 10 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  valuePill: {
    backgroundColor: COLORS.surface, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: COLORS.border ?? "#222",
  },
  valuePillText: { color: COLORS.accent, fontSize: 13, fontWeight: "700" },
  searchRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.surface, borderRadius: 12,
    paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.border ?? "#222",
  },
  searchInput: { flex: 1, paddingVertical: 10, color: COLORS.text, fontSize: 15 },
  sortRow: { flexDirection: "row", gap: 6 },
  sortChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border ?? "#222",
  },
  sortChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  sortChipText: { color: COLORS.textMuted, fontSize: 12, fontWeight: "700" },
  sortChipTextActive: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptyHint: { color: COLORS.textMuted, fontSize: 14, textAlign: "center" },
  grid: { padding: 12, paddingBottom: 32 },
  row: { gap: 8, marginBottom: 8 },
  card: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 10,
    overflow: "hidden", borderWidth: 1, borderColor: COLORS.border ?? "#222",
  },
  cardImage: { width: "100%", aspectRatio: 0.72 },
  cardImagePlaceholder: { backgroundColor: COLORS.background, alignItems: "center", justifyContent: "center" },
  cardInitials: { color: COLORS.textMuted, fontSize: 18, fontWeight: "700" },
  qtyBadge: {
    position: "absolute", top: 4, right: 4,
    backgroundColor: "rgba(0,0,0,0.72)", borderRadius: 8,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  qtyText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  cardInfo: { padding: 6 },
  cardName: { color: COLORS.text, fontSize: 11, fontWeight: "600", lineHeight: 14 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  rarityDot: { width: 6, height: 6, borderRadius: 3 },
  cardPrice: { color: COLORS.textMuted, fontSize: 11 },
});
