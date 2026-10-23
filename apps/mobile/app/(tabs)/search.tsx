import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { color, space, TAB_BAR_CLEARANCE } from "@/design/tokens";
import { setLabel } from "@/design/format";
import { getMarketHome, searchCards } from "@/lib/api";
import { CardTile, EmptyState, GridSpacer, padToColumns, PageHeader, Screen, SearchField, SkeletonGrid, Text } from "@/ui";

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
  const latestQuery = useRef("");

  useEffect(() => {
    getMarketHome()
      .then((m) => setPopular(m.popular.map((c) => ({ ...c, priceUsd: c.bestUsd ?? c.priceUsd }))))
      .catch(() => {});
  }, []);

  const run = useCallback(async (q: string) => {
    latestQuery.current = q;
    setLoading(true);
    setError(false);
    try {
      const { cards } = await searchCards(q, 60);
      // Drop responses that arrive after the user kept typing.
      if (latestQuery.current === q) setResults(cards);
    } catch {
      if (latestQuery.current === q) setError(true);
    } finally {
      if (latestQuery.current === q) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      latestQuery.current = "";
      setResults([]);
      setLoading(false);
      return;
    }
    const t = setTimeout(() => run(q), 300);
    return () => clearTimeout(t);
  }, [query, run]);

  const searching = query.trim().length >= 2;
  const data = searching ? results : popular;

  return (
    <Screen>
      <PageHeader title="Search" />
      <View style={styles.searchWrap}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Card name, type or set" loading={loading} />
      </View>

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
                <EmptyState icon="cloud-offline-outline" title="Search is unavailable" body="Check your connection and try again." action="Retry" onAction={() => run(query.trim())} />
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
              onPress={() => router.push({ pathname: "/card/[id]", params: { id: item.variantId } })}
            />
            ) : (
              <GridSpacer />
            )
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchWrap: { paddingHorizontal: space.lg, paddingBottom: space.md },
  grid: { paddingHorizontal: space.lg, paddingBottom: TAB_BAR_CLEARANCE, flexGrow: 1 },
  row: { gap: space.md, marginBottom: space.xl },
  listLabel: { marginTop: space.sm, marginBottom: space.md },
});
