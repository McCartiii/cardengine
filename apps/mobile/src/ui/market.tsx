// Home pieces: the binder-cover hero, the live price ticker, the spotlight
// stack and ranked market rows.
import React, { useEffect, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { Easing, FadeIn, SlideInRight, useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from "react-native-reanimated";
import { binder, CARD_ASPECT, cardRadius, color, holo, radius, space } from "../design/tokens";
import { font } from "../design/fonts";
import { formatDeltaPct, formatUsd, setLabel } from "../design/format";
import type { MarketCard } from "../lib/api";
import { Text, Touchable, tap } from "./primitives";
import { CardArt } from "./cards";
import { CountUp, FoilSweep, HoloRing, Sparkline } from "./holo";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** A short label for cards whose price is moving fast, or null. */
export function dealBadge(deltaPct: number | null | undefined): { label: string; icon: IconName; bg: string } | null {
  if (deltaPct == null || !Number.isFinite(deltaPct)) return null;
  if (deltaPct >= 8) return { label: "Hot", icon: "flame", bg: "#FF5A1F" };
  if (deltaPct <= -8) return { label: "Dip", icon: "arrow-down", bg: color.positive };
  return null;
}

function Change({ pct, size = 12 }: { pct: number | null | undefined; size?: number }) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const up = pct >= 0;
  const fg = up ? color.positive : color.negative;
  return (
    <View style={styles.change}>
      <Ionicons name={up ? "caret-up" : "caret-down"} size={size - 2} color={fg} />
      <Text variant="number" color={fg} style={{ fontSize: size }}>
        {formatDeltaPct(Math.abs(pct)).replace(/^\+/, "")}
      </Text>
    </View>
  );
}

// ── Binder cover ─────────────────────────────────────────────────────────────

interface BinderCoverProps {
  cards: Array<{ id: string; uri: string | null; name: string }>;
  value: number | null;
  count: number;
  signedIn: boolean;
  onPress: () => void;
}

/** Home's hero: the binder's cover with the best cards slipped into its pocket. */
export function BinderCover({ cards, value, count, signedIn, onPress }: BinderCoverProps) {
  const slots = [0, 1, 2].map((i) => cards[i] ?? null);
  const tilt = ["-7deg", "0deg", "7deg"];
  return (
    <Touchable onPress={onPress} pressedScale={0.985} accessibilityRole="button" accessibilityLabel={signedIn ? "Open your binder" : "Sign in"}>
      <View style={styles.cover}>
        <LinearGradient colors={[binder.coverTop, binder.cover, binder.coverDeep]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.spine}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.hole} />
          ))}
        </View>

        <View style={styles.pocketCards} pointerEvents="none">
          {slots.map((c, i) => (
            <View key={i} style={[styles.pocketCard, { transform: [{ rotate: tilt[i] }, { translateY: i === 1 ? -10 : 0 }] }]}>
              {c ? (
                <View style={{ borderRadius: cardRadius(78), overflow: "hidden" }}>
                  <CardArt uri={c.uri} name={c.name} />
                  {i === 1 && <FoilSweep width={78} strength={0.45} />}
                </View>
              ) : (
                <View style={styles.emptySleeve} />
              )}
            </View>
          ))}
        </View>

        <View style={styles.pocket}>
          <LinearGradient colors={["rgba(255,255,255,0.16)", "rgba(255,255,255,0.04)"]} style={StyleSheet.absoluteFill} />
          <View style={styles.stitch} />
          {signedIn ? (
            <>
              <Text variant="label" color={binder.coverMuted} style={styles.coverLabel}>
                MY BINDER · {count} CARDS
              </Text>
              <View style={styles.coverRow}>
                <CountUp value={value ?? 0} format={(n) => formatUsd(n)} style={styles.coverValue} numberOfLines={1} adjustsFontSizeToFit />
                <LinearGradient colors={binder.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.goldButton}>
                  <Text variant="callout" color={binder.onGold}>
                    Open
                  </Text>
                  <Ionicons name="arrow-forward" size={14} color={binder.onGold} />
                </LinearGradient>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.coverTitle}>Start your binder</Text>
              <View style={styles.coverRow}>
                <Text variant="callout" color={binder.coverMuted} style={{ flex: 1, fontFamily: font.medium }}>
                  Sleeve every card and watch what it's worth.
                </Text>
                <LinearGradient colors={binder.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.goldButton}>
                  <Text variant="callout" color={binder.onGold}>
                    Sign in
                  </Text>
                </LinearGradient>
              </View>
            </>
          )}
        </View>
      </View>
    </Touchable>
  );
}

