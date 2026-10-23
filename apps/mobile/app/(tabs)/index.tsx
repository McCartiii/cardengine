import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { color, radius, space, TAB_BAR_CLEARANCE } from "@/design/tokens";
import { formatUsd, setLabel } from "@/design/format";
import { getCollectionValue, getMarketHome, type MarketCard } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import {
  Button,
  CardTile,
  IconButton,
  Screen,
  SectionHeader,
  SkeletonBlock,
  Text,
  Touchable,
} from "@/ui";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const RAIL_TILE_WIDTH = 132;

export default function HomeScreen() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const [market, setMarket] = useState<{ movers: MarketCard[]; newCards: MarketCard[]; popular: MarketCard[] } | null>(null);
  const [value, setValue] = useState<{ total: number; count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [m, v] = await Promise.allSettled([getMarketHome(), session ? getCollectionValue() : Promise.reject()]);
    if (m.status === "fulfilled") setMarket(m.value);
    if (v.status === "fulfilled") setValue({ total: v.value.totalValue, count: v.value.cardCount });
    setLoading(false);
    setRefreshing(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openCard = (variantId: string) => router.push({ pathname: "/card/[id]", params: { id: variantId } });

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
          <View style={styles.wordmark}>
            <View style={styles.logoMark}>
              <Ionicons name="diamond" size={14} color={color.onAccent} />
            </View>
            <Text variant="headline">Card Engine</Text>
          </View>
          <View style={styles.topActions}>
            <IconButton icon="notifications-outline" label="Price alerts" onPress={() => router.push("/alerts")} />
            <IconButton icon="person-outline" label="Profile" onPress={() => router.push("/profile")} />
          </View>
        </View>

        <View style={styles.section}>
          {loading ? (
            <SkeletonBlock height={164} />
          ) : session ? (
            <Touchable onPress={() => router.navigate("/(tabs)/collection")} pressedScale={0.985} accessibilityRole="button">
              <LinearGradient colors={["#2A2113", color.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
                <Text variant="label" color={color.textSecondary}>
                  Collection value
                </Text>
                <Text variant="priceLarge" style={{ marginTop: space.xs }}>
                  {formatUsd(value?.total ?? 0)}
                </Text>
                <View style={styles.heroFooter}>
                  <Text variant="callout" color={color.textSecondary}>
                    {value?.count ?? 0} {value?.count === 1 ? "card" : "cards"}
                  </Text>
                  <View style={styles.heroLink}>
                    <Text variant="callout" color={color.accent}>
                      View collection
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={color.accent} />
                  </View>
                </View>
              </LinearGradient>
            </Touchable>
          ) : (
            <LinearGradient colors={["#2A2113", color.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <Text variant="headline">Track what your cards are worth</Text>
              <Text variant="body" color={color.textSecondary} style={{ marginTop: space.xs }}>
                Sign in to build a collection, follow prices and save decks.
              </Text>
              <Button label="Sign in" onPress={() => router.push("/(auth)/sign-in")} style={{ alignSelf: "flex-start", marginTop: space.lg }} />
            </LinearGradient>
          )}
        </View>

        <View style={[styles.section, styles.actions]}>
          <QuickAction icon="scan" label="Scan cards" accent onPress={() => router.navigate("/(tabs)/scan")} />
          <QuickAction icon="heart-outline" label="Life counter" onPress={() => router.push("/life")} />
          <QuickAction icon="storefront-outline" label="Local shops" onPress={() => router.push("/shops")} />
        </View>

        <Rail title="Top movers" cards={market?.movers} loading={loading} onOpen={openCard} showDelta
          empty="Movers show up once there are two days of price history." />
        <Rail title="Just released" cards={market?.newCards} loading={loading} onOpen={openCard} />
        <Rail title="Popular" cards={market?.popular} loading={loading} onOpen={openCard} />
      </ScrollView>
    </Screen>
  );
}

function QuickAction({ icon, label, onPress, accent }: { icon: IconName; label: string; onPress: () => void; accent?: boolean }) {
  return (
    <Touchable onPress={onPress} accessibilityRole="button" style={[styles.action, accent && { backgroundColor: color.accent }]}>
      <Ionicons name={icon} size={22} color={accent ? color.onAccent : color.text} />
      <Text variant="callout" color={accent ? color.onAccent : color.text}>
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
            <SkeletonBlock key={i} height={RAIL_TILE_WIDTH / (63 / 88)} style={{ width: RAIL_TILE_WIDTH, borderRadius: radius.card }} />
          ))}
        </View>
      ) : !cards || cards.length === 0 ? (
        <View style={[styles.section, styles.railEmpty]}>
          <Text variant="callout" color={color.textTertiary}>
            {empty}
          </Text>
        </View>
      ) : (
        <FlatList
          horizontal
          data={cards}
          keyExtractor={(c) => c.variantId}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}
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
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  wordmark: { flexDirection: "row", alignItems: "center", gap: space.sm },
  logoMark: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  topActions: { flexDirection: "row", gap: space.sm },
  section: { paddingHorizontal: space.lg },
  hero: {
    borderRadius: radius.xl,
    padding: space.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
  },
  heroFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space.lg },
  heroLink: { flexDirection: "row", alignItems: "center", gap: 2 },
  actions: { flexDirection: "row", gap: space.md, marginTop: space.lg },
  action: {
    flex: 1,
    height: 88,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    padding: space.md,
    justifyContent: "space-between",
  },
  rail: { marginTop: space.xxxl },
  railSkeleton: { flexDirection: "row", gap: space.md, paddingHorizontal: space.lg },
  railEmpty: {
    paddingVertical: space.xl,
    marginHorizontal: space.lg,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.borderStrong,
  },
});
