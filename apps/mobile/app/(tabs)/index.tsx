import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { bubble, CARD_ASPECT, color, elevation, radius, space, TAB_BAR_CLEARANCE, type BubbleColor } from "@/design/tokens";
import { font } from "@/design/fonts";
import { formatUsd, setLabel } from "@/design/format";
import { getCollectionCards, getCollectionValue, getMarketHome, type MarketCard, type OwnedCard } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import {
  Button,
  CardArt,
  CardTile,
  Chip,
  CountUp,
  FoilSweep,
  HoloRing,
  IconButton,
  Screen,
  SkeletonBlock,
  Text,
  Touchable,
  tap,
} from "@/ui";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type MarketTab = "popular" | "movers" | "newCards";

const RAIL_TILE_WIDTH = 116;
const MARKET_TABS: ReadonlyArray<{ key: MarketTab; label: string }> = [
  { key: "popular", label: "Trending" },
  { key: "movers", label: "Movers" },
  { key: "newCards", label: "New" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function HomeScreen() {
  const router = useRouter();
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
  const cards = market?.[tab] ?? [];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
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
          <View style={{ gap: 2, flex: 1 }}>
            <Text variant="bodyStrong" color={color.textSecondary} style={{ fontSize: 14 }}>
              {greeting()}
            </Text>
            <Text style={styles.name} numberOfLines={1}>
              {name ?? "Collector"}
            </Text>
          </View>
          <IconButton icon="notifications-outline" label="Price alerts" size={46} onPress={() => router.push("/alerts")} />
          <Touchable onPress={() => router.push("/profile")} accessibilityRole="button" accessibilityLabel="Profile" pressedScale={0.92}>
            <HoloRing radius={24} thickness={3}>
              <View style={styles.avatar}>
                {session ? (
                  <Text style={styles.avatarText}>{(name ?? "?").slice(0, 1).toUpperCase()}</Text>
                ) : (
                  <Ionicons name="person" size={18} color="#FFFFFF" />
                )}
              </View>
            </HoloRing>
          </Touchable>
        </View>

        <Animated.View entering={FadeInDown.duration(450)} style={styles.section}>
          {loading ? (
            <SkeletonBlock height={176} style={{ borderRadius: 30 }} />
          ) : (
            <HoloRing radius={30} thickness={2} style={elevation.floating}>
              {session ? (
                <Touchable onPress={() => router.navigate("/(tabs)/collection")} pressedScale={0.985} accessibilityRole="button" style={styles.valueCard}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodyStrong" color={color.textSecondary} style={{ fontSize: 13 }}>
                      Collection value
                    </Text>
                    <CountUp
                      value={value?.total ?? 0}
                      format={(n) => formatUsd(n)}
                      style={styles.value}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    />
                    <View style={styles.valueMeta}>
                      <View style={styles.countPill}>
                        <Ionicons name="book" size={12} color={color.accent} />
                        <Text variant="number" color={color.accent}>
                          {value?.count ?? 0} cards
                        </Text>
                      </View>
                      <View style={styles.openButton}>
                        <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                      </View>
                    </View>
                  </View>
                  {topCards.length > 0 && <Fan cards={topCards} />}
                </Touchable>
              ) : (
                <View style={[styles.valueCard, { flexDirection: "column", alignItems: "flex-start", gap: space.sm }]}>
                  <Text style={styles.ctaTitle}>Know what your cards are worth</Text>
                  <Text variant="body" color={color.textSecondary}>
                    Sign in to sleeve your cards in a binder and track their prices every day.
                  </Text>
                  <Button label="Sign in" onPress={() => router.push("/(auth)/sign-in")} style={{ marginTop: space.sm }} />
                </View>
              )}
            </HoloRing>
          )}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(90).duration(450)} style={styles.shortcuts}>
          <Shortcut icon="heart" tint="pink" label="Life" onPress={() => router.push("/life")} />
          <Shortcut icon="layers" tint="violet" label="Decks" onPress={() => router.navigate("/(tabs)/decks")} />
          <Shortcut icon="trending-up" tint="blue" label="Alerts" onPress={() => router.push("/alerts")} />
          <Shortcut icon="location" tint="green" label="Shops" onPress={() => router.push("/shops")} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(450)} style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Market</Text>
            <Touchable onPress={() => router.navigate("/(tabs)/search")} accessibilityRole="link">
              <Text variant="bodyStrong" color={color.accent}>
                Search
              </Text>
            </Touchable>
          </View>
          <View style={styles.tabs} accessibilityRole="tablist">
            {MARKET_TABS.map((t) => (
              <Chip key={t.key} label={t.label} active={tab === t.key} onPress={() => setTab(t.key)} />
            ))}
          </View>
          {loading ? (
            <View style={styles.railSkeleton}>
              {[0, 1, 2].map((i) => (
                <SkeletonBlock key={i} height={RAIL_TILE_WIDTH / CARD_ASPECT} style={{ width: RAIL_TILE_WIDTH, borderRadius: 6 }} />
              ))}
            </View>
          ) : cards.length === 0 ? (
            <Text variant="body" color={color.textSecondary} align="center" style={styles.railEmpty}>
              {tab === "movers"
                ? "Movers appear once there are two days of price history."
                : "Nothing here yet. Check back after the next price update."}
            </Text>
          ) : (
            <FlatList
              horizontal
              data={cards}
              keyExtractor={(c) => c.variantId}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rail}
              renderItem={({ item }) => (
                <CardTile
                  style={{ width: RAIL_TILE_WIDTH }}
                  sheen
                  name={item.name}
                  imageUri={item.imageUri}
                  price={item.bestUsd ?? item.priceUsd}
                  subtitle={setLabel(item.setId, item.collectorNumber)}
                  deltaPct={item.deltaPct}
                  onPress={() => openCard(item.variantId)}
                />
              )}
            />
          )}
          <View style={{ height: TAB_BAR_CLEARANCE }} />
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

