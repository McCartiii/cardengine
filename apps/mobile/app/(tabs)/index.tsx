import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { color, elevation, hairline, radius, space, TAB_BAR_CLEARANCE, type BubbleColor } from "@/design/tokens";
import { font } from "@/design/fonts";
import { formatUsd } from "@/design/format";
import { getCollectionCards, getCollectionValue, getMarketHome, type MarketCard, type OwnedCard } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import {
  Button,
  CardArt,
  CountUp,
  HeroCarousel,
  HoloRing,
  IconBubble,
  ListingCard,
  PromoBanner,
  Screen,
  Segmented,
  SkeletonBlock,
  Text,
  Touchable,
  tap,
} from "@/ui";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type MarketTab = "popular" | "movers" | "newCards";

const MARKET_TABS: ReadonlyArray<{ value: MarketTab; label: string }> = [
  { value: "popular", label: "Trending" },
  { value: "movers", label: "Movers" },
  { value: "newCards", label: "New" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const columnWidth = (width - space.lg * 2 - space.md) / 2;
  const { session, user } = useAuthStore();
  const [market, setMarket] = useState<Record<MarketTab, MarketCard[]> | null>(null);
  const [value, setValue] = useState<{ total: number; count: number } | null>(null);
  const [topCards, setTopCards] = useState<OwnedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<MarketTab>("popular");

  const load = useCallback(async () => {
    const [m, v, top] = await Promise.allSettled([
      getMarketHome(),
      session ? getCollectionValue() : Promise.reject(),
      session ? getCollectionCards({ sort: "value", limit: 3 }) : Promise.reject(),
    ]);
    if (m.status === "fulfilled") setMarket(m.value);
    if (v.status === "fulfilled") setValue({ total: v.value.totalValue, count: v.value.cardCount });
    if (top.status === "fulfilled") setTopCards(top.value.cards.slice(0, 3));
    setLoading(false);
    setRefreshing(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openCard = (variantId: string) => router.push({ pathname: "/card/[id]", params: { id: variantId } });
  const name = user?.email?.split("@")[0];
  const listings = (market?.[tab] ?? []).slice(0, 6);

  // The most valuable cards moving through the market lead the page.
  const featured = useMemo(() => {
    const pool = [...(market?.popular ?? []), ...(market?.movers ?? [])];
    const seen = new Set<string>();
    return pool
      .filter((c) => (seen.has(c.variantId) ? false : (seen.add(c.variantId), true)))
      .sort((a, b) => (b.bestUsd ?? b.priceUsd ?? 0) - (a.bestUsd ?? a.priceUsd ?? 0))
      .slice(0, 5);
  }, [market]);

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={color.textSecondary}
          />
        }
      >
        <View style={styles.header}>
          <Touchable onPress={() => router.push("/profile")} accessibilityRole="button" accessibilityLabel="Profile" pressedScale={0.92}>
            <HoloRing radius={22} thickness={2.5}>
              <View style={styles.avatar}>
                {session ? (
                  <Text style={styles.avatarText}>{(name ?? "?").slice(0, 1).toUpperCase()}</Text>
                ) : (
                  <Ionicons name="person" size={17} color="#FFFFFF" />
                )}
              </View>
            </HoloRing>
          </Touchable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="caption" color={color.textSecondary}>
              {greeting()}
            </Text>
            <Text style={styles.name} numberOfLines={1}>
              {name ?? "Collector"}
            </Text>
          </View>
          <View style={styles.headerPill}>
            <HeaderIcon icon="search" label="Search" onPress={() => router.navigate("/(tabs)/search")} />
            <View style={styles.headerDivider} />
            <HeaderIcon icon="notifications-outline" label="Price alerts" onPress={() => router.push("/alerts")} />
          </View>
        </View>

        <Animated.View entering={FadeInDown.duration(400)}>
          {loading ? (
            <SkeletonBlock height={212} style={{ marginHorizontal: space.lg, borderRadius: 26 }} />
          ) : featured.length > 0 ? (
            <HeroCarousel cards={featured} onOpen={openCard} />
          ) : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(70).duration(400)} style={styles.section}>
          <View style={styles.searchRow}>
            <Touchable onPress={() => router.navigate("/(tabs)/search")} accessibilityRole="search" pressedScale={0.98} style={styles.searchPill}>
              <Ionicons name="search" size={18} color={color.text} />
              <Text variant="bodyStrong" color={color.textTertiary} style={{ fontFamily: font.medium }}>
                Search any card
              </Text>
            </Touchable>
            <Touchable
              onPress={() => {
                tap();
                router.navigate("/(tabs)/scan");
              }}
              accessibilityRole="button"
              accessibilityLabel="Scan a card"
              pressedScale={0.94}
              style={styles.scanPill}
            >
              <Ionicons name="scan" size={17} color="#FFFFFF" />
              <Text variant="callout" color="#FFFFFF">
                Scan
              </Text>
            </Touchable>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(140).duration(400)} style={styles.section}>
          {session ? (
            <Touchable onPress={() => router.navigate("/(tabs)/collection")} pressedScale={0.985} accessibilityRole="button" style={styles.binderRow}>
              <View style={styles.thumbs}>
                {topCards.map((c, i) => (
                  <View key={c.holdingId} style={[styles.thumb, { left: i * 16, zIndex: 3 - i, transform: [{ rotate: `${(i - 1) * 6}deg` }] }]}>
                    <CardArt uri={c.imageUri} name={c.name} />
                  </View>
                ))}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="caption" color={color.textSecondary}>
                  Binder value · {value?.count ?? 0} cards
                </Text>
                <CountUp value={value?.total ?? 0} format={(n) => formatUsd(n)} style={styles.binderValue} numberOfLines={1} />
              </View>
              <View style={styles.chevron}>
                <Ionicons name="chevron-forward" size={16} color={color.ink} />
              </View>
            </Touchable>
          ) : (
            <View style={[styles.binderRow, { alignItems: "center" }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="headline">Start your binder</Text>
                <Text variant="caption" color={color.textSecondary}>
                  Sign in to track what your cards are worth.
                </Text>
              </View>
              <Button label="Sign in" onPress={() => router.push("/(auth)/sign-in")} />
            </View>
          )}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(210).duration(400)} style={styles.section}>
          <PromoBanner
            title="Game night?"
            body="Life, poison and commander damage for 2–6 players."
            action="Open life counter"
            colors={["#25125E", "#5B32E6", "#FF5FA2"]}
            art={featured.slice(2, 5).map((c) => ({ uri: c.imageUri, name: c.name }))}
            onPress={() => router.push("/life")}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(280).duration(400)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Market</Text>
            <Touchable onPress={() => router.navigate("/(tabs)/search")} accessibilityRole="link" style={styles.seeAll}>
              <Text variant="callout" color={color.ink}>
                See all
              </Text>
              <Ionicons name="chevron-forward" size={14} color={color.ink} />
            </Touchable>
          </View>
          <Segmented options={MARKET_TABS} value={tab} onChange={setTab} />
          {loading ? (
            <View style={styles.grid}>
              {[0, 1].map((i) => (
                <SkeletonBlock key={i} height={250} style={{ flex: 1, borderRadius: 20 }} />
              ))}
            </View>
          ) : listings.length === 0 ? (
            <Text variant="body" color={color.textSecondary} align="center" style={styles.empty}>
              {tab === "movers" ? "Movers appear once there are two days of price history." : "Nothing here yet. Check back after the next price update."}
            </Text>
          ) : (
            <View style={styles.grid}>
              {listings.map((c) => (
                <ListingCard key={c.variantId} card={c} onPress={() => openCard(c.variantId)} style={{ width: columnWidth }} />
              ))}
            </View>
          )}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(350).duration(400)} style={[styles.section, styles.tiles]}>
          <Tile icon="location" tint="green" title="Local shops" body="Events near you" onPress={() => router.push("/shops")} />
          <Tile icon="layers" tint="violet" title="Decks" body="Build and price" onPress={() => router.navigate("/(tabs)/decks")} />
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

function HeaderIcon({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Touchable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      pressedScale={0.9}
      style={styles.headerIcon}
    >
      <Ionicons name={icon} size={20} color={color.ink} />
    </Touchable>
  );
}

function Tile({ icon, tint, title, body, onPress }: { icon: IconName; tint: BubbleColor; title: string; body: string; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} pressedScale={0.97} style={styles.tile}>
      <IconBubble icon={icon} tint={tint} size={40} />
      <View style={{ gap: 2, flex: 1, minWidth: 0 }}>
        <Text variant="headline" style={{ fontSize: 15 }}>
          {title}
        </Text>
        <Text variant="caption" color={color.textSecondary} numberOfLines={2}>
          {body}
        </Text>
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.ink, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: font.heavy, fontSize: 16, color: "#FFFFFF" },
  name: { fontFamily: font.heavy, fontSize: 20, lineHeight: 25, letterSpacing: -0.5, color: color.ink },
  headerPill: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    paddingHorizontal: 4,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.85)",
    ...hairline,
    ...elevation.card,
  },
  headerIcon: { width: 40, height: 36, alignItems: "center", justifyContent: "center" },
  headerDivider: { width: 1, height: 18, backgroundColor: color.border },
  section: { paddingHorizontal: space.lg, marginTop: space.xl },
  searchRow: { flexDirection: "row", gap: space.sm },
  searchPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    ...hairline,
    ...elevation.card,
  },
  scanPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 48,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
    ...elevation.card,
  },
  binderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: 14,
    borderRadius: 20,
    backgroundColor: color.surface,
    ...hairline,
    ...elevation.card,
  },
  thumbs: { width: 72, height: 56 },
  thumb: {
    position: "absolute",
    top: 0,
    width: 40,
    shadowColor: "#0B0D1F",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  binderValue: { fontFamily: font.heavy, fontSize: 24, lineHeight: 30, letterSpacing: -0.8, color: color.ink, fontVariant: ["tabular-nums"] },
  chevron: { width: 32, height: 32, borderRadius: 16, backgroundColor: color.surface2, alignItems: "center", justifyContent: "center" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.md },
  sectionTitle: { fontFamily: font.heavy, fontSize: 22, letterSpacing: -0.6, color: color.ink },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: color.surface, ...hairline },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md, marginTop: space.md },
  empty: { paddingHorizontal: space.xl, paddingVertical: space.xxl },
  tiles: { flexDirection: "row", gap: space.md },
  tile: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md, padding: 14, borderRadius: 20, backgroundColor: color.surface, ...hairline, ...elevation.card },
});
