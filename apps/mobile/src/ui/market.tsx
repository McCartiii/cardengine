// Marketplace pieces for Home: the dark featured-card carousel, listing cards
// with deal badges, and art banners.
import React, { useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { CARD_ASPECT, cardRadius, color, elevation, hairline, radius, space } from "../design/tokens";
import { font } from "../design/fonts";
import { formatDeltaPct, formatUsd, setLabel } from "../design/format";
import type { MarketCard } from "../lib/api";
import { Text, Touchable } from "./primitives";
import { CardArt } from "./cards";
import { Floaty, FoilSweep, Tilt } from "./holo";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** A short label for cards whose price is moving fast, or null. */
export function dealBadge(deltaPct: number | null | undefined): { label: string; icon: IconName; bg: string } | null {
  if (deltaPct == null || !Number.isFinite(deltaPct)) return null;
  if (deltaPct >= 8) return { label: "Hot", icon: "flame", bg: "#FF5A1F" };
  if (deltaPct <= -8) return { label: "Price drop", icon: "pricetag", bg: color.positive };
  return null;
}

function DeltaPill({ pct, onDark }: { pct: number | null | undefined; onDark?: boolean }) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const up = pct >= 0;
  const fg = up ? (onDark ? "#5CF2A6" : color.positive) : onDark ? "#FF8A9A" : color.negative;
  const bg = onDark ? (up ? "rgba(92,242,166,0.14)" : "rgba(255,138,154,0.14)") : up ? color.positiveSoft : color.negativeSoft;
  return (
    <View style={[styles.deltaPill, { backgroundColor: bg }]}>
      <Ionicons name={up ? "trending-up" : "trending-down"} size={12} color={fg} />
      <Text variant="number" color={fg}>
        {formatDeltaPct(pct).replace(/^\+/, "")}
      </Text>
    </View>
  );
}

const HERO_HEIGHT = 212;
const HERO_GAP = 12;

