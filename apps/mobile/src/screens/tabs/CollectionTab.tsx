import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Image,
  type ViewStyle,
} from "react-native";
import { getDb, searchCards } from "../../lib/localDb";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import type { SQLiteDatabase } from "expo-sqlite";
import { colors, spacing, radii, typography, shadows, tabColors } from "../../theme";
import { Header } from "../../components/ui/Header";

const t = colors.light;
const tc = tabColors.collection;

interface CardItem {
  variantId: string;
  name: string;
  setId?: string;
  collectorNumber?: string;
  rarity?: string;
  imageUri?: string;
  cmc?: number;
  colors?: string;
}

export function CollectionTab() {
  const { user } = useAuth();
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [totalValue, setTotalValue] = useState<number | null>(null);

  useEffect(() => {
    getDb().then(setDb);
  }, []);

  useEffect(() => {
    if (!db || !searchQuery) return;
    const timeout = setTimeout(async () => {
      const results = await searchCards(db, searchQuery, 50);
      setCards(results as unknown as CardItem[]);
    }, 300);
    return () => clearTimeout(timeout);
  }, [db, searchQuery]);

  const fetchCollectionValue = useCallback(async () => {
    if (!user) return;
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";
      const res = await fetch(`${apiUrl}/v1/collection/${user.id}`);
      const data = await res.json();
      // Basic value calculation from events
      setTotalValue(data.events?.length ?? 0);
    } catch {
      // Silently fail - offline mode
    }
  }, [user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCollectionValue();
    setRefreshing(false);
  }, [fetchCollectionValue]);

  const renderCard = ({ item }: { item: CardItem }) => (
    <TouchableOpacity style={styles.cardRow}>
      {item.imageUri && (
        <Image source={{ uri: item.imageUri }} style={styles.cardImage} />
      )}
      <View style={styles.cardInfo}>
        <Text style={styles.cardName}>{item.name}</Text>
        <Text style={styles.cardMeta}>
          {item.setId?.toUpperCase()} {item.collectorNumber} {item.rarity ? `- ${item.rarity}` : ""}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Header
        title="Collection"
        right={
          totalValue !== null ? (
            <Text style={styles.valueText}>{totalValue} cards</Text>
          ) : undefined
        }
      />

      <TextInput
        style={styles.searchInput}
        placeholder="Search cards..."
        placeholderTextColor={t.textMuted}
        value={searchQuery}
        onChangeText={setSearchQuery}
        autoCorrect={false}
      />

      <FlatList
        data={cards}
        keyExtractor={(item) => item.variantId}
        renderItem={renderCard}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tc.color}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {searchQuery
                ? "No cards found"
                : "Search for cards or scan to add them"}
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.bg,
  },
  valueText: {
    ...typography.caption,
    color: tc.color,
    fontWeight: "600",
  },
  searchInput: {
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: t.textPrimary,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  cardRow: {
    flexDirection: "row",
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    ...shadows.card,
  } as ViewStyle,
  cardImage: {
    width: 48,
    height: 68,
    borderRadius: radii.sm,
    marginRight: spacing.md,
  },
  cardInfo: {
    flex: 1,
    justifyContent: "center",
  },
  cardName: {
    ...typography.body,
    fontWeight: "600",
    color: t.textPrimary,
  },
  cardMeta: {
    ...typography.small,
    color: t.textSecondary,
    marginTop: spacing.xs,
  },
  empty: {
    paddingTop: 60,
    alignItems: "center",
  },
  emptyText: {
    ...typography.body,
    color: t.textMuted,
  },
});
