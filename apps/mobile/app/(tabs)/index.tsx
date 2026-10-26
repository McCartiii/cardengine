import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { bubble, color, elevation, hairline, space, TAB_BAR_CLEARANCE } from "@/design/tokens";
import { font } from "@/design/fonts";
import { Image } from "expo-image";
import { getCollectionCards, getCollectionValue, getMarketHome, getProfile, type MarketCard, type OwnedCard } from "@/lib/api";
import { friendlyName } from "@/lib/names";
import { useAuthStore } from "@/store/authStore";
import { GREETING_NAMES, greeting, pick } from "@/lib/flavor";
import { BinderCover, FoilTabs, HoloRing, RankRow, Screen, SkeletonBlock, Spotlight, Text, Ticker, Touchable, tap } from "@/ui";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type MarketTab = "popular" | "movers" | "newCards";

const MARKET_TABS: ReadonlyArray<{ value: MarketTab; label: string }> = [
  { value: "popular", label: "Trending" },
  { value: "movers", label: "Movers" },
  { value: "newCards", label: "New" },
];


export default function HomeScreen() {
  const router = useRouter();
  const [hello] = useState(() => greeting(new Date().getHours()));
  const [nickname] = useState(() => pick("nickname", GREETING_NAMES));
  const { session, user } = useAuthStore();
  const [market, setMarket] = useState<Record<MarketTab, MarketCard[]> | null>(null);
  const [value, setValue] = useState<{ total: number; count: number } | null>(null);
  const [profile, setProfile] = useState<{ displayName: string | null; avatarUrl: string | null } | null>(null);
  const [offline, setOffline] = useState(false);
  const [topCards, setTopCards] = useState<OwnedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<MarketTab>("popular");

  const load = useCallback(async () => {
    const [m, v, top, p] = await Promise.allSettled([
      getMarketHome(),
      session ? getCollectionValue() : Promise.reject(),
      session ? getCollectionCards({ sort: "value", limit: 24 }) : Promise.reject(),
      session ? getProfile() : Promise.reject(),
    ]);
    if (p.status === "fulfilled") setProfile(p.value);
    // Nothing came back: say so rather than showing an empty collection.
    setOffline(m.status === "rejected" && (!session || v.status === "rejected"));
    if (m.status === "fulfilled") setMarket(m.value);
    if (v.status === "fulfilled") setValue({ total: v.value.totalValue, count: v.value.copies ?? v.value.cardCount });
    if (top.status === "fulfilled") setTopCards(top.value.cards);
    setLoading(false);
    setRefreshing(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openCard = (variantId: string) => router.push({ pathname: "/card/[id]", params: { id: variantId } });
  const name = session ? friendlyName(profile?.displayName, user?.email) : null;
  const ranked = (market?.[tab] ?? []).slice(0, 8);

  // The biggest movers, either way, get the spotlight.
  const spotlight = useMemo(
    () =>
      [...(market?.movers ?? market?.popular ?? [])]
        .sort((a, b) => Math.abs(b.deltaPct ?? 0) - Math.abs(a.deltaPct ?? 0))
        .slice(0, 5),
    [market]
  );

  // Your most valuable cards fill the first pages; signed out, market favorites stand in.
  const binderCards = session
    ? topCards.map((c) => ({ id: c.variantId, uri: c.imageUri, name: c.name, price: c.priceUsd, change: c.changePct }))
    : (market?.popular ?? []).slice(0, 8).map((c) => ({ id: c.variantId, uri: c.imageUri, name: c.name, price: c.bestUsd ?? c.priceUsd, change: c.deltaPct }));

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
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="caption" color={color.textSecondary}>
              {hello}
            </Text>
            <Text style={styles.name} numberOfLines={1}>
              {name ?? nickname}
            </Text>
          </View>
          <HeaderButton icon="notifications-outline" label="Price alerts" onPress={() => router.push("/alerts")} />
          <Touchable onPress={() => router.push("/profile")} accessibilityRole="button" accessibilityLabel="Profile" pressedScale={0.92}>
            <HoloRing radius={22} thickness={2.5}>
              <View style={styles.avatar}>
                {session && profile?.avatarUrl ? (
                  <Image source={{ uri: profile.avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : session ? (
                  <Text style={styles.avatarText}>{(name ?? "?").slice(0, 1).toUpperCase()}</Text>
                ) : (
                  <Ionicons name="person" size={17} color="#FFFFFF" />
                )}
              </View>
            </HoloRing>
          </Touchable>
        </View>

        {offline && (
          <View style={styles.offline}>
            <Ionicons name="cloud-offline-outline" size={18} color={color.textSecondary} />
            <Text variant="callout" color={color.textSecondary} style={{ flex: 1 }}>
              Can't reach CardEngine right now. Pull down to try again.
            </Text>
          </View>
        )}

        <Animated.View entering={FadeInDown.duration(400)} style={styles.section}>
          {loading ? (
            <SkeletonBlock height={330} style={{ borderRadius: 28 }} />
          ) : (
            <BinderCover
              cards={binderCards}
              value={value?.total ?? null}
              count={value?.count ?? null}
              signedIn={!!session}
              onOpen={() => (session ? router.navigate("/(tabs)/collection") : router.push("/(auth)/sign-in"))}
              onCard={openCard}
              onEmpty={() => (session ? router.navigate("/(tabs)/scan") : router.push("/(auth)/sign-in"))}
            />
          )}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(70).duration(400)} style={styles.section}>
          <Ticker cards={market?.movers?.length ? market.movers : market?.popular ?? []} onOpen={openCard} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(140).duration(400)} style={[styles.section, styles.actions]}>
          <Action icon="scan" label="Scan" hint="Add cards" dark onPress={() => router.navigate("/(tabs)/scan")} />
          <Action icon="heart" label="Life" hint="Game night" colors={bubble.pink} onPress={() => router.push("/life")} />
          <Action icon="location" label="Shops" hint="Near you" onPress={() => router.push("/shops")} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(175).duration(400)} style={styles.section}>
          <AskAi onPress={() => router.push("/assistant")} />
        </Animated.View>

        {spotlight.length > 0 && (
          <Animated.View entering={FadeInDown.delay(210).duration(400)} style={styles.section}>
            <Spotlight cards={spotlight} onOpen={openCard} />
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(280).duration(400)} style={styles.section}>
          <View style={styles.marketHead}>
            <FoilTabs options={MARKET_TABS} value={tab} onChange={setTab} />
            <Touchable onPress={() => router.navigate("/(tabs)/search")} accessibilityRole="link" hitSlop={8} style={{ marginBottom: 9 }}>
              <Text variant="callout" color={color.accent}>
                See all
              </Text>
            </Touchable>
          </View>
          <View style={styles.board}>
            {loading ? (
              [0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={56} style={{ borderRadius: 12, marginVertical: 6 }} />)
            ) : ranked.length === 0 ? (
              <Text variant="body" color={color.textSecondary} align="center" style={styles.empty}>
                {tab === "movers" ? "Movers appear once there are two days of price history." : "Nothing here yet. Check back after the next price update."}
              </Text>
            ) : (
              ranked.map((c, i) => (
                <RankRow key={c.variantId} rank={i + 1} card={c} onPress={() => openCard(c.variantId)} style={i > 0 && styles.rowDivider} />
              ))
            )}
          </View>
        </Animated.View>
      </ScrollView>
    </Screen>
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
      hitSlop={6}
      pressedScale={0.9}
      style={styles.headerButton}
    >
      <Ionicons name={icon} size={20} color={color.ink} />
    </Touchable>
  );
}

/** The way into the AI assistant: a wide violet strip under the quick actions. */
function AskAi({ onPress }: { onPress: () => void }) {
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel="Ask AI about your cards" pressedScale={0.98}>
      <LinearGradient colors={bubble.violet} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.askAi}>
        <View style={[styles.actionIcon, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
          <Ionicons name="sparkles" size={19} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.actionLabel, { color: "#FFFFFF" }]}>Ask AI</Text>
          <Text variant="caption" color="rgba(255,255,255,0.78)">
            What to build, sell or trade from your binder
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
      </LinearGradient>
    </Touchable>
  );
}

/** Square quick action; dark for the main one, gradient or white for the rest. */
function Action({
  icon,
  label,
  hint,
  dark,
  colors,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint: string;
  dark?: boolean;
  colors?: readonly [string, string];
  onPress: () => void;
}) {
  const onColor = dark || colors;
  const fg = onColor ? "#FFFFFF" : color.ink;
  const body = (
    <>
      <View style={[styles.actionIcon, { backgroundColor: onColor ? "rgba(255,255,255,0.18)" : color.surface2 }]}>
        <Ionicons name={icon} size={19} color={fg} />
      </View>
      <View>
        <Text style={[styles.actionLabel, { color: fg }]}>{label}</Text>
        <Text variant="caption" color={onColor ? "rgba(255,255,255,0.72)" : color.textSecondary}>
          {hint}
        </Text>
      </View>
    </>
  );
  return (
    <Touchable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      pressedScale={0.95}
      style={{ flex: 1 }}
    >
      {colors ? (
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.action}>
          {body}
        </LinearGradient>
      ) : (
        <View style={[styles.action, dark ? { backgroundColor: color.ink } : styles.actionLight]}>{body}</View>
      )}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm },
  name: { fontFamily: font.heavy, fontSize: 26, lineHeight: 32, letterSpacing: -0.8, color: color.ink },
  offline: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    padding: space.md,
    borderRadius: 14,
    backgroundColor: color.surface2,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.ink, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarText: { fontFamily: font.heavy, fontSize: 16, color: "#FFFFFF" },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    ...hairline,
    ...elevation.card,
  },
  section: { paddingHorizontal: space.lg, marginTop: space.lg },
  actions: { flexDirection: "row", gap: 10 },
  askAi: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 22, ...elevation.card },
  action: { height: 112, borderRadius: 22, padding: 14, justifyContent: "space-between", ...elevation.card },
  actionLight: { backgroundColor: "#FFFFFF", ...hairline },
  actionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontFamily: font.heavy, fontSize: 16, letterSpacing: -0.3 },
  marketHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: space.sm, marginBottom: space.md },
  board: { backgroundColor: "#FFFFFF", borderRadius: 22, paddingHorizontal: 14, paddingVertical: 6, ...hairline, ...elevation.card },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderStrong },
  empty: { paddingHorizontal: space.lg, paddingVertical: space.xxl },
});
