import React, { useCallback, useEffect, useState } from "react";
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
import { searchCards, type CollectionEntry } from "@/lib/api";
import { COLORS } from "@/lib/constants";

interface CardRow {
  variantId: string;
  name: string;
  imageUri: string | null;
  rarity: string | null;
  priceUsd: number | null;
  typeLine: string | null;
  manaCost: string | null;
}

export default function CollectionScreen() {
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const doSearch = useCallback(async (q: string, silent = false) => {
    if (!q.trim()) {
      setCards([]);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const res = await searchCards(q);
      setCards(res.cards);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Debounced search as user types
  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    doSearch(query, true);
  }, [query, doSearch]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Collection</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search cards..."
          placeholderTextColor={COLORS.textMuted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator style={styles.spinner} color={COLORS.accent} />
      ) : cards.length === 0 && query.length > 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No cards found for "{query}"</Text>
        </View>
      ) : cards.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Search for a card to get started</Text>
          <Text style={styles.emptySubText}>or scan cards with the Scan tab</Text>
        </View>
      ) : (
        <FlatList
          data={cards}
          keyExtractor={(c) => c.variantId}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.accent}
            />
          }
          renderItem={({ item }) => <CardGridItem card={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function rarityColor(rarity: string | null): string {
  switch (rarity?.toLowerCase()) {
    case "mythic": return "#f97316";
    case "rare":   return "#eab308";
    case "uncommon": return "#94a3b8";
    default: return COLORS.textMuted;
  }
}

function CardGridItem({ card }: { card: CardRow }) {
  return (
    <View style={styles.card}>
      {card.imageUri ? (
        <Image source={{ uri: card.imageUri }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Text style={styles.cardInitials}>{card.name.slice(0, 2).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={2}>{card.name}</Text>
        <View style={styles.cardMeta}>
          {card.rarity && (
            <Text style={[styles.rarity, { color: rarityColor(card.rarity) }]}>
              {card.rarity.charAt(0).toUpperCase()}
            </Text>
          )}
          {card.priceUsd != null && (
            <Text style={styles.price}>${card.priceUsd.toFixed(2)}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  searchInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  spinner: { flex: 1 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
  emptySubText: { color: COLORS.border, fontSize: 13 },
  grid: { padding: 12, gap: 10 },
  row: { gap: 10 },
  card: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardImage: {
    width: "100%",
    aspectRatio: 0.72,
  },
  cardImagePlaceholder: {
    backgroundColor: COLORS.surfaceHighlight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInitials: { color: COLORS.textMuted, fontSize: 22, fontWeight: "700" },
  cardInfo: { padding: 8, gap: 4 },
  cardName: { color: COLORS.text, fontSize: 13, fontWeight: "600", lineHeight: 17 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  rarity: { fontSize: 12, fontWeight: "700" },
  price: { color: COLORS.accent, fontSize: 12, fontWeight: "500" },
});
