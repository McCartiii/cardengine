import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import { binder, CARD_ASPECT, cardRadius, color, space, TAB_BAR_CLEARANCE } from "@/design/tokens";
import { font } from "@/design/fonts";
import { formatUsd } from "@/design/format";
import { getCollectionCards, type OwnedCard } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { CardArt, FlipBook, PageStack, PunchHoles, Text, Tilt, Touchable, tap } from "@/ui";

const PER_PAGE = 9;
const FETCH_SIZE = 90;
// The binding edge of each page, where the holes are punched.
const RING_COLUMN = 26;
// Price line under each card.
const PRICE_LINE = 21;
const COVER = "#1D2350";
const GAP = 10;

type Slot = OwnedCard | null;

export default function BinderScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
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

  const [areaHeight, setAreaHeight] = useState(0);
  const pageWidth = width - space.lg * 2;
  // Fit three rows of sleeves in the measured space; page padding and footer take ~62.
  const rowHeight = ((areaHeight || height * 0.55) - 62 - GAP * 2) / 3;
  const byHeight = (rowHeight - PRICE_LINE) * CARD_ASPECT;
  const byWidth = (pageWidth - RING_COLUMN - 14 - GAP * 2) / 3;
  const sleeveWidth = Math.floor(Math.max(64, Math.min(byWidth, byHeight)));

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
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.title}>My Binder</Text>
            <Text variant="bodyStrong" color={binder.coverMuted} style={{ fontSize: 14 }}>
              {session
                ? status === "ready"
                  ? `${formatUsd(totals.value)} · ${totals.cards} ${totals.cards === 1 ? "card" : "cards"}`
                  : "Opening your binder…"
                : "Sign in to start sleeving cards"}
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
              style={styles.coverButton}
            >
              <Ionicons name={searchOpen ? "close" : "search"} size={20} color="#FFFFFF" />
            </Touchable>
          )}
        </View>

        {searchOpen && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={binder.coverMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Find a card in your binder"
              placeholderTextColor={binder.coverMuted}
              style={styles.searchInput}
              autoFocus
              autoCorrect={false}
              selectionColor="#FFD58A"
            />
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
                <Text style={[styles.tabText, { color: on ? binder.coverDeep : "#C6CDF0" }]}>{id === "all" ? "All" : id.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ flex: 1 }} onLayout={(e) => setAreaHeight(e.nativeEvent.layout.height)}>
        <View style={{ paddingHorizontal: space.lg }}>
          <PageStack radius={22}>
          <FlipBook
            key={`${set}|${query}`}
            pageCount={pages.length}
            pageStyle={styles.pageRadius}
            onIndexChange={(i) => {
              setPageIndex(i);
              if (hasMore && i >= pages.length - 2) load(fetchedPage + 1);
            }}
            renderPage={(index) => (
              <View style={styles.page}>
                <PunchHoles color={COVER} />
                <View style={styles.rings} pointerEvents="none" />
                <View style={{ flex: 1, paddingTop: 16, paddingRight: 14, paddingBottom: 12, paddingLeft: 4 }}>
                  <View style={[styles.grid, { width: sleeveWidth * 3 + GAP * 2 }]}>
                    {pages[index].map((c, i) =>
                      c ? (
                        <Sleeve key={c.holdingId} card={c} width={sleeveWidth} order={i} onPress={() => openCard(c)} />
                      ) : (
                        <EmptySleeve key={`empty-${index}-${i}`} width={sleeveWidth} onPress={session ? scan : () => router.push("/(auth)/sign-in")} />
                      )
                    )}
                  </View>
                  <View style={styles.pageFooter}>
                    <Text variant="caption" color={color.textTertiary}>
                      {status === "loading" ? "Loading…" : set === "all" ? "Most valuable first" : set.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          />
          </PageStack>
        </View>
        </View>

        <View style={styles.dots} accessibilityElementsHidden>
          {pages.slice(0, 8).map((_, i) => (
            <View key={i} style={[styles.dot, i === pageIndex && styles.dotOn]} />
          ))}
        </View>
        <View style={{ height: TAB_BAR_CLEARANCE - 8 }} />
      </SafeAreaView>
    </View>
  );
}

function Sleeve({ card, width, order, onPress }: { card: OwnedCard; width: number; order: number; onPress: () => void }) {
  return (
    <Animated.View entering={FadeIn.delay(order * 40).duration(300)}>
      <Tilt onPress={onPress} accessibilityRole="button" accessibilityLabel={`${card.name}, ${formatUsd(card.priceUsd)}`} style={{ width }}>
        <View style={styles.card}>
          <CardArt uri={card.imageUri} name={card.name} foil={card.finish !== "nonfoil"} />
          {card.quantity > 1 && (
            <View style={styles.qty}>
              <Text variant="number" color="#FFFFFF" style={{ fontSize: 10 }}>
                ×{card.quantity}
              </Text>
            </View>
          )}
        </View>
        <Text variant="number" color={color.ink} align="center" style={styles.price} numberOfLines={1}>
          {formatUsd(card.priceUsd, { compact: true })}
        </Text>
      </Tilt>
    </Animated.View>
  );
}

function EmptySleeve({ width, onPress }: { width: number; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel="Scan a card into this sleeve" pressedScale={0.95} style={{ width }}>
      <View style={[styles.empty, { height: width / CARD_ASPECT, borderRadius: cardRadius(width) + 2 }]}>
        <Ionicons name="add" size={20} color={color.textTertiary} />
        <Text variant="caption" color={color.textTertiary} style={{ fontFamily: font.semibold }}>
          Scan
        </Text>
      </View>
      <View style={{ height: PRICE_LINE }} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COVER },
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 24, paddingTop: space.md },
  title: { fontFamily: font.heavy, fontSize: 30, lineHeight: 36, letterSpacing: -1, color: "#FFFFFF" },
  coverButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.md,
    height: 46,
    paddingHorizontal: space.lg,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontFamily: font.medium, fontSize: 15, height: "100%" },
  tabs: { gap: 6, paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: 14, alignItems: "center" },
  tab: { height: 34, paddingHorizontal: 16, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.08)", justifyContent: "center" },
  tabOn: { backgroundColor: "#FFFFFF" },
  tabText: { fontFamily: font.heavy, fontSize: 13 },
  page: { flexDirection: "row", borderRadius: 22, backgroundColor: "#FFFFFF" },
  pageRadius: { borderRadius: 22 },
  rings: { width: RING_COLUMN },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, alignSelf: "center" },
  card: {
    shadowColor: "#0B0E26",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  qty: { position: "absolute", top: 6, left: 6, paddingHorizontal: 6, height: 18, borderRadius: 9, backgroundColor: "rgba(11,14,38,0.8)", justifyContent: "center" },
  price: { height: 16, marginTop: 5, fontSize: 12, lineHeight: 16 },
  empty: { backgroundColor: "#F1F2F6", alignItems: "center", justifyContent: "center", gap: 2 },
  pageFooter: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 4 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: space.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.25)" },
  dotOn: { width: 18, backgroundColor: "#FFFFFF" },
});
