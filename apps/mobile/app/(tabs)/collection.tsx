import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import { color, space } from "@/design/tokens";
import { font } from "@/design/fonts";
import { formatUsd } from "@/design/format";
import { getCollectionCards, type CollectionSort, type OwnedCard } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { binderPage, EmptyPocket, FlipBook, Pocket, pocketWidthForHeight, SearchField, Segmented, Sheet, Text, Touchable, tap } from "@/ui";

const PER_PAGE = 9;
const FETCH_SIZE = 90;
// Margin around the pockets and the gutter between them.
const MARGIN = 12;
const GUTTER = 6;

type Slot = OwnedCard | null;
type IconName = React.ComponentProps<typeof Ionicons>["name"];

// Each sort, its natural direction first, and how to say each direction.
const SORTS: ReadonlyArray<{ value: CollectionSort; label: string; icon: IconName; dir: "asc" | "desc"; dirLabels: [string, string] }> = [
  { value: "value", label: "Value", icon: "wallet-outline", dir: "desc", dirLabels: ["Highest", "Lowest"] },
  { value: "price", label: "Price", icon: "pricetag-outline", dir: "desc", dirLabels: ["Highest", "Lowest"] },
  { value: "change", label: "Price change", icon: "trending-up", dir: "desc", dirLabels: ["Biggest gains", "Biggest drops"] },
  { value: "added", label: "Date added", icon: "time-outline", dir: "desc", dirLabels: ["Newest", "Oldest"] },
  { value: "type", label: "Card type", icon: "layers-outline", dir: "asc", dirLabels: ["Creatures first", "Lands first"] },
  { value: "rarity", label: "Rarity", icon: "diamond-outline", dir: "asc", dirLabels: ["Mythic first", "Common first"] },
  { value: "name", label: "Name", icon: "text-outline", dir: "asc", dirLabels: ["A to Z", "Z to A"] },
  { value: "qty", label: "Quantity", icon: "copy-outline", dir: "desc", dirLabels: ["Most copies", "Fewest"] },
];

