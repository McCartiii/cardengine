import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import { space } from "@/design/tokens";
import { font } from "@/design/fonts";
import { formatUsd } from "@/design/format";
import { getCollectionCards, type OwnedCard } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { binderPage, EmptyPocket, FlipBook, Pocket, pocketWidthForHeight, SearchField, Text, Touchable, tap } from "@/ui";

const PER_PAGE = 9;
const FETCH_SIZE = 90;
// Margin around the pockets and the gutter between them.
const MARGIN = 12;
const GUTTER = 6;

type Slot = OwnedCard | null;

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

  // Three rows of pockets fill the page: as wide as the screen allows, unless the height runs out first.
  const [areaHeight, setAreaHeight] = useState(0);
  const byWidth = (width - MARGIN * 2 - GUTTER * 2) / 3;
  const byHeight = pocketWidthForHeight(((areaHeight || height * 0.55) - MARGIN - GUTTER * 2) / 3);
  const pocketWidth = Math.floor(Math.max(70, Math.min(byWidth, byHeight)));

  const load = useCallback(async (p: number) => {
    try {
      const res = await getCollectionCards({ sort: "value", page: p, limit: FETCH_SIZE });
      setCards((prev) => (p > 1 ? [...prev, ...res.cards] : res.cards));
      setTotals({ cards: res.totalCards, value: res.totalValue });
      setHasMore(res.hasMore);
      setFetchedPage(p);
      setStatus("ready");
    } catch {
      if (p === 1) setStatus("error");
    }
  }, []);

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

  const openCard = (c: OwnedCard) => router.push({ pathname: "/card/[id]", params: { id: c.variantId } });
  const scan = () => router.navigate("/(tabs)/scan");

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#191A20", binderPage.page]} style={styles.sheen} pointerEvents="none" />
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.title}>My Binder</Text>
            <Text variant="callout" color={binderPage.muted}>
              {session
                ? status === "ready"
                  ? `${formatUsd(totals.value)} · ${totals.cards} ${totals.cards === 1 ? "card" : "cards"}`
                  : "Opening your binder…"
                : "Sign in to start collecting"}
            </Text>
          </View>
          {session && (
            <Touchable
              onPress={() => {
                tap();
                setSearchOpen((o) => !o);
                if (searchOpen) setQuery("");
              }}
              accessibilityRole="button"
              accessibilityLabel={searchOpen ? "Close search" : "Search binder"}
              pressedScale={0.92}
              style={styles.iconButton}
            >
              <Ionicons name={searchOpen ? "close" : "search"} size={20} color="#FFFFFF" />
            </Touchable>
          )}
        </View>

        {searchOpen && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.searchWrap}>
            <SearchField value={query} onChangeText={setQuery} placeholder="Find a card in your binder" autoFocus />
          </Animated.View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
          {["all", ...setTabs].map((id) => {
            const on = set === id;
            return (
              <Pressable
                key={id}
                onPress={() => pickSet(id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[styles.tab, on && styles.tabOn]}
              >
                <Text style={[styles.tabText, { color: on ? binderPage.page : "rgba(255,255,255,0.82)" }]}>{id === "all" ? "All" : id.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ flex: 1 }} onLayout={(e) => setAreaHeight(e.nativeEvent.layout.height)}>
          {areaHeight > 0 && (
            <FlipBook
              key={`${set}|${query}`}
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
    </View>
  );
}

const styles = StyleSheet.create({
  // The whole screen is a matte black binder page.
  root: { flex: 1, backgroundColor: binderPage.page },
  sheen: { position: "absolute", top: 0, left: 0, right: 0, height: 140 },
  header: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg + 2, paddingTop: space.sm },
  title: { fontFamily: font.heavy, fontSize: 28, lineHeight: 34, letterSpacing: -0.8, color: binderPage.text },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  searchWrap: { marginHorizontal: MARGIN, marginTop: space.md },
  tabs: { gap: 6, paddingHorizontal: MARGIN, paddingTop: space.lg, paddingBottom: MARGIN, alignItems: "center" },
  tab: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 17,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  tabOn: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  tabText: { fontFamily: font.bold, fontSize: 13 },
  page: { backgroundColor: binderPage.page, alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GUTTER },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.22)" },
  dotOn: { width: 18, backgroundColor: "#FFFFFF" },
});
