import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions, type ViewToken } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { CARD_ASPECT, color, elevation, glass, radius, space, TAB_BAR_CLEARANCE, type BubbleColor } from "@/design/tokens";
import { font } from "@/design/fonts";
import { formatUsd, setLabel } from "@/design/format";
import { getCollectionCards, getCollectionValue, getMarketHome, type MarketCard, type OwnedCard } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import {
  Button,
  CardArt,
  CardTile,
  Glass,
  GlassFill,
  IconBubble,
  Panel,
  SectionHeader,
  Segmented,
  SkeletonBlock,
  SkyBackground,
  Text,
  Touchable,
  tap,
} from "@/ui";
import { SafeAreaView } from "react-native-safe-area-context";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type MarketTab = "popular" | "movers" | "newCards";

const RAIL_TILE_WIDTH = 118;

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { session, user } = useAuthStore();
  const [market, setMarket] = useState<{ movers: MarketCard[]; newCards: MarketCard[]; popular: MarketCard[] } | null>(null);
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
  const featured = useMemo(() => (market?.popular.length ? market.popular : market?.movers ?? []).slice(0, 5), [market]);
  const movingCount = market?.movers.length ?? 0;
  const name = user?.email?.split("@")[0];

  return (
    <View style={styles.root}>
      <SkyBackground />
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
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
          {/* Top bar: live market pill + actions */}
          <View style={styles.topBar}>
            <Touchable
              style={{ flex: 1 }}
              onPress={() => setTab("movers")}
              accessibilityRole="button"
              accessibilityLabel="See today's movers"
            >
              <Glass style={styles.statusPill}>
                <IconBubble icon={movingCount ? "trending-up" : "sparkles"} tint={movingCount ? "green" : "violet"} size={34} />
                <Text variant="callout" style={{ flex: 1, fontSize: 14, lineHeight: 18 }} numberOfLines={2}>
                  {movingCount
                    ? `${movingCount} cards moving today. Tap to see movers`
                    : `Welcome back${name ? `, ${name}` : ""}. Prices update daily`}
                </Text>
              </Glass>
            </Touchable>
            <Glass style={styles.actionPill}>
              <Touchable onPress={() => router.push("/alerts")} accessibilityRole="button" accessibilityLabel="Price alerts" style={styles.actionIcon}>
                <Ionicons name="notifications-outline" size={23} color={color.text} />
              </Touchable>
              <View style={styles.actionDivider} />
              <Touchable onPress={() => router.push("/profile")} accessibilityRole="button" accessibilityLabel="Profile" style={styles.actionIcon}>
                <Ionicons name="person-circle-outline" size={25} color={color.text} />
              </Touchable>
            </Glass>
          </View>

          {/* Featured carousel */}
          <Animated.View entering={FadeInDown.duration(400)}>
            {loading ? (
              <SkeletonBlock height={190} style={{ marginHorizontal: space.lg, borderRadius: radius.xl }} />
            ) : featured.length > 0 ? (
              <FeaturedCarousel cards={featured} width={width} onOpen={openCard} />
            ) : null}
          </Animated.View>

          {/* White content panel */}
          <Panel style={styles.panel}>
            {session ? (
              <CollectionCard
                loading={loading}
                value={value}
                topCards={topCards}
                onPress={() => router.navigate("/(tabs)/collection")}
              />
            ) : (
              <SignInBanner onPress={() => router.push("/(auth)/sign-in")} />
            )}

            <View style={styles.shortcuts}>
              <Shortcut icon="heart" tint="pink" label="Life" onPress={() => router.push("/life")} />
              <Shortcut icon="layers" tint="violet" label="Decks" onPress={() => router.navigate("/(tabs)/decks")} />
              <Shortcut icon="notifications" tint="orange" label="Alerts" onPress={() => router.push("/alerts")} />
              <Shortcut icon="storefront" tint="green" label="Shops" onPress={() => router.push("/shops")} />
            </View>

            <View style={styles.marketCard}>
              <SectionHeader title="Market" action="Search" onAction={() => router.navigate("/(tabs)/search")} />
              <View style={{ paddingHorizontal: space.lg, marginBottom: space.lg }}>
                <Segmented
                  options={[
                    { value: "popular", label: "Trending", icon: "flame" },
                    { value: "movers", label: "Movers", icon: "trending-up" },
                    { value: "newCards", label: "New", icon: "sparkles" },
                  ]}
                  value={tab}
                  onChange={setTab}
                />
              </View>
              <Rail
                cards={market?.[tab]}
                loading={loading}
                onOpen={openCard}
                showDelta={tab === "movers"}
                empty={
                  tab === "movers"
                    ? "Movers appear once there are two days of price history."
                    : "Nothing here yet. Check back after the next price update."
                }
              />
            </View>
            <View style={{ height: TAB_BAR_CLEARANCE }} />
          </Panel>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── Featured carousel ────────────────────────────────────────────────────────

function FeaturedCarousel({ cards, width, onOpen }: { cards: MarketCard[]; width: number; onOpen: (id: string) => void }) {
  const [index, setIndex] = useState(0);
  const pageWidth = width - space.lg * 2;
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
  }).current;

  return (
    <View>
      <FlatList
        horizontal
        data={cards}
        keyExtractor={(c) => c.variantId}
        showsHorizontalScrollIndicator={false}
        snapToInterval={pageWidth + space.md}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item, index: i }) => (
          <FeaturedSlide card={item} rank={i + 1} width={pageWidth} onPress={() => onOpen(item.variantId)} />
        )}
      />
      <View style={styles.dots}>
        {cards.map((c, i) => (
          <View key={c.variantId} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

function FeaturedSlide({ card, rank, width, onPress }: { card: MarketCard; rank: number; width: number; onPress: () => void }) {
  const price = card.bestUsd ?? card.priceUsd;
  const artWidth = 112;
  return (
    <Touchable onPress={onPress} pressedScale={0.98} accessibilityRole="button" accessibilityLabel={card.name} style={[styles.slide, { width }]}>
      {card.imageUri && (
        <Image source={{ uri: card.imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={30} />
      )}
      <LinearGradient
        colors={["rgba(14,17,26,0.94)", "rgba(14,17,26,0.82)", "rgba(14,17,26,0.55)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.slideText}>
        <View style={styles.slideRank}>
          <Text style={styles.rank}>#{rank}</Text>
          <View style={styles.rankDot} />
          <Text style={styles.slidePrice}>{formatUsd(price)}</Text>
        </View>
        <Text style={styles.slideName} numberOfLines={2}>
          {card.name}
        </Text>
        <View style={styles.slideMeta}>
          {card.deltaPct != null && Number.isFinite(card.deltaPct) && (
            <View style={[styles.deltaChip, { backgroundColor: card.deltaPct >= 0 ? color.positive : color.negative }]}>
              <Ionicons name={card.deltaPct >= 0 ? "arrow-up" : "arrow-down"} size={11} color="#FFFFFF" />
              <Text variant="number" color="#FFFFFF">
                {Math.abs(card.deltaPct).toFixed(1)}%
              </Text>
            </View>
          )}
          <Text variant="callout" color="rgba(255,255,255,0.6)">
            {setLabel(card.setId, card.collectorNumber)}
          </Text>
        </View>
      </View>
      <View style={styles.slideArt}>
        <View style={[styles.slideArtBack, { width: artWidth }]}>
          <CardArt uri={card.imageUri} name={card.name} />
        </View>
        <View style={[styles.slideArtFront, { width: artWidth }]}>
          <CardArt uri={card.imageUri} name={card.name} />
        </View>
      </View>
    </Touchable>
  );
}

// ── Collection & sign-in ─────────────────────────────────────────────────────

function CollectionCard({
  loading,
  value,
  topCards,
  onPress,
}: {
  loading: boolean;
  value: { total: number; count: number } | null;
  topCards: OwnedCard[];
  onPress: () => void;
}) {
  if (loading) return <SkeletonBlock height={150} style={{ marginHorizontal: space.lg }} />;
  const ordered = [topCards[1], topCards[2], topCards[0]];
  const fan = [
    { rotate: "-12deg", x: -26, y: 8 },
    { rotate: "11deg", x: 26, y: 6 },
    { rotate: "0deg", x: 0, y: 0 },
  ];
  return (
    <Touchable onPress={onPress} pressedScale={0.985} accessibilityRole="button" style={styles.collection}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" color={color.textSecondary}>
          Your collection
        </Text>
        <Text variant="priceLarge" style={{ marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>
          {formatUsd(value?.total ?? 0)}
        </Text>
        <View style={styles.collectionMeta}>
          <View style={styles.countPill}>
            <Ionicons name="albums" size={13} color={color.accent} />
            <Text variant="number" color={color.accent}>
              {value?.count ?? 0} cards
            </Text>
          </View>
          <Text variant="bodyStrong" color={color.accent}>
            Open
          </Text>
          <Ionicons name="chevron-forward" size={16} color={color.accent} style={{ marginLeft: -6 }} />
        </View>
      </View>
      {topCards.length > 0 && (
        <View style={styles.fan} pointerEvents="none">
          {ordered.map((c, i) =>
            c ? (
              <View
                key={c.holdingId}
                style={[styles.fanCard, { transform: [{ translateX: fan[i].x }, { translateY: fan[i].y }, { rotate: fan[i].rotate }] }]}
              >
                <CardArt uri={c.imageUri} name={c.name} foil={c.finish !== "nonfoil"} />
              </View>
            ) : null
          )}
        </View>
      )}
    </Touchable>
  );
}

function SignInBanner({ onPress }: { onPress: () => void }) {
  return (
    <Touchable onPress={onPress} pressedScale={0.985} accessibilityRole="button" style={styles.banner}>
      <LinearGradient colors={["#3B6CF0", "#7B4DFF", "#C04BD6"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.bannerGlow} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="gift" size={18} color="#FFFFFF" />
        <Text variant="bodyStrong" color="rgba(255,255,255,0.9)">
          Start your collection
        </Text>
      </View>
      <Text style={styles.bannerTitle}>Scan your cards and see what they're worth today.</Text>
      <View style={styles.bannerCta}>
        <Text variant="bodyStrong" color={color.text}>
          Sign in free
        </Text>
        <Ionicons name="arrow-forward" size={16} color={color.text} />
      </View>
    </Touchable>
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
      style={styles.shortcut}
    >
      <IconBubble icon={icon} tint={tint} size={56} />
      <Text variant="callout" color={color.text}>
        {label}
      </Text>
    </Touchable>
  );
}

// ── Market rail ──────────────────────────────────────────────────────────────

function Rail({
  cards,
  loading,
  onOpen,
  showDelta,
  empty,
}: {
  cards: MarketCard[] | undefined;
  loading: boolean;
  onOpen: (variantId: string) => void;
  showDelta?: boolean;
  empty: string;
}) {
  if (loading) {
    return (
      <View style={styles.railSkeleton}>
        {[0, 1, 2].map((i) => (
          <SkeletonBlock key={i} height={RAIL_TILE_WIDTH / CARD_ASPECT} style={{ width: RAIL_TILE_WIDTH, borderRadius: 8 }} />
        ))}
      </View>
    );
  }
  if (!cards || cards.length === 0) {
    return (
      <View style={styles.railEmpty}>
        <Text variant="body" color={color.textSecondary} align="center">
          {empty}
        </Text>
      </View>
    );
  }
  return (
    <FlatList
      horizontal
      data={cards}
      keyExtractor={(c) => c.variantId}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: space.lg, gap: 14, paddingBottom: space.sm }}
      renderItem={({ item }) => (
        <CardTile
          style={{ width: RAIL_TILE_WIDTH }}
          name={item.name}
          imageUri={item.imageUri}
          price={item.bestUsd ?? item.priceUsd}
          rarity={item.rarity}
          subtitle={setLabel(item.setId, item.collectorNumber)}
          deltaPct={showDelta ? item.deltaPct : undefined}
          onPress={() => onOpen(item.variantId)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  topBar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg },
  statusPill: { flexDirection: "row", alignItems: "center", gap: space.sm, height: 58, paddingLeft: 10, paddingRight: space.lg },
  actionPill: { flexDirection: "row", alignItems: "center", height: 58, paddingHorizontal: 6 },
  actionIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  actionDivider: { width: 1, height: 22, backgroundColor: "rgba(16,24,40,0.12)" },

  slide: { height: 190, borderRadius: radius.xl, overflow: "hidden", backgroundColor: "#151925", flexDirection: "row", borderWidth: 2, borderColor: glass.edge },
  slideText: { flex: 1, padding: space.xl, justifyContent: "center" },
  slideRank: { flexDirection: "row", alignItems: "center", gap: 8 },
  rank: { fontFamily: font.heavy, fontSize: 22, color: "rgba(255,255,255,0.4)" },
  rankDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.4)" },
  slidePrice: { fontFamily: font.heavy, fontSize: 22, color: "#FFFFFF", fontVariant: ["tabular-nums"] },
  slideName: { fontFamily: font.heavy, fontSize: 22, lineHeight: 27, color: "#FFFFFF", letterSpacing: -0.5, marginTop: 6 },
  slideMeta: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
  deltaChip: { flexDirection: "row", alignItems: "center", gap: 2, height: 22, paddingHorizontal: 7, borderRadius: 7 },
  slideArt: { width: 150, alignItems: "center", justifyContent: "center" },
  slideArtBack: { position: "absolute", opacity: 0.55, transform: [{ translateX: 22 }, { rotate: "8deg" }, { scale: 0.92 }] },
  slideArtFront: {
    transform: [{ rotate: "-4deg" }],
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: space.md, marginBottom: space.lg },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(16,24,40,0.18)" },
  dotActive: { width: 20, backgroundColor: color.accent },

  panel: { flexGrow: 1 },
  collection: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: space.lg,
    padding: space.xl,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    minHeight: 150,
  },
  collectionMeta: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.md },
  countPill: { flexDirection: "row", alignItems: "center", gap: 5, height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: color.accentSoft },
  fan: { width: 120, height: 110, alignItems: "center", justifyContent: "center" },
  fanCard: {
    position: "absolute",
    width: 64,
    shadowColor: "#1D2939",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  banner: { marginHorizontal: space.lg, padding: space.xl, borderRadius: radius.xl, overflow: "hidden", minHeight: 170, justifyContent: "space-between" },
  bannerGlow: { position: "absolute", right: -60, top: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: "rgba(255,255,255,0.14)" },
  bannerTitle: { fontFamily: font.heavy, fontSize: 24, lineHeight: 30, letterSpacing: -0.6, color: "#FFFFFF", marginTop: space.sm },
  bannerCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    marginTop: space.lg,
  },

  shortcuts: { flexDirection: "row", justifyContent: "space-around", paddingHorizontal: space.md, marginTop: space.xxl },
  shortcut: { alignItems: "center", gap: space.sm, width: 72 },

  marketCard: {
    marginTop: space.xxl,
    marginHorizontal: space.md,
    paddingTop: space.xl,
    paddingBottom: space.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  railSkeleton: { flexDirection: "row", gap: 14, paddingHorizontal: space.lg },
  railEmpty: { paddingHorizontal: space.xxl, paddingVertical: space.xxl },
});
