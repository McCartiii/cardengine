import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { color, space, TAB_BAR_CLEARANCE } from "@/design/tokens";
import { displaySymbol, displayToUsd, setLabel } from "@/design/format";
import { getMarketHome, searchCards } from "@/lib/api";
import { NO_FILTERS, activeCount, filterChips, toApiFilters, type FilterState } from "@/lib/searchFilters";
import { useSettings } from "@/store/settingsStore";
import { SearchFilterSheet } from "@/components/SearchFilterSheet";
import { CardTile, EmptyState, GridSpacer, IconButton, padToColumns, PageHeader, Screen, SearchField, SkeletonGrid, Text, tap } from "@/ui";

interface GridCard {
  variantId: string;
  name: string;
  imageUri: string | null;
  rarity: string | null;
  setId: string | null;
  collectorNumber: string | null;
  priceUsd: number | null;
}

const COLUMNS = 3;

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GridCard[]>([]);
  const [popular, setPopular] = useState<GridCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState<FilterState>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const recent = useSettings((s) => s.recentSearches);
  const addRecent = useSettings((s) => s.addRecentSearch);
  const clearRecent = useSettings((s) => s.clearRecentSearches);
  const latestQuery = useRef("");

  useEffect(() => {
    getMarketHome()
      .then((m) => setPopular(m.popular.map((c) => ({ ...c, priceUsd: c.bestUsd ?? c.priceUsd }))))
      .catch(() => {});
  }, []);

  const filterCount = activeCount(filters);
  const hasText = query.trim().length >= 2;
  const searching = hasText || filterCount > 0;

  const run = useCallback(async (q: string, f: FilterState) => {
    // A key for this exact search, so late answers to older ones are dropped.
    const key = JSON.stringify([q, f]);
    latestQuery.current = key;
    setLoading(true);
    setError(false);
    try {
      const { cards } = await searchCards(q, 60, toApiFilters(f, displayToUsd));
      if (latestQuery.current === key) setResults(cards);
    } catch {
      if (latestQuery.current === key) setError(true);
    } finally {
      if (latestQuery.current === key) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 && activeCount(filters) === 0) {
      latestQuery.current = "";
      setResults([]);
      setLoading(false);
      return;
    }
    const t = setTimeout(() => run(q.length >= 2 ? q : "", filters), 300);
    return () => clearTimeout(t);
  }, [query, filters, run]);

  const openCard = (variantId: string) => {
    if (hasText) addRecent(query);
    router.push({ pathname: "/card/[id]", params: { id: variantId } });
  };

  const chips = filterChips(filters, displaySymbol());
  const data = searching ? results : popular;

  return (
    <Screen>
      <PageHeader title="Search" />
      <View style={styles.searchWrap}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search card names" loading={loading} style={{ flex: 1 }} />
        <View>
          <IconButton icon="options-outline" label="Filters" variant={filterCount ? "dark" : "surface"} size={52} onPress={() => setShowFilters(true)} />
          {filterCount > 0 && (
            <View style={styles.countBadge} pointerEvents="none">
              <Text variant="number" color="#FFFFFF" style={{ fontSize: 11 }}>
                {filterCount}
              </Text>
            </View>
          )}
        </View>
      </View>

      {chips.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ flexGrow: 0 }}>
          {chips.map((c) => (
            <Pressable
              key={c.key}
              onPress={() => {
                tap();
                setFilters(c.remove);
              }}
              style={styles.filterChip}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${c.label} filter`}
            >
              <Text variant="callout" color="#FFFFFF">
                {c.label}
              </Text>
              <Ionicons name="close" size={14} color="rgba(255,255,255,0.8)" />
            </Pressable>
          ))}
          <Pressable onPress={() => setFilters(NO_FILTERS)} style={styles.clearChip} accessibilityRole="button">
            <Text variant="callout" color={color.textSecondary}>
              Clear all
            </Text>
          </Pressable>
        </ScrollView>
      )}

      {!searching && recent.length > 0 && (
        <View style={styles.recent}>
          <View style={styles.recentHead}>
            <Text variant="label" color={color.textTertiary}>
              Recent
            </Text>
            <Pressable onPress={clearRecent} hitSlop={8} accessibilityRole="button">
              <Text variant="callout" color={color.accent}>
                Clear
              </Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {recent.map((r) => (
              <Pressable key={r} onPress={() => setQuery(r)} style={styles.recentChip} accessibilityRole="button">
                <Ionicons name="time-outline" size={14} color={color.textTertiary} />
                <Text variant="callout">{r}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {searching && loading && results.length === 0 ? (
        <SkeletonGrid columns={COLUMNS} />
      ) : (
        <FlatList
          data={padToColumns(data, COLUMNS)}
          keyExtractor={(c, i) => c?.variantId ?? `spacer-${i}`}
          numColumns={COLUMNS}
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          ListHeaderComponent={
            data.length > 0 ? (
              <Text variant="label" color={color.textTertiary} style={styles.listLabel}>
                {searching ? `${results.length}${results.length === 60 ? "+" : ""} results` : "Popular right now"}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            searching ? (
              error ? (
                <EmptyState icon="cloud-offline-outline" title="Search is unavailable" body="Check your connection and try again." action="Retry" onAction={() => run(hasText ? query.trim() : "", filters)} />
              ) : filterCount > 0 ? (
                <EmptyState
                  icon="options-outline"
                  title={hasText ? `No cards match “${query.trim()}” with these filters` : "No cards match these filters"}
                  body="Try removing a filter."
                  action="Clear filters"
                  onAction={() => setFilters(NO_FILTERS)}
                />
              ) : (
                <EmptyState icon="search" title={`No cards match “${query.trim()}”`} body="Try a shorter name or check the spelling." />
              )
            ) : (
              <EmptyState icon="sparkles-outline" title="Find any card" body="Search by name to see printings and prices across markets." />
            )
          }
          renderItem={({ item }) =>
            item ? (
            <CardTile
              name={item.name}
              imageUri={item.imageUri}
              price={item.priceUsd}
              rarity={item.rarity}
              subtitle={setLabel(item.setId, item.collectorNumber)}
              showName={false}
              style={{ flex: 1 }}
              onPress={() => openCard(item.variantId)}
            />
            ) : (
              <GridSpacer />
            )
          }
        />
      )}
      <SearchFilterSheet visible={showFilters} value={filters} onApply={setFilters} onClose={() => setShowFilters(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchWrap: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md },
  countBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.accent,
    borderWidth: 2,
    borderColor: color.bg,
  },
  chipRow: { gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 4, height: 32, paddingLeft: 12, paddingRight: 9, borderRadius: 16, backgroundColor: color.ink },
  clearChip: { height: 32, paddingHorizontal: 10, justifyContent: "center" },
  recent: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm },
  recentHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  recentChip: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border },
  grid: { paddingHorizontal: space.lg, paddingBottom: TAB_BAR_CLEARANCE, flexGrow: 1 },
  row: { gap: 14, marginBottom: space.xxl },
  listLabel: { marginTop: space.sm, marginBottom: space.md },
});
