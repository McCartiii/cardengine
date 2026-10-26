import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import { color, space } from "@/design/tokens";
import { font } from "@/design/fonts";
import { formatUsd } from "@/design/format";
import {
  MAIN_BINDER,
  createBinder,
  deleteBinder,
  exportCollectionCsv,
  getCollectionCards,
  listBinders,
  moveCards,
  removeCards,
  renameBinder,
  type Binder,
  type CollectionSort,
  type OwnedCard,
} from "@/lib/api";
import { exportFilename, shareTextFile } from "@/lib/shareFile";
import { useAuthStore } from "@/store/authStore";
import { useSettings } from "@/store/settingsStore";
import { BinderSheet } from "@/components/binder/BinderSheet";
import { HoldingSheet } from "@/components/binder/HoldingSheet";
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
  const [binders, setBinders] = useState<Binder[]>([{ id: MAIN_BINDER, name: "Collection", kind: "collection" }]);
  const [bindersOpen, setBindersOpen] = useState(false);
  const [holding, setHolding] = useState<OwnedCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const activeId = useSettings((s) => s.activeBinder);
  const setActiveId = useSettings((s) => s.setActiveBinder);
  const binder = binders.find((b) => b.id === activeId) ?? binders[0];

  // Three rows of pockets fill the page: as wide as the screen allows, unless the height runs out first.
  const [areaHeight, setAreaHeight] = useState(0);
  const byWidth = (width - MARGIN * 2 - GUTTER * 2) / 3;
  const byHeight = pocketWidthForHeight(((areaHeight || height * 0.55) - MARGIN - GUTTER * 2) / 3);
  const pocketWidth = Math.floor(Math.max(70, Math.min(byWidth, byHeight)));

  const load = useCallback(async (p: number) => {
    try {
      const res = await getCollectionCards({ binder: activeId, sort, dir, page: p, limit: FETCH_SIZE });
      setCards((prev) => (p > 1 ? [...prev, ...res.cards] : res.cards));
      setTotals({ cards: res.totalCopies ?? res.totalCards, value: res.totalValue });
      setHasMore(res.hasMore);
      setFetchedPage(p);
      setStatus("ready");
    } catch {
      // A failed refresh keeps showing what's already loaded.
      if (p === 1) setStatus((prev) => (prev === "ready" ? "ready" : "error"));
    }
  }, [sort, dir, activeId]);

  const loadBinders = useCallback(async () => {
    try {
      const { binders: list } = await listBinders();
      setBinders(list);
      // Keep the open binder's name current; it may have been renamed or deleted (maybe on another phone).
      const open = list.find((b) => b.id === useSettings.getState().activeBinder);
      setActiveId(open?.id ?? MAIN_BINDER, open?.name);
    } catch {
      // keep what we have
    }
  }, [setActiveId]);

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      if (session) {
        load(1);
        loadBinders();
      } else setStatus("ready");
      return () => setStatusBarStyle("dark");
    }, [session, load, loadBinders])
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const refresh = () => {
    load(1);
    loadBinders();
  };

  const switchTo = (b: Binder) => {
    setBindersOpen(false);
    if (b.id === activeId) return;
    setActiveId(b.id, b.name);
    setStatus("loading");
    setCards([]);
    setSet("all");
    setPageIndex(0);
  };

  // Tabs for the sets you own the most of.
  const setTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cards) if (c.setId) counts.set(c.setId, (counts.get(c.setId) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => id);
  }, [cards]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => cards.filter((c) => (set === "all" || c.setId === set) && (!q || c.name.toLowerCase().includes(q))),
    [cards, set, q]
  );

  const pages = useMemo(() => {
    const slots: Slot[] = [...visible];
    // Once everything is loaded, end on empty sleeves so there's somewhere to scan into.
    if (!hasMore) {
      const pad = PER_PAGE - (slots.length % PER_PAGE);
      for (let i = 0; i < pad; i++) slots.push(null);
    }
    const out: Slot[][] = [];
    for (let i = 0; i < slots.length; i += PER_PAGE) out.push(slots.slice(i, i + PER_PAGE));
    return out.length ? out : [Array<Slot>(PER_PAGE).fill(null)];
  }, [visible, hasMore]);

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
  const wishlist = binder.kind === "wishlist";
  // Wishlist pockets fill from search; the others from the scanner.
  const fillPocket = () => (wishlist ? router.navigate("/(tabs)/search") : router.navigate("/(tabs)/scan"));
  const finishOf = (c: OwnedCard) => (c.finish ?? "nonfoil") as "nonfoil" | "foil" | "etched";

  const exportBinder = async () => {
    const csv = await exportCollectionCsv(binder.id);
    await shareTextFile(exportFilename(binder.name), csv);
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Pressable
              onPress={() => {
                if (!session) return;
                tap();
                setBindersOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${binder.name}. Switch binder`}
              hitSlop={6}
              style={styles.titleRow}
            >
              <Text style={styles.title} numberOfLines={1}>
                {session ? binder.name : "Binder"}
              </Text>
              {session && (
                <View style={styles.titleChevron}>
                  <Ionicons name="chevron-down" size={14} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
            <Text variant="caption" color={binderPage.muted} numberOfLines={1}>
              {session
                ? status === "ready"
                  ? `${formatUsd(totals.value)}${wishlist ? " to buy" : ""} · ${totals.cards} ${totals.cards === 1 ? "card" : "cards"}`
                  : status === "error"
                    ? "Couldn't open your binder"
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
            {q.length > 0 && visible.length === 0 && !hasMore && (
              <Text variant="callout" color={binderPage.muted} style={{ marginTop: space.sm, marginLeft: space.xs }}>
                Nothing in {binder.name} matches “{query.trim().length > 28 ? `${query.trim().slice(0, 28)}…` : query.trim()}”
              </Text>
            )}
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
          {status === "error" && (
            <View style={styles.errorBox}>
              <Ionicons name="cloud-offline-outline" size={30} color={binderPage.muted} />
              <Text variant="headline" color="#FFFFFF" align="center">
                Can't reach your binder
              </Text>
              <Text variant="callout" color={binderPage.muted} align="center">
                Check your connection and try again.
              </Text>
              <Pressable onPress={() => { setStatus("loading"); refresh(); }} style={styles.retry} accessibilityRole="button">
                <Text variant="bodyStrong" color={binderPage.page}>
                  Try again
                </Text>
              </Pressable>
            </View>
          )}
          {areaHeight > 0 && status !== "error" && (
            <FlipBook
              key={`${activeId}|${set}|${query}|${sort}|${dir}`}
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
                          onLongPress={() => {
                            tap();
                            setHolding(c);
                          }}
                        />
                      ) : (
                        <EmptyPocket key={`empty-${index}-${i}`} width={pocketWidth} label={wishlist ? "Add" : "Scan"} onPress={session ? fillPocket : () => router.push("/(auth)/sign-in")} />
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

      {toast && (
        <Animated.View entering={FadeIn.duration(180)} style={[styles.toast, { bottom: tabBarSpace + space.sm }]} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={18} color={color.positive} />
          <Text variant="callout">{toast}</Text>
        </Animated.View>
      )}

      <BinderSheet
        visible={bindersOpen}
        binders={binders}
        activeId={binder.id}
        onPick={switchTo}
        onCreate={async (name, kind) => {
          const { binder: b } = await createBinder(name, kind);
          await loadBinders();
          switchTo({ ...b, copies: 0 });
          setToast(`Made ${b.name}`);
        }}
        onRename={async (b, name) => {
          await renameBinder(b.id, name);
          await loadBinders();
        }}
        onDelete={async (b, cards) => {
          await deleteBinder(b.id, cards);
          if (b.id === activeId) switchTo(binders[0]);
          await loadBinders();
          if (b.id !== activeId) load(1);
          setToast(`Deleted ${b.name}`);
        }}
        onImport={() => {
          setBindersOpen(false);
          router.push({ pathname: "/import", params: { binderId: binder.id } });
        }}
        onExport={exportBinder}
        onClose={() => setBindersOpen(false)}
      />

      <HoldingSheet
        card={holding}
        binders={binders}
        onClose={() => setHolding(null)}
        onOpen={() => {
          const c = holding;
          setHolding(null);
          if (c) openCard(c);
        }}
        onMove={async (to, quantity) => {
          if (!holding) return;
          try {
            await moveCards({ variantId: holding.variantId, finish: finishOf(holding), from: holding.binderId, to: to.id, quantity });
            setHolding(null);
            setToast(`Moved ${quantity > 1 ? `${quantity} × ` : ""}${holding.name} to ${to.name}`);
            refresh();
          } catch (e) {
            Alert.alert("Couldn't move it", (e as Error).message);
          }
        }}
        onRemove={async (quantity) => {
          if (!holding) return;
          try {
            await removeCards({ variantId: holding.variantId, finish: finishOf(holding), binderId: holding.binderId, quantity });
            setHolding(null);
            setToast(`Removed ${quantity > 1 ? `${quantity} × ` : ""}${holding.name}`);
            refresh();
          } catch (e) {
            Alert.alert("Couldn't remove it", (e as Error).message);
          }
        }}
      />

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
  title: { fontFamily: font.heavy, fontSize: 24, lineHeight: 30, letterSpacing: -0.6, color: binderPage.text, flexShrink: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", maxWidth: "100%" },
  titleChevron: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
  errorBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.sm, paddingHorizontal: space.xxl },
  retry: { marginTop: space.sm, height: 42, paddingHorizontal: 20, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  toast: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
  },
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