// ── Ticker ───────────────────────────────────────────────────────────────────

/** A slow, endless crawl of market prices, like a stock ticker. */
export function Ticker({ cards, onOpen }: { cards: MarketCard[]; onOpen: (variantId: string) => void }) {
  const [runWidth, setRunWidth] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => {
    if (!runWidth) return;
    x.value = 0;
    x.value = withRepeat(withTiming(-runWidth, { duration: runWidth * 28, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(x);
  }, [runWidth, x]);
  const crawl = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  if (cards.length === 0) return null;

  const run = (copy: number) => (
    <View style={styles.tickerRun} onLayout={copy === 0 ? (e) => setRunWidth(e.nativeEvent.layout.width) : undefined}>
      {cards.map((c) => (
        <Touchable key={`${copy}-${c.variantId}`} onPress={() => onOpen(c.variantId)} style={styles.tickerItem} accessibilityRole="button">
          <Text variant="callout" numberOfLines={1}>
            {c.name}
          </Text>
          <Text variant="number" color={color.textSecondary}>
            {formatUsd(c.bestUsd ?? c.priceUsd)}
          </Text>
          <Change pct={c.deltaPct} />
          <View style={styles.tickerSep} />
        </Touchable>
      ))}
    </View>
  );

  return (
    <View style={styles.ticker}>
      <View style={styles.live}>
        <View style={styles.liveDot} />
        <Text variant="label" color="#FFFFFF">
          LIVE
        </Text>
      </View>
      <View style={{ flex: 1, overflow: "hidden" }}>
        <Animated.View style={[{ flexDirection: "row" }, crawl]}>
          {run(0)}
          {run(1)}
        </Animated.View>
        <LinearGradient colors={["rgba(255,255,255,0)", "#FFFFFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tickerFade} pointerEvents="none" />
      </View>
    </View>
  );
}

// ── Spotlight ────────────────────────────────────────────────────────────────

/** A hand of featured cards: tap the hand to deal the next one to the front. */
export function Spotlight({ cards, onOpen }: { cards: MarketCard[]; onOpen: (variantId: string) => void }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (cards.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % cards.length), 6000);
    return () => clearInterval(id);
  }, [cards.length]);
  if (cards.length === 0) return null;

  const front = cards[index % cards.length];
  const behind = [cards[(index + 1) % cards.length], cards[(index + 2) % cards.length]];
  const price = front.bestUsd ?? front.priceUsd;
  const up = (front.deltaPct ?? 0) >= 0;

  return (
    <HoloRing radius={28} thickness={2}>
      <View style={styles.spotlight}>
        <Touchable
          onPress={() => {
            tap();
            setIndex((i) => (i + 1) % cards.length);
          }}
          pressedScale={0.96}
          accessibilityRole="button"
          accessibilityLabel="Next card"
          style={styles.hand}
        >
          {cards.length > 2 && (
            <View style={[styles.handCard, styles.handBack, { transform: [{ translateX: 22 }, { rotate: "10deg" }] }]}>
              <CardArt uri={behind[1].imageUri} name={behind[1].name} />
            </View>
          )}
          {cards.length > 1 && (
            <View style={[styles.handCard, styles.handBack, { transform: [{ translateX: 11 }, { rotate: "5deg" }] }]}>
              <CardArt uri={behind[0].imageUri} name={behind[0].name} />
            </View>
          )}
          <Animated.View key={front.variantId} entering={SlideInRight.duration(380)} style={styles.handCard}>
            <View style={{ borderRadius: cardRadius(HAND_WIDTH), overflow: "hidden" }}>
              <CardArt uri={front.imageUri} name={front.name} />
              <FoilSweep width={HAND_WIDTH} strength={0.4} />
            </View>
          </Animated.View>
        </Touchable>

        <Animated.View key={`info-${front.variantId}`} entering={FadeIn.duration(320)} style={styles.spotInfo}>
          <View style={styles.spotKicker}>
            <Ionicons name="sparkles" size={12} color={color.accent} />
            <Text variant="label" color={color.accent}>
              SPOTLIGHT {index % cards.length + 1}/{cards.length}
            </Text>
          </View>
          <Text style={styles.spotName} numberOfLines={2}>
            {front.name}
          </Text>
          <Text variant="code" color={color.textTertiary}>
            {setLabel(front.setId, front.collectorNumber)}
          </Text>
          <Text style={styles.spotPrice}>{formatUsd(price)}</Text>
          <Change pct={front.deltaPct} size={13} />
          {front.sparkline.length > 1 && (
            <View style={{ marginTop: 6 }}>
              <Sparkline values={front.sparkline} width={140} height={34} strokeWidth={2.5} stroke={up ? color.positive : color.negative} />
            </View>
          )}
          <Touchable onPress={() => onOpen(front.variantId)} accessibilityRole="button" style={styles.viewButton}>
            <Text variant="callout" color="#FFFFFF">
              View card
            </Text>
          </Touchable>
        </Animated.View>
      </View>
    </HoloRing>
  );
}

const HAND_WIDTH = 118;

// ── Ranked market rows ───────────────────────────────────────────────────────

/** Underlined text tabs; the active one gets a foil underline. */
export function FoilTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Touchable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) tap();
              onChange(o.value);
            }}
            style={styles.tab}
          >
            <Text style={[styles.tabText, { color: on ? color.ink : color.textTertiary }]}>{o.label}</Text>
            {on ? <LinearGradient colors={holo} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tabBar} /> : <View style={styles.tabBarOff} />}
          </Touchable>
        );
      })}
    </View>
  );
}

