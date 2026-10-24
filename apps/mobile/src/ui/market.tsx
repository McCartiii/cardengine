// Home pieces: the flip-through binder hero, the live price ticker, the spotlight
// stack and ranked market rows.
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { Easing, FadeIn, SlideInRight, useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from "react-native-reanimated";
import { CARD_ASPECT, cardRadius, color, holo, radius, space } from "../design/tokens";
import { font } from "../design/fonts";
import { formatDeltaPct, formatUsd, setLabel } from "../design/format";
import type { MarketCard } from "../lib/api";
import { Text, Touchable, tap } from "./primitives";
import { CardArt } from "./cards";
import { CountUp, FoilSweep, HoloRing, Sparkline } from "./holo";
import { FlipBook, PageStack, PunchHoles } from "./flipbook";

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

// ── Binder ───────────────────────────────────────────────────────────────────

export interface BinderCard {
  id: string;
  uri: string | null;
  name: string;
  price: number | null;
}

interface BinderCoverProps {
  cards: BinderCard[];
  value: number | null;
  count: number;
  signedIn: boolean;
  onOpen: () => void;
  onCard: (id: string) => void;
  onEmpty: () => void;
}

const POCKETS = 8;
const COLUMNS = 4;
const POCKET_GAP = 8;
const ROW_GAP = 8;
const PAGE_PAD = 10;
// The binding edge of the page, where the holes are punched.
const BINDING = 22;
const PAGE_RADIUS = 22;
// Punched holes show the desk under the page.
const HOLE = "#E3E7EF";

/** Home's hero: an open binder whose pages you can turn, on its indigo cover. */
export function BinderCover({ cards, value, count, signedIn, onOpen, onCard, onEmpty }: BinderCoverProps) {
  const [pageWidth, setPageWidth] = useState(0);
  const [page, setPage] = useState(0);
  const pocketWidth = pageWidth ? Math.floor((pageWidth - BINDING - PAGE_PAD - POCKET_GAP * (COLUMNS - 1)) / COLUMNS) : 0;

  const pages = useMemo(() => {
    const slots: Array<BinderCard | null> = [...cards];
    while (slots.length === 0 || slots.length % POCKETS) slots.push(null);
    const out: Array<Array<BinderCard | null>> = [];
    for (let i = 0; i < slots.length; i += POCKETS) out.push(slots.slice(i, i + POCKETS));
    return out;
  }, [cards]);

  const renderPage = (i: number) => (
    <View style={styles.page}>
      <PunchHoles color={HOLE} />
      <View style={styles.pockets}>
        {pages[i].map((c, j) =>
          c ? (
            <Pocket key={c.id} card={c} width={pocketWidth} onPress={() => onCard(c.id)} />
          ) : (
            <Touchable key={`empty-${j}`} onPress={onEmpty} pressedScale={0.95} accessibilityRole="button" accessibilityLabel="Add a card">
              <View style={{ width: pocketWidth }}>
                <View style={[styles.emptyPocket, { height: pocketWidth / CARD_ASPECT, borderRadius: cardRadius(pocketWidth) + 2 }]}>
                  <Ionicons name="add" size={18} color={color.textTertiary} />
                </View>
              </View>
            </Touchable>
          )
        )}
      </View>
    </View>
  );

  return (
    <View>
      <View style={styles.coverHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="callout" color={color.textSecondary}>
            {signedIn ? `My binder · ${count} cards` : "Your binder"}
          </Text>
          {signedIn ? (
            <CountUp value={value ?? 0} format={(n) => formatUsd(n)} style={styles.coverValue} numberOfLines={1} adjustsFontSizeToFit />
          ) : (
            <Text style={styles.coverValue}>Start collecting</Text>
          )}
        </View>
        <Touchable onPress={onOpen} pressedScale={0.94} accessibilityRole="button" accessibilityLabel={signedIn ? "Open binder" : "Sign in"} style={styles.openButton}>
          <Text variant="callout" color="#FFFFFF">
            {signedIn ? "Open" : "Sign in"}
          </Text>
          <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
        </Touchable>
      </View>

      <View onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)}>
        {pocketWidth > 0 && (
          <PageStack radius={PAGE_RADIUS}>
            <FlipBook key={pages.length} pageCount={pages.length} renderPage={renderPage} onIndexChange={setPage} pageStyle={styles.pageRadius} />
          </PageStack>
        )}
      </View>

      {pages.length > 1 && (
        <View style={styles.pageDots} accessibilityElementsHidden>
          {pages.map((_, i) => (
            <View key={i} style={[styles.pageDot, i === page && styles.pageDotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

function Pocket({ card, width, onPress }: { card: BinderCard; width: number; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} pressedScale={0.95} accessibilityRole="button" accessibilityLabel={`${card.name}, ${formatUsd(card.price)}`} style={{ width }}>
      <View style={styles.pocketCard}>
        <CardArt uri={card.uri} name={card.name} />
      </View>
      {card.price != null && (
        <View style={styles.priceRow} pointerEvents="none">
          <View style={styles.priceChip}>
            <Text variant="number" color={color.ink} style={{ fontSize: 10 }}>
              {formatUsd(card.price, { compact: true })}
            </Text>
          </View>
        </View>
      )}
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

  coverHead: { flexDirection: "row", alignItems: "flex-end", gap: space.md, paddingHorizontal: 4, paddingBottom: 12 },
  coverValue: { fontFamily: font.heavy, fontSize: 30, lineHeight: 36, letterSpacing: -1, color: color.ink, fontVariant: ["tabular-nums"] },
  openButton: { flexDirection: "row", alignItems: "center", gap: 2, height: 36, paddingLeft: 16, paddingRight: 12, borderRadius: radius.pill, backgroundColor: color.ink, marginBottom: 2 },
  pageRadius: { borderRadius: PAGE_RADIUS },
  page: { borderRadius: PAGE_RADIUS, backgroundColor: "#FFFFFF", paddingTop: PAGE_PAD + 2, paddingBottom: PAGE_PAD + 2, paddingLeft: BINDING, paddingRight: PAGE_PAD },
  pockets: { flexDirection: "row", flexWrap: "wrap", columnGap: POCKET_GAP, rowGap: ROW_GAP },
  pocketCard: {
    shadowColor: "#1B2240",
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  priceRow: { position: "absolute", left: 0, right: 0, bottom: 5, alignItems: "center" },
  priceChip: {
    height: 18,
    paddingHorizontal: 7,
    borderRadius: 9,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    shadowColor: "#1B2240",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  emptyPocket: { backgroundColor: "#F3F4F8", alignItems: "center", justifyContent: "center" },
  pageDots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 10 },
  pageDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(18,20,43,0.16)" },
  pageDotOn: { width: 16, backgroundColor: color.ink },

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