export default function BinderScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Matches the floating tab bar's height and bottom padding, plus a little air.
  const tabBarSpace = 72 + Math.max(insets.bottom - 8, space.md) + space.sm;
  const session = useAuthStore((s) => s.session);
  const [cards, setCards] = useState<OwnedCard[]>([]);
  const [totals, setTotals] = useState({ cards: 0, value: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [fetchedPage, setFetchedPage] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [set, setSet] = useState<string>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [sort, setSort] = useState<CollectionSort>("value");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [sortOpen, setSortOpen] = useState(false);

  // Three rows of pockets fill the page: as wide as the screen allows, unless the height runs out first.
  const [areaHeight, setAreaHeight] = useState(0);
  const byWidth = (width - MARGIN * 2 - GUTTER * 2) / 3;
  const byHeight = pocketWidthForHeight(((areaHeight || height * 0.55) - MARGIN - GUTTER * 2) / 3);
  const pocketWidth = Math.floor(Math.max(70, Math.min(byWidth, byHeight)));

  const load = useCallback(async (p: number) => {
    try {
      const res = await getCollectionCards({ sort, dir, page: p, limit: FETCH_SIZE });
      setCards((prev) => (p > 1 ? [...prev, ...res.cards] : res.cards));
      setTotals({ cards: res.totalCards, value: res.totalValue });
      setHasMore(res.hasMore);
      setFetchedPage(p);
      setStatus("ready");
    } catch {
      if (p === 1) setStatus("error");
    }
  }, [sort, dir]);

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      if (session) load(1);
      else setStatus("ready");
      return () => setStatusBarStyle("dark");
    }, [session, load])
  );

  // Tabs for the sets you own the most of.
  const setTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cards) if (c.setId) counts.set(c.setId, (counts.get(c.setId) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => id);
  }, [cards]);

  const pages = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = cards.filter((c) => (set === "all" || c.setId === set) && (!q || c.name.toLowerCase().includes(q)));
    const slots: Slot[] = [...visible];
    // Once everything is loaded, end on empty sleeves so there's somewhere to scan into.
    if (!hasMore) {
      const pad = PER_PAGE - (slots.length % PER_PAGE);
      for (let i = 0; i < pad; i++) slots.push(null);
    }
    const out: Slot[][] = [];
    for (let i = 0; i < slots.length; i += PER_PAGE) out.push(slots.slice(i, i + PER_PAGE));
    return out.length ? out : [Array<Slot>(PER_PAGE).fill(null)];
  }, [cards, set, query, hasMore]);

  const pickSet = (id: string) => {
    tap();
    setSet(id);
    setPageIndex(0);
  };

  const pickSort = (next: CollectionSort, nextDir: "asc" | "desc") => {
    tap();
    setSort(next);
    setDir(nextDir);
    setPageIndex(0);
  };

  const sortOption = SORTS.find((o) => o.value === sort) ?? SORTS[0];
  const openCard = (c: OwnedCard) => router.push({ pathname: "/card/[id]", params: { id: c.variantId } });
  const scan = () => router.navigate("/(tabs)/scan");

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>Binder</Text>
            <Text variant="caption" color={binderPage.muted} numberOfLines={1}>
              {session
                ? status === "ready"
                  ? `${formatUsd(totals.value)} · ${totals.cards} ${totals.cards === 1 ? "card" : "cards"}`
                  : "Opening your binder…"
                : "Sign in to start collecting"}
            </Text>
          </View>
          {session && (
            <View style={styles.actions}>
              <HeaderButton
                icon={searchOpen ? "close" : "search"}
                label={searchOpen ? "Close search" : "Search binder"}
                onPress={() => {
                  setSearchOpen((o) => !o);
                  if (searchOpen) setQuery("");
                }}
              />
              <HeaderButton icon="swap-vertical" label="Sort" onPress={() => setSortOpen(true)} />
              <HeaderButton icon="sparkles" label="Ask AI about your binder" onPress={() => router.push("/assistant")} />
            </View>
          )}
        </View>

        {searchOpen && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.searchWrap}>
            <SearchField value={query} onChangeText={setQuery} placeholder="Find a card in your binder" autoFocus />
          </Animated.View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.filters}>
          <Pressable onPress={() => setSortOpen(true)} accessibilityRole="button" accessibilityLabel={`Sorted by ${sortOption.label}`} style={styles.sortChip}>
            <Ionicons name={dir === "desc" ? "arrow-down" : "arrow-up"} size={13} color="#FFFFFF" />
            <Text style={styles.sortText}>{sortOption.label}</Text>
          </Pressable>
          <View style={styles.divider} />
          {["all", ...setTabs].map((id) => {
            const on = set === id;
            return (
              <Pressable
                key={id}
                onPress={() => pickSet(id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                hitSlop={6}
                style={[styles.setTab, on && styles.setTabOn]}
              >
                <Text style={[styles.setText, on && styles.setTextOn]}>{id === "all" ? "All sets" : id.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ flex: 1 }} onLayout={(e) => setAreaHeight(e.nativeEvent.layout.height)}>
          {areaHeight > 0 && (
            <FlipBook
              key={`${set}|${query}|${sort}|${dir}`}
              pageCount={pages.length}
              backColor="#17181D"
              onIndexChange={(i) => {
                setPageIndex(i);
                if (hasMore && i >= pages.length - 2) load(fetchedPage + 1);
              }}
              renderPage={(index) => (
                <View style={[styles.page, { height: areaHeight }]}>
                  <View style={[styles.grid, { width: pocketWidth * 3 + GUTTER * 2 }]}>
                    {pages[index].map((c, i) =>
                      c ? (
                        <Pocket
                          key={c.holdingId}
                          width={pocketWidth}
                          name={c.name}
                          uri={c.imageUri}
                          price={c.priceUsd}
                          foil={c.finish !== "nonfoil"}
                          quantity={c.quantity}
                          change={c.changePct}
                          showChange={sort === "change"}
                          order={i}
                          onPress={() => openCard(c)}
                        />
                      ) : (
                        <EmptyPocket key={`empty-${index}-${i}`} width={pocketWidth} label="Scan" onPress={session ? scan : () => router.push("/(auth)/sign-in")} />
                      )
                    )}
                  </View>
                </View>
              )}
            />
          )}
        </View>

        <View style={styles.dots} accessibilityElementsHidden>
          {pages.slice(0, 8).map((_, i) => (
            <View key={i} style={[styles.dot, i === pageIndex && styles.dotOn]} />
          ))}
        </View>
        <View style={{ height: tabBarSpace }} />
      </SafeAreaView>

      <Sheet visible={sortOpen} onClose={() => setSortOpen(false)} title="Sort binder">
        <View style={styles.sortList}>
          {SORTS.map((o) => {
            const on = o.value === sort;
            return (
              <Pressable
                key={o.value}
                onPress={() => {
                  pickSort(o.value, on ? dir : o.dir);
                  setSortOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [styles.sortRow, pressed && { backgroundColor: color.surface2 }]}
              >
                <Ionicons name={o.icon} size={20} color={on ? color.ink : color.textSecondary} />
                <Text variant="bodyStrong" color={on ? color.ink : color.textSecondary} style={{ flex: 1 }}>
                  {o.label}
                </Text>
                {on && <Ionicons name="checkmark" size={20} color={color.ink} />}
              </Pressable>
            );
          })}
        </View>
        <Segmented
          options={[
            { value: sortOption.dir, label: sortOption.dirLabels[0] },
            { value: sortOption.dir === "desc" ? "asc" : "desc", label: sortOption.dirLabels[1] },
          ]}
          value={dir}
          onChange={(d) => pickSort(sort, d)}
        />
      </Sheet>
    </View>
  );
}

function HeaderButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Touchable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      pressedScale={0.9}
      style={styles.headerButton}
    >
      <Ionicons name={icon} size={18} color="#FFFFFF" />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  // The whole screen is a matte black binder page.
  root: { flex: 1, backgroundColor: binderPage.page },
  header: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingTop: space.xs },
  title: { fontFamily: font.heavy, fontSize: 24, lineHeight: 30, letterSpacing: -0.6, color: binderPage.text },
  actions: { flexDirection: "row", gap: space.sm },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  searchWrap: { marginHorizontal: MARGIN, marginTop: space.md },
  filters: { alignItems: "center", gap: 4, paddingHorizontal: space.lg, paddingTop: 14, paddingBottom: 10 },
  sortChip: { flexDirection: "row", alignItems: "center", gap: 4, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.1)" },
  sortText: { fontFamily: font.semibold, fontSize: 13, color: "#FFFFFF" },
  divider: { width: StyleSheet.hairlineWidth, height: 16, backgroundColor: "rgba(255,255,255,0.2)", marginHorizontal: 8 },
  setTab: { height: 30, paddingHorizontal: 10, borderRadius: 15, justifyContent: "center" },
  setTabOn: { backgroundColor: "#FFFFFF" },
  setText: { fontFamily: font.semibold, fontSize: 13, color: "rgba(255,255,255,0.6)" },
  setTextOn: { color: binderPage.page },
  sortList: { marginHorizontal: -space.sm },
  sortRow: { flexDirection: "row", alignItems: "center", gap: space.md, height: 46, paddingHorizontal: space.sm, borderRadius: 12 },
  page: { backgroundColor: binderPage.page, alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GUTTER },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.22)" },
  dotOn: { width: 18, backgroundColor: "#FFFFFF" },
});