/** Top three cards fanned like a hand; the front card catches the light. */
function Fan({ cards }: { cards: OwnedCard[] }) {
  const layout = [
    { rotate: "-13deg", x: -26, y: 10, w: 66 },
    { rotate: "11deg", x: 26, y: 8, w: 66 },
    { rotate: "0deg", x: 0, y: 0, w: 74 },
  ];
  const ordered = [cards[1], cards[2], cards[0]];
  return (
    <View style={styles.fan} pointerEvents="none">
      {ordered.map((c, i) =>
        c ? (
          <View
            key={c.holdingId}
            style={[styles.fanCard, { width: layout[i].w, transform: [{ translateX: layout[i].x }, { translateY: layout[i].y }, { rotate: layout[i].rotate }] }]}
          >
            <CardArt uri={c.imageUri} name={c.name} foil={c.finish !== "nonfoil"} />
            {i === 2 && (
              <View style={[StyleSheet.absoluteFill, { overflow: "hidden", borderRadius: 4 }]}>
                <FoilSweep width={layout[i].w} />
              </View>
            )}
          </View>
        ) : null
      )}
    </View>
  );
}

function Shortcut({ icon, tint, label, onPress }: { icon: IconName; tint: BubbleColor; label: string; onPress: () => void }) {
  return (
    <Touchable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      pressedScale={0.92}
      style={styles.shortcut}
    >
      <LinearGradient colors={bubble[tint]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={[styles.squircle, { shadowColor: bubble[tint][1] }]}>
        <LinearGradient colors={["rgba(255,255,255,0.45)", "rgba(255,255,255,0)"]} style={styles.gloss} />
        <Ionicons name={icon} size={26} color="#FFFFFF" />
      </LinearGradient>
      <Text variant="callout" color={color.ink}>
        {label}
      </Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.xl, paddingTop: space.md },
  name: { fontFamily: font.heavy, fontSize: 28, lineHeight: 34, letterSpacing: -0.8, color: color.ink },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: color.ink, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: font.heavy, fontSize: 17, color: "#FFFFFF" },
  section: { paddingHorizontal: space.lg, marginTop: space.xl },
  valueCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: space.xl,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.93)",
    minHeight: 172,
  },
  value: { fontFamily: font.heavy, fontSize: 38, lineHeight: 46, letterSpacing: -1.4, color: color.ink, fontVariant: ["tabular-nums"], marginTop: 2 },
  valueMeta: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.md },
  openButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: color.ink, alignItems: "center", justifyContent: "center" },
  countPill: { flexDirection: "row", alignItems: "center", gap: 5, height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: color.accentSoft },
  ctaTitle: { fontFamily: font.heavy, fontSize: 24, lineHeight: 30, letterSpacing: -0.7, color: color.ink },
  fan: { width: 128, height: 124, alignItems: "center", justifyContent: "center" },
  fanCard: {
    position: "absolute",
    shadowColor: "#2A1E6E",
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  shortcuts: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 26, marginTop: space.xxl },
  shortcut: { alignItems: "center", gap: space.sm },
  squircle: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  gloss: { position: "absolute", top: 0, left: 0, right: 0, height: 30 },
  panel: {
    flexGrow: 1,
    marginTop: space.xxl,
    paddingTop: space.xxl,
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    ...elevation.card,
  },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.xl },
  panelTitle: { fontFamily: font.heavy, fontSize: 22, letterSpacing: -0.6, color: color.ink },
  tabs: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.xl, paddingTop: 14, paddingBottom: space.lg },
  rail: { paddingHorizontal: space.xl, gap: 14, paddingBottom: space.sm },
  railSkeleton: { flexDirection: "row", gap: 14, paddingHorizontal: space.xl },
  railEmpty: { paddingHorizontal: space.xxl, paddingVertical: space.xxl },
});
