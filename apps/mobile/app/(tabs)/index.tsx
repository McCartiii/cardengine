import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { CARD_ASPECT, color, elevation, radius, space, TAB_BAR_CLEARANCE } from "@/design/tokens";
import { font } from "@/design/fonts";
import { formatUsd, setLabel } from "@/design/format";
import { getCollectionCards, getCollectionValue, getMarketHome, type MarketCard, type OwnedCard } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { Button, CardArt, CardTile, IconButton, Screen, SectionHeader, SkeletonBlock, Text, Touchable } from "@/ui";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const RAIL_TILE_WIDTH = 124;
const FAN_WIDTH = 74;

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function HomeScreen() {
  const router = useRouter();
  const { session, user } = useAuthStore();
  const [market, setMarket] = useState<{ movers: MarketCard[]; newCards: MarketCard[]; popular: MarketCard[] } | null>(null);
  const [value, setValue] = useState<{ total: number; count: number } | null>(null);
  const [topCards, setTopCards] = useState<OwnedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
  const initial = (user?.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
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
        <View style={styles.topBar}>
          <View>
            <Text variant="label" color={color.textTertiary}>
              {greeting()}
            </Text>
            <Text style={styles.wordmark}>
              <Text style={styles.wordmarkItalic}>Card</Text> Engine
            </Text>
          </View>
          <View style={styles.topActions}>
            <IconButton icon="notifications-outline" label="Price alerts" onPress={() => router.push("/alerts")} />
            <Touchable onPress={() => router.push("/profile")} accessibilityRole="button" accessibilityLabel="Profile" style={styles.avatar}>
              {session ? (
                <Text variant="callout" color={color.onAccent}>
                  {initial}
                </Text>
              ) : (
                <Ionicons name="person" size={16} color={color.onAccent} />
              )}
            </Touchable>
          </View>
        </View>

        <Animated.View entering={FadeInDown.duration(380)} style={styles.section}>
          {loading ? (
            <SkeletonBlock height={188} style={{ borderRadius: radius.xl }} />
          ) : session ? (
            <Touchable onPress={() => router.navigate("/(tabs)/collection")} pressedScale={0.985} accessibilityRole="button">
              <View style={styles.hero}>
                <LinearGradient
                  colors={["rgba(255,178,36,0.20)", "rgba(255,178,36,0.04)", "rgba(255,178,36,0)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.heroText}>
                  <Text variant="label" color={color.textSecondary}>
                    Your collection
                  </Text>
                  <Text variant="priceLarge" style={{ marginTop: space.sm }} numberOfLines={1} adjustsFontSizeToFit>
                    {formatUsd(value?.total ?? 0)}
                  </Text>
                  <Text variant="callout" color={color.textSecondary} style={{ marginTop: space.xs }}>
                    {value?.count ?? 0} {value?.count === 1 ? "card" : "cards"}
                  </Text>
                  <View style={styles.heroLink}>
                    <Text variant="callout" color={color.accent}>
                      Open collection
                    </Text>
                    <Ionicons name="arrow-forward" size={14} color={color.accent} />
                  </View>
                </View>
                {topCards.length > 0 && <CardFan cards={topCards} />}
              </View>
            </Touchable>
          ) : (
            <View style={styles.hero}>
              <LinearGradient
                colors={["rgba(255,178,36,0.20)", "rgba(255,178,36,0)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={{ padding: space.xl, gap: space.sm }}>
                <Text variant="title" style={{ fontSize: 30, lineHeight: 34 }}>
                  Know what your cards are worth
                </Text>
                <Text variant="body" color={color.textSecondary}>
                  Sign in to build a collection, follow prices and save decks.
                </Text>
                <Button label="Sign in" onPress={() => router.push("/(auth)/sign-in")} style={{ alignSelf: "flex-start", marginTop: space.sm }} />
              </View>
            </View>
          )}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(380)} style={[styles.section, styles.shortcuts]}>
          <Shortcut icon="heart-outline" label="Life" onPress={() => router.push("/life")} />
          <Shortcut icon="layers-outline" label="Decks" onPress={() => router.navigate("/(tabs)/decks")} />
          <Shortcut icon="notifications-outline" label="Alerts" onPress={() => router.push("/alerts")} />
          <Shortcut icon="storefront-outline" label="Shops" onPress={() => router.push("/shops")} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).duration(380)}>
          <Rail
            title="Top movers"
            cards={market?.movers}
            loading={loading}
            onOpen={openCard}
            showDelta
            empty="Movers appear once there are two days of price history."
          />
          <Rail title="Just released" cards={market?.newCards} loading={loading} onOpen={openCard} />
          <Rail title="Popular" cards={market?.popular} loading={loading} onOpen={openCard} />
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

/** The collection's three most valuable cards, fanned like a hand. */
function CardFan({ cards }: { cards: OwnedCard[] }) {
  const layout = [
    { rotate: "-12deg", x: -30, y: 10 },
    { rotate: "10deg", x: 30, y: 8 },
    { rotate: "0deg", x: 0, y: 0 },
  ];
  // Most valuable card goes on top, in the middle.
  const ordered = [cards[1], cards[2], cards[0]];
  return (
    <View style={styles.fan} pointerEvents="none">
      {ordered.map((c, i) =>
        c ? (
          <View
            key={c.holdingId}
            style={[styles.fanCard, { transform: [{ translateX: layout[i].x }, { translateY: layout[i].y }, { rotate: layout[i].rotate }] }]}
          >
            <CardArt uri={c.imageUri} name={c.name} foil={c.finish !== "nonfoil"} />
          </View>
        ) : null
      )}
    </View>
  );
}

function Shortcut({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.shortcut}>
      <View style={styles.shortcutIcon}>
        <Ionicons name={icon} size={20} color={color.text} />
      </View>
      <Text variant="caption" color={color.textSecondary}>
        {label}
      </Text>
    </Touchable>
  );
}

interface RailProps {
  title: string;
  cards: MarketCard[] | undefined;
  loading: boolean;
  onOpen: (variantId: string) => void;
  showDelta?: boolean;
  empty?: string;
}

function Rail({ title, cards, loading, onOpen, showDelta, empty }: RailProps) {
  if (!loading && (!cards || cards.length === 0) && !empty) return null;
  return (
    <View style={styles.rail}>
      <SectionHeader title={title} />
      {loading ? (
        <View style={styles.railSkeleton}>
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} height={RAIL_TILE_WIDTH / CARD_ASPECT} style={{ width: RAIL_TILE_WIDTH, borderRadius: 6 }} />
          ))}
        </View>
      ) : !cards || cards.length === 0 ? (
        <View style={styles.railEmpty}>
          <Ionicons name="pulse-outline" size={18} color={color.textTertiary} />
          <Text variant="callout" color={color.textTertiary} style={{ flex: 1 }}>
            {empty}
          </Text>
        </View>
      ) : (
        <FlatList
          horizontal
          data={cards}
          keyExtractor={(c) => c.variantId}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.lg, gap: 14 }}
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xl,
  },
  wordmark: { fontFamily: font.serif, fontSize: 30, lineHeight: 34, color: color.text, letterSpacing: -0.4 },
  wordmarkItalic: { fontFamily: font.serifItalic, color: color.accent },
  topActions: { flexDirection: "row", alignItems: "center", gap: space.sm },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  section: { paddingHorizontal: space.lg },
  hero: {
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    overflow: "hidden",
    minHeight: 188,
    flexDirection: "row",
    ...elevation.card,
  },
  heroText: { flex: 1, padding: space.xl, justifyContent: "center" },
  heroLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.lg },
  fan: { width: 150, alignItems: "center", justifyContent: "center", marginRight: space.sm },
  fanCard: {
    position: "absolute",
    width: FAN_WIDTH,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  shortcuts: { flexDirection: "row", justifyContent: "space-between", marginTop: space.xl },
  shortcut: { alignItems: "center", gap: space.sm, width: 72 },
  shortcutIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
    ...elevation.card,
  },
  rail: { marginTop: space.xxxl + space.sm },
  railSkeleton: { flexDirection: "row", gap: 14, paddingHorizontal: space.lg },
  railEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginHorizontal: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    ...elevation.card,
  },
});
