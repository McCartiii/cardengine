import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import { CARD_ASPECT, cardRadius, color, space } from "@/design/tokens";
import { font } from "@/design/fonts";
import { formatUsd } from "@/design/format";
import { getCollectionCards, type OwnedCard } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { CardArt, FlipBook, IconButton, SearchField, Text, Tilt, Touchable, tap } from "@/ui";

const PER_PAGE = 9;
const FETCH_SIZE = 90;
// The binding edge down the left of the screen, where the holes are punched.
const BINDING = 26;
const HOLES = 5;
const GAP = 8;
// Punched holes show the desk under the page.
const HOLE = "#DCE0E8";

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

  const [areaHeight, setAreaHeight] = useState(0);
  // The page runs from the binding to the right edge of the screen; three rows of cards fit its height.
  const pageWidth = width - BINDING;
  const rowHeight = ((areaHeight || height * 0.55) - 12 - GAP * 2) / 3;
  const byHeight = rowHeight * CARD_ASPECT;
  const byWidth = (pageWidth - space.lg - GAP * 2) / 3;
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
      if (session) load(1);
      else setStatus("ready");
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
      <View style={styles.binding} pointerEvents="none">
        {Array.from({ length: HOLES }, (_, i) => (
          <View key={i} style={styles.hole} />
        ))}
      </View>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.title}>My Binder</Text>
            <Text variant="callout" color={color.textSecondary}>
              {session
                ? status === "ready"
                  ? `${formatUsd(totals.value)} · ${totals.cards} ${totals.cards === 1 ? "card" : "cards"}`
                  : "Opening your binder…"
                : "Sign in to start collecting"}
            </Text>
          </View>
          {session && (
            <IconButton
              icon={searchOpen ? "close" : "search"}
              label={searchOpen ? "Close search" : "Search binder"}
              onPress={() => {
                setSearchOpen((o) => !o);
                if (searchOpen) setQuery("");
              }}
            />
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
                <Text style={[styles.tabText, { color: on ? "#FFFFFF" : color.ink }]}>{id === "all" ? "All" : id.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.pageArea} onLayout={(e) => setAreaHeight(e.nativeEvent.layout.height)}>
          {areaHeight > 0 && (
            <FlipBook
              key={`${set}|${query}`}
              pageCount={pages.length}
              onIndexChange={(i) => {
                setPageIndex(i);
                if (hasMore && i >= pages.length - 2) load(fetchedPage + 1);
              }}
              renderPage={(index) => (
                <View style={[styles.page, { height: areaHeight }]}>
                  <View style={[styles.grid, { width: sleeveWidth * 3 + GAP * 2 }]}>
                    {pages[index].map((c, i) =>
                      c ? (
                        <Sleeve key={c.holdingId} card={c} width={sleeveWidth} order={i} onPress={() => openCard(c)} />
                      ) : (
                        <EmptySleeve key={`empty-${index}-${i}`} width={sleeveWidth} onPress={session ? scan : () => router.push("/(auth)/sign-in")} />
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
        {card.priceUsd != null && (
          <View style={styles.priceRow} pointerEvents="none">
            <View style={styles.priceChip}>
              <Text variant="number" color={color.ink} style={{ fontSize: 11 }}>
                {formatUsd(card.priceUsd, { compact: true })}
              </Text>
            </View>
          </View>
        )}
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
    </Touchable>
  );
}

const styles = StyleSheet.create({
  // The whole screen is the binder page.
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  binding: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: BINDING,
    alignItems: "center",
    justifyContent: "space-evenly",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "rgba(18,20,43,0.08)",
    zIndex: 2,
  },
  hole: { width: 10, height: 10, borderRadius: 5, backgroundColor: HOLE },
  pageArea: { flex: 1, marginLeft: BINDING },
  header: { flexDirection: "row", alignItems: "center", gap: space.md, paddingLeft: BINDING + 6, paddingRight: space.lg, paddingTop: space.sm },
  title: { fontFamily: font.heavy, fontSize: 28, lineHeight: 34, letterSpacing: -0.8, color: color.ink },
  searchWrap: { marginLeft: BINDING + 2, marginRight: space.lg, marginTop: space.md },
  tabs: { gap: 6, paddingLeft: BINDING + 2, paddingRight: space.lg, paddingTop: space.lg, paddingBottom: 12, alignItems: "center" },
  tab: { height: 34, paddingHorizontal: 16, borderRadius: 17, backgroundColor: "#F2F3F7", justifyContent: "center" },
  tabOn: { backgroundColor: color.ink, borderColor: color.ink },
  tabText: { fontFamily: font.bold, fontSize: 13 },
  page: { backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  card: {
    shadowColor: "#1B2240",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  qty: { position: "absolute", top: 6, left: 6, paddingHorizontal: 6, height: 18, borderRadius: 9, backgroundColor: "rgba(11,14,38,0.78)", justifyContent: "center" },
  priceRow: { position: "absolute", left: 0, right: 0, bottom: 6, alignItems: "center" },
  priceChip: {
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 10,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    shadowColor: "#1B2240",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  empty: { backgroundColor: "#F3F4F8", alignItems: "center", justifyContent: "center", gap: 2 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 6, marginLeft: BINDING },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(18,20,43,0.16)" },
  dotOn: { width: 18, backgroundColor: color.ink },
});
