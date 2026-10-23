import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { color, space, TAB_BAR_CLEARANCE } from "@/design/tokens";
import { formatUsd, setLabel } from "@/design/format";
import { getCollectionCards, type OwnedCard } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import {
  CardTile,
  Chip,
  EmptyState,
  GridSpacer,
  padToColumns,
  Screen,
  SearchField,
  SkeletonGrid,
  Text,
  ActivityRow,
} from "@/ui";

type SortMode = "value" | "name" | "qty" | "added";

const SORT_OPTIONS: ReadonlyArray<{ key: SortMode; label: string }> = [
  { key: "value", label: "Value" },
  { key: "added", label: "Newest" },
  { key: "name", label: "Name" },
  { key: "qty", label: "Quantity" },
];

const COLUMNS = 3;
const PAGE_SIZE = 60;

export default function CollectionScreen() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("value");
  const [cards, setCards] = useState<OwnedCard[]>([]);
  const [totals, setTotals] = useState({ cards: 0, value: 0 });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async (q: string, s: SortMode, p: number) => {
    const id = ++requestId.current;
    if (p > 1) setLoadingMore(true);
    try {
      const res = await getCollectionCards({ q: q || undefined, sort: s, page: p, limit: PAGE_SIZE });
      if (id !== requestId.current) return;
      setCards((prev) => (p > 1 ? [...prev, ...res.cards] : res.cards));
      setTotals({ cards: res.totalCards, value: res.totalValue });
      setHasMore(res.hasMore);
      setPage(p);
      setStatus("ready");
    } catch {
      if (id === requestId.current && p === 1) setStatus("error");
    } finally {
      if (id === requestId.current) {
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, []);

  // Refresh on focus so freshly scanned cards appear.
  useFocusEffect(
    useCallback(() => {
      if (session) load(query, sort, 1);
    }, [session, sort, load])
  );

  const firstQuery = useRef(true);
  useEffect(() => {
    if (firstQuery.current) {
      firstQuery.current = false;
      return;
    }
    if (!session) return;
    const t = setTimeout(() => load(query.trim(), sort, 1), 300);
    return () => clearTimeout(t);
  }, [query]);

  if (!session) {
    return (
      <Screen>
        <Header />
        <EmptyState
          icon="albums-outline"
          title="Keep your collection in one place"
          body="Sign in to save scanned cards and see what they're worth."
          action="Sign in"
          onAction={() => router.push("/(auth)/sign-in")}
        />
      </Screen>
    );
  }

  const isEmptyCollection = status === "ready" && totals.cards === 0 && !query;

  return (
    <Screen>
      <Header value={status === "ready" ? totals : undefined} />
      {!isEmptyCollection && (
        <View style={styles.controls}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search your collection" style={{ marginHorizontal: space.lg }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {SORT_OPTIONS.map((o) => (
              <Chip key={o.key} label={o.label} active={sort === o.key} onPress={() => setSort(o.key)} />
            ))}
          </ScrollView>
        </View>
      )}

      {status === "loading" ? (
        <SkeletonGrid columns={COLUMNS} />
      ) : status === "error" ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load your collection"
          body="Check your connection and try again."
          action="Retry"
          onAction={() => {
            setStatus("loading");
            load(query, sort, 1);
          }}
        />
      ) : isEmptyCollection ? (
        <EmptyState
          icon="scan"
          title="Your collection is empty"
          body="Scan a card or add one from its page to start tracking value."
          action="Scan cards"
          onAction={() => router.navigate("/(tabs)/scan")}
        />
      ) : (
        <FlatList
          data={padToColumns(cards, COLUMNS)}
          keyExtractor={(c, i) => c?.holdingId ?? `spacer-${i}`}
          numColumns={COLUMNS}
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasMore && !loadingMore) load(query, sort, page + 1);
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(query, sort, 1);
              }}
              tintColor={color.textSecondary}
            />
          }
          ListEmptyComponent={<EmptyState icon="search" title={`Nothing matches “${query.trim()}”`} />}
          ListFooterComponent={loadingMore ? <ActivityRow /> : null}
          renderItem={({ item }) =>
            item ? (
              <CardTile
                name={item.name}
                imageUri={item.imageUri}
                price={item.priceUsd}
                foil={item.finish !== "nonfoil"}
                quantity={item.quantity}
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

function Header({ value }: { value?: { cards: number; value: number } }) {
  return (
    <View style={styles.header}>
      <Text variant="title">Collection</Text>
      {value && value.cards > 0 && (
        <View style={styles.totals}>
          <Text variant="priceLarge" style={{ fontSize: 30, lineHeight: 34 }}>
            {formatUsd(value.value)}
          </Text>
          <Text variant="callout" color={color.textSecondary}>
            {value.cards} {value.cards === 1 ? "card" : "cards"}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md },
  totals: { flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: space.xs },
  controls: { gap: space.md, paddingBottom: space.lg },
  chips: { gap: space.sm, paddingHorizontal: space.lg },
  grid: { paddingHorizontal: space.lg, paddingBottom: TAB_BAR_CLEARANCE, flexGrow: 1 },
  row: { gap: 14, marginBottom: space.xxl },
});