/** Paging carousel of featured cards on a dark backdrop made from their own art. */
export function HeroCarousel({ cards, onOpen }: { cards: MarketCard[]; onOpen: (variantId: string) => void }) {
  const { width } = useWindowDimensions();
  const slideWidth = width - space.lg * 2;
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList<MarketCard>>(null);
  const touching = useRef(false);

  useEffect(() => {
    if (cards.length < 2) return;
    const id = setInterval(() => {
      if (touching.current) return;
      setIndex((i) => {
        const next = (i + 1) % cards.length;
        list.current?.scrollToOffset({ offset: next * (slideWidth + HERO_GAP), animated: true });
        return next;
      });
    }, 5000);
    return () => clearInterval(id);
  }, [cards.length, slideWidth]);

  return (
    <View>
      <FlatList
        ref={list}
        horizontal
        data={cards}
        keyExtractor={(c) => c.variantId}
        showsHorizontalScrollIndicator={false}
        snapToInterval={slideWidth + HERO_GAP}
        decelerationRate="fast"
        // Room below the slides so their shadow isn't clipped by the list.
        style={{ marginBottom: -24 }}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 24, gap: HERO_GAP }}
        onScrollBeginDrag={() => (touching.current = true)}
        onMomentumScrollEnd={(e) => {
          touching.current = false;
          setIndex(Math.round(e.nativeEvent.contentOffset.x / (slideWidth + HERO_GAP)));
        }}
        renderItem={({ item, index: i }) => <HeroSlide card={item} rank={i + 1} width={slideWidth} onPress={() => onOpen(item.variantId)} />}
      />
      {cards.length > 1 && (
        <View style={styles.dots}>
          {cards.map((c, i) => (
            <View key={c.variantId} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

function HeroSlide({ card, rank, width, onPress }: { card: MarketCard; rank: number; width: number; onPress: () => void }) {
  const artWidth = 108;
  const price = card.bestUsd ?? card.priceUsd;
  return (
    <Touchable onPress={onPress} pressedScale={0.985} accessibilityRole="button" accessibilityLabel={`${card.name}, ${formatUsd(price)}`}>
      <View style={[styles.hero, { width }]}>
        {card.imageUri && <Image source={{ uri: card.imageUri }} blurRadius={36} contentFit="cover" style={styles.heroBlur} />}
        <LinearGradient colors={["rgba(9,10,22,0.94)", "rgba(9,10,22,0.78)", "rgba(9,10,22,0.35)"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0)"]} style={styles.heroGloss} />
        <View style={styles.heroCopy}>
          <View style={styles.rankPill}>
            <Text variant="number" color="#FFFFFF">
              #{rank}
            </Text>
            <View style={styles.rankDivider} />
            <Text variant="number" color="rgba(255,255,255,0.85)">
              {rank === 1 ? "Top value" : (card.deltaPct ?? 0) >= 8 ? "Heating up" : "Featured"}
            </Text>
          </View>
          <View style={{ gap: 4 }}>
            <Text numberOfLines={2} style={styles.heroName}>
              {card.name}
            </Text>
            <Text variant="code" color="rgba(255,255,255,0.6)">
              {setLabel(card.setId, card.collectorNumber)}
              {card.rarity ? ` · ${card.rarity}` : ""}
            </Text>
          </View>
          <View style={styles.heroPriceRow}>
            <Text style={styles.heroPrice}>{formatUsd(price)}</Text>
            <DeltaPill pct={card.deltaPct} onDark />
          </View>
        </View>
        <Floaty style={[styles.heroArt, { width: artWidth }]}>
          <View style={{ borderRadius: cardRadius(artWidth), overflow: "hidden" }}>
            <CardArt uri={card.imageUri} name={card.name} />
            <FoilSweep width={artWidth} delay={rank * 300} strength={0.4} />
          </View>
        </Floaty>
      </View>
    </Touchable>
  );
}

/** Two-column listing card: the card on a soft stage, then name, set and price. */
export function ListingCard({ card, onPress, style }: { card: MarketCard; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const badge = dealBadge(card.deltaPct);
  const price = card.bestUsd ?? card.priceUsd;
  return (
    <Tilt onPress={onPress} accessibilityRole="button" accessibilityLabel={`${card.name}, ${formatUsd(price)}`} style={[styles.listing, style]}>
      <View style={styles.stage}>
        <View style={styles.stageCard}>
          <CardArt uri={card.imageUri} name={card.name} />
        </View>
        {badge && (
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Ionicons name={badge.icon} size={11} color="#FFFFFF" />
            <Text variant="number" color="#FFFFFF" style={{ fontSize: 11 }}>
              {badge.label}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.listingMeta}>
        <Text variant="callout" numberOfLines={1} style={{ fontSize: 14 }}>
          {card.name}
        </Text>
        <Text variant="code" color={color.textTertiary} numberOfLines={1}>
          {setLabel(card.setId, card.collectorNumber)}
        </Text>
        <View style={styles.listingPriceRow}>
          <Text style={styles.listingPrice}>{formatUsd(price)}</Text>
          <DeltaPill pct={card.deltaPct} />
        </View>
      </View>
    </Tilt>
  );
}

/** Wide art banner with a call to action, fanned card art on the right. */
export function PromoBanner({
  title,
  body,
  action,
  colors,
  art,
  onPress,
}: {
  title: string;
  body: string;
  action: string;
  colors: readonly [string, string, ...string[]];
  art: Array<{ uri: string | null; name: string }>;
  onPress: () => void;
}) {
  const fan = [
    { rotate: "-14deg", x: -30, y: 10 },
    { rotate: "12deg", x: 30, y: 6 },
    { rotate: "0deg", x: 0, y: 0 },
  ];
  return (
    <Touchable onPress={onPress} pressedScale={0.985} accessibilityRole="button" accessibilityLabel={title}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
        <View style={[styles.bannerOrb, { right: -40, top: -60 }]} />
        <View style={[styles.bannerOrb, { right: 70, bottom: -90, opacity: 0.5 }]} />
        <View style={{ flex: 1, gap: 6, zIndex: 1 }}>
          <Text style={styles.bannerTitle}>{title}</Text>
          <Text variant="callout" color="rgba(255,255,255,0.82)" style={{ fontFamily: font.medium }}>
            {body}
          </Text>
          <View style={styles.bannerButton}>
            <Text variant="callout" color={color.ink}>
              {action}
            </Text>
            <Ionicons name="arrow-forward" size={14} color={color.ink} />
          </View>
        </View>
        <View style={styles.bannerFan} pointerEvents="none">
          {art.slice(0, 3).map((a, i) => (
            <View key={i} style={[styles.bannerCard, { transform: [{ translateX: fan[i].x }, { translateY: fan[i].y }, { rotate: fan[i].rotate }] }]}>
              <CardArt uri={a.uri} name={a.name} />
            </View>
          ))}
        </View>
      </LinearGradient>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  hero: { height: HERO_HEIGHT, borderRadius: 26, overflow: "hidden", backgroundColor: "#0D0E1C", flexDirection: "row", ...elevation.floating },
  heroBlur: { position: "absolute", top: -40, bottom: -40, left: -40, right: -40, opacity: 0.9 },
  heroGloss: { position: "absolute", top: 0, left: 0, right: 0, height: 70 },
  heroCopy: { flex: 1, padding: 18, justifyContent: "space-between" },
  heroArt: { alignSelf: "center", marginRight: 22, shadowColor: "#000", shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  rankPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  rankDivider: { width: 1, height: 12, backgroundColor: "rgba(255,255,255,0.3)" },
  heroName: { fontFamily: font.heavy, fontSize: 21, lineHeight: 26, letterSpacing: -0.5, color: "#FFFFFF" },
  heroPriceRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  heroPrice: { fontFamily: font.heavy, fontSize: 28, lineHeight: 34, letterSpacing: -1, color: "#FFFFFF", fontVariant: ["tabular-nums"] },
  deltaPill: { flexDirection: "row", alignItems: "center", gap: 3, height: 24, paddingHorizontal: 8, borderRadius: 12 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(18,20,43,0.18)" },
  dotActive: { width: 20, backgroundColor: color.ink },
  listing: { backgroundColor: color.surface, borderRadius: 20, padding: 8, ...hairline, ...elevation.card },
  stage: { borderRadius: 14, backgroundColor: color.surface2, paddingVertical: 16, alignItems: "center" },
  stageCard: {
    width: "64%",
    shadowColor: "#0B0D1F",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
  },
  listingMeta: { paddingHorizontal: 6, paddingTop: 10, paddingBottom: 4, gap: 2 },
  listingPriceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  listingPrice: { fontFamily: font.heavy, fontSize: 17, letterSpacing: -0.5, color: color.ink, fontVariant: ["tabular-nums"] },
  banner: { flexDirection: "row", alignItems: "center", minHeight: 140, borderRadius: 24, padding: 20, overflow: "hidden" },
  bannerOrb: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(255,255,255,0.12)" },
  bannerTitle: { fontFamily: font.heavy, fontSize: 21, lineHeight: 26, letterSpacing: -0.5, color: "#FFFFFF" },
  bannerButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: "#FFFFFF",
    marginTop: 8,
  },
  bannerFan: { width: 120, height: 110, alignItems: "center", justifyContent: "center" },
  bannerCard: {
    position: "absolute",
    width: 62,
    aspectRatio: CARD_ASPECT,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
