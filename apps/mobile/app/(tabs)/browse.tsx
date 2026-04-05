import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../src/lib/constants";
import { searchCards } from "../../src/lib/api";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - 48) / 2;
const CARD_HEIGHT = CARD_WIDTH * 1.4;

const RARITY_COLOR: Record<string, string> = {
  common: "#AAA",
  uncommon: "#C0C0C0",
  rare: "#FFD700",
  mythic: "#FF6B35",
  special: "#A855F7",
};

const COLOR_SYMBOLS: Record<string, string> = {
  W: "☀️", U: "💧", B: "💀", R: "🔥", G: "🌲",
};

type Card = {
  variantId: string;
  name: string;
  imageUri: string | null;
  rarity: string | null;
  priceUsd: number | null;
  typeLine: string | null;
  manaCost: string | null;
};

export default function BrowseScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setCards([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      const { cards: results } = await searchCards(q.trim(), 40);
      setCards(results);
      setSearched(true);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  const renderCard = ({ item }: { item: Card }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push({ pathname: "/(card)/[id]", params: { id: item.variantId } } as never)}
      activeOpacity={0.85}
    >
      {item.imageUri ? (
        <Image source={{ uri: item.imageUri }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={styles.cardImagePlaceholder}>
          <Ionicons name="image-outline" size={32} color={COLORS.textMuted} />
          <Text style={styles.placeholderName}>{item.name}</Text>
        </View>
      )}
      <View style={styles.cardFooter}>
        <View style={[styles.rarityDot, { backgroundColor: RARITY_COLOR[item.rarity ?? ""] ?? "#666" }]} />
        <Text style={styles.cardPrice} numberOfLines={1}>
          {item.priceUsd != null ? `$${item.priceUsd.toFixed(2)}` : "—"}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={COLORS.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search cards…"
          placeholderTextColor={COLORS.textMuted}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCapitalize="words"
        />
        {loading && <ActivityIndicator size="small" color={COLORS.accent} style={{ marginRight: 10 }} />}
      </View>

      {/* Results */}
      {!searched && !loading ? (
        <View style={styles.hint}>
          <Ionicons name="sparkles-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.hintTitle}>Browse Cards</Text>
          <Text style={styles.hintSub}>Search by card name, type, or set</Text>
        </View>
      ) : (
        <FlatList
          data={cards}
          keyExtractor={(c) => c.variantId}
          numColumns={2}
          renderItem={renderCard}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.hint}>
                <Text style={styles.hintSub}>No cards found for "{query}"</Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 16, paddingVertical: 12 },
  grid: { paddingHorizontal: 16, paddingBottom: 24 },
  row: { gap: 12, marginBottom: 12 },
  card: {
    width: CARD_WIDTH,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
  },
  cardImage: { width: CARD_WIDTH, height: CARD_HEIGHT },
  cardImagePlaceholder: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  placeholderName: { color: COLORS.textMuted, fontSize: 12, textAlign: "center", paddingHorizontal: 8 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  rarityDot: { width: 8, height: 8, borderRadius: 4 },
  cardPrice: { color: COLORS.text, fontSize: 12, fontWeight: "600", flex: 1 },
  hint: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, marginTop: 80 },
  hintTitle: { color: COLORS.text, fontSize: 22, fontWeight: "700" },
  hintSub: { color: COLORS.textMuted, fontSize: 15 },
});