/** One row of the market leaderboard: rank, card, trend and price. */
export function RankRow({ rank, card, onPress, style }: { rank: number; card: MarketCard; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const badge = dealBadge(card.deltaPct);
  const up = (card.deltaPct ?? 0) >= 0;
  return (
    <Touchable onPress={onPress} pressedScale={0.98} accessibilityRole="button" accessibilityLabel={card.name} style={[styles.rankRow, style]}>
      <Text style={[styles.rank, rank <= 3 && { color: color.ink }]}>{rank}</Text>
      <View style={styles.rankThumb}>
        <CardArt uri={card.imageUri} name={card.name} />
        {badge && (
          <View style={[styles.badge, { backgroundColor: badge.bg }]} accessibilityLabel={badge.label}>
            <Ionicons name={badge.icon} size={10} color="#FFFFFF" />
          </View>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text variant="callout" numberOfLines={1} style={{ fontSize: 14 }}>
          {card.name}
        </Text>
        <Text variant="code" color={color.textTertiary} numberOfLines={1}>
          {setLabel(card.setId, card.collectorNumber)}
        </Text>
      </View>
      {card.sparkline.length > 1 && <Sparkline values={card.sparkline} width={48} height={24} strokeWidth={2} stroke={up ? color.positive : color.negative} />}
      <View style={styles.rankPrice}>
        <Text style={styles.price}>{formatUsd(card.bestUsd ?? card.priceUsd)}</Text>
        <Change pct={card.deltaPct} />
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  change: { flexDirection: "row", alignItems: "center", gap: 2 },

  cover: { height: 200, borderRadius: 28, overflow: "hidden", backgroundColor: binder.cover },
  spine: { position: "absolute", left: 0, top: 0, bottom: 0, width: 26, alignItems: "center", justifyContent: "space-evenly", backgroundColor: "rgba(0,0,0,0.18)" },
  hole: { width: 10, height: 10, borderRadius: 5, backgroundColor: binder.coverDeep, borderWidth: 1.5, borderColor: binder.ring },
  pocketCards: { position: "absolute", top: 18, left: 26, right: 0, flexDirection: "row", justifyContent: "center", gap: 12 },
  pocketCard: {
    width: 78,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  emptySleeve: {
    aspectRatio: CARD_ASPECT,
    borderRadius: 6,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.25)",
  },
  pocket: {
    position: "absolute",
    left: 26,
    right: 0,
    bottom: 0,
    height: 104,
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: binder.cover,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
  },
  stitch: { position: "absolute", top: 7, left: 8, right: 8, borderTopWidth: 1.5, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.22)" },
  coverLabel: { letterSpacing: 1 },
  coverTitle: { fontFamily: font.heavy, fontSize: 22, letterSpacing: -0.5, color: "#FFFFFF" },
  coverRow: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: 6 },
  coverValue: { flex: 1, fontFamily: font.heavy, fontSize: 36, lineHeight: 42, letterSpacing: -1.2, color: "#FFFFFF", fontVariant: ["tabular-nums"] },
  goldButton: { flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 16, borderRadius: radius.pill },

  ticker: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(12,14,31,0.06)",
    overflow: "hidden",
  },
  live: { flexDirection: "row", alignItems: "center", gap: 6, height: "100%", paddingHorizontal: 14, backgroundColor: color.ink },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#FF4D6A" },
  tickerRun: { flexDirection: "row", alignItems: "center" },
  tickerItem: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 14 },
  tickerSep: { width: 4, height: 4, borderRadius: 2, backgroundColor: color.borderStrong, marginLeft: 8 },
  tickerFade: { position: "absolute", right: 0, top: 0, bottom: 0, width: 36 },

  spotlight: { flexDirection: "row", gap: space.lg, padding: 18, borderRadius: 26, backgroundColor: "#FFFFFF" },
  hand: { width: HAND_WIDTH + 26, height: HAND_WIDTH / CARD_ASPECT + 8, justifyContent: "center" },
  handCard: {
    position: "absolute",
    left: 0,
    width: HAND_WIDTH,
    shadowColor: "#0B0D1F",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  handBack: { opacity: 0.9 },
  spotInfo: { flex: 1, minWidth: 0, gap: 3 },
  spotKicker: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
  spotName: { fontFamily: font.heavy, fontSize: 19, lineHeight: 23, letterSpacing: -0.4, color: color.ink },
  spotPrice: { fontFamily: font.heavy, fontSize: 26, lineHeight: 32, letterSpacing: -0.9, color: color.ink, fontVariant: ["tabular-nums"], marginTop: 8 },
  viewButton: { alignSelf: "flex-start", height: 34, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: color.ink, justifyContent: "center", marginTop: "auto" },

  tabs: { flexDirection: "row", gap: 22 },
  tab: { paddingTop: 4, gap: 6 },
  tabText: { fontFamily: font.bold, fontSize: 16, letterSpacing: -0.3 },
  tabBar: { height: 3, borderRadius: 2 },
  tabBarOff: { height: 3 },

  rankRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rank: { width: 20, fontFamily: font.heavy, fontSize: 15, color: color.textTertiary, textAlign: "center", fontVariant: ["tabular-nums"] },
  rankThumb: { width: 38, shadowColor: "#0B0D1F", shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  rankPrice: { alignItems: "flex-end", minWidth: 72, gap: 2 },
  price: { fontFamily: font.bold, fontSize: 15, letterSpacing: -0.3, color: color.ink, fontVariant: ["tabular-nums"] },
  badge: { position: "absolute", top: -5, right: -6, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" },
});
