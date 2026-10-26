import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeOutDown, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { haptic } from "@/lib/haptics";
import { CARD_ASPECT, bubble, color, elevation, radius, rarity as rarityColor, space, type BubbleColor } from "@/design/tokens";
import { font } from "@/design/fonts";
import { formatUsd, setLabel } from "@/design/format";
import {
  addCollectionEvents,
  addWatchlistEntry,
  getCardDetail,
  getDeck,
  getPriceHistory,
  listDecks,
  updateDeckCards,
  listBinders,
  MAIN_BINDER,
  type Binder,
  type CardDetail,
  type Deck,
} from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { offerPushForAlerts } from "@/lib/push";
import { BINDER_LOOK } from "@/components/binder/BinderSheet";
import {
  Button,
  CardArt,
  EmptyState,
  FieldLabel,
  Floaty,
  FoilSweep,
  GlassFill,
  HoloBackdrop,
  HoloRing,
  IconButton,
  ListGroup,
  ListRow,
  Segmented,
  Sheet,
  Sparkline,
  Text,
  Touchable,
} from "@/ui";

type Finish = "nonfoil" | "foil" | "etched";
type AlertKind = "market" | "foil" | "etched";
type Market = "tcgplayer" | "cardmarket";

const FINISH_PRICE_LABEL: Record<Finish, string> = { nonfoil: "Normal", foil: "Foil", etched: "Etched" };
const FINISH_NAME: Record<Finish, string> = { nonfoil: "Non-foil", foil: "Foil", etched: "Etched" };
const KIND_TO_FINISH: Record<AlertKind, Finish> = { market: "nonfoil", foil: "foil", etched: "etched" };

/** A typed price, kept to digits and one decimal point. A comma counts as the
 * point: on European iPhones the decimal keypad only has a comma. */
function cleanAmount(t: string): string {
  const [whole, ...rest] = t.replace(/,/g, ".").replace(/[^0-9.]/g, "").split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
}

function lowestUsd(card: CardDetail, finish: Finish) {
  let best: { amount: number; store: string } | null = null;
  for (const store of card.storePricing) {
    for (const p of store.prices) {
      if (p.currency === "USD" && p.label === FINISH_PRICE_LABEL[finish] && (!best || p.amount < best.amount)) {
        best = { amount: p.amount, store: store.store };
      }
    }
  }
  return best;
}

function storePrice(card: CardDetail, market: Market, finish: Finish) {
  const currency = market === "cardmarket" ? "EUR" : "USD";
  return card.storePricing
    .find((s) => s.store.toLowerCase() === market)
    ?.prices.find((p) => p.label === FINISH_PRICE_LABEL[finish] && p.currency === currency)?.amount;
}

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const session = useAuthStore((s) => s.session);

  const [card, setCard] = useState<CardDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [finish, setFinish] = useState<Finish>("nonfoil");
  const [adding, setAdding] = useState(false);
  const [deckSheet, setDeckSheet] = useState(false);
  const [alertSheet, setAlertSheet] = useState(false);
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  // Fade in as the card's name scrolls up under the back button.
  const nameAt = Math.min(width * 0.52, 230) / CARD_ASPECT;
  const topBarStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [nameAt - 30, nameAt + 30], [0, 1], "clamp") }));
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [history, setHistory] = useState<Array<{ kind: string; amount: number }>>([]);

  useEffect(() => {
    getPriceHistory(id, 30)
      .then((r) => setHistory(r.points.filter((p) => p.value.currency === "USD").map((p) => ({ kind: p.kind, amount: p.value.amount }))))
      .catch(() => setHistory([]));
  }, [id]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const { card: c } = await getCardDetail(id);
      setCard(c);
      setFinish(c.variantId.endsWith("-foil") ? "foil" : "nonfoil");
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [id]);

  useEffect(() => {
    load();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [load]);

  const showToast = (message: string, ok = true) => {
    (ok ? haptic.success : haptic.error)();
    setToast({ message, ok });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const requireAccount = (action: () => void) => {
    if (session) action();
    else router.push("/(auth)/sign-in");
  };

  // With more than one binder, adding asks which one.
  const [binders, setBinders] = useState<Binder[]>([]);
  const [binderSheet, setBinderSheet] = useState(false);
  useEffect(() => {
    if (!session) return;
    listBinders({ stats: false })
      .then(({ binders: list }) => setBinders(list))
      .catch(() => {});
  }, [session]);

  const onAdd = () => (binders.length > 1 ? setBinderSheet(true) : addToCollection(MAIN_BINDER));

  const addToCollection = async (binderId: string) => {
    if (!card) return;
    setBinderSheet(false);
    setAdding(true);
    const where = binders.find((b) => b.id === binderId);
    try {
      await addCollectionEvents([
        {
          id: `${card.variantId}-${Date.now()}`,
          at: new Date().toISOString(),
          type: "add",
          variantId: card.variantId,
          payload: { quantity: 1, finish, ...(binderId !== MAIN_BINDER ? { binderId } : {}) },
        },
      ]);
      showToast(
        where?.kind === "wishlist"
          ? `Added to ${where.name}`
          : `Added ${FINISH_NAME[finish].toLowerCase()} copy to ${where && binderId !== MAIN_BINDER ? where.name : "collection"}`
      );
    } catch (e: unknown) {
      showToast((e as Error).message || "Couldn't add the card", false);
    } finally {
      setAdding(false);
    }
  };

  const artWidth = Math.min(width * 0.52, 230);

  if (status !== "ready" || !card) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <HoloBackdrop />
        <IconButton icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={styles.backStandalone} />
        {status === "loading" ? (
          <ActivityIndicator color={color.textSecondary} style={{ marginTop: space.xxxl * 3 }} />
        ) : (
          <EmptyState icon="cloud-offline-outline" title="Couldn't load this card" body="Check your connection and try again." action="Retry" onAction={load} />
        )}
      </View>
    );
  }

  const finishes = (["nonfoil", "foil", "etched"] as const).filter(
    (f) => f === finish || card.storePricing.some((s) => s.prices.some((p) => p.label === FINISH_PRICE_LABEL[f]))
  );
  const best = lowestUsd(card, finish);
  const kind = finish === "nonfoil" ? "market" : finish;
  const series = history.filter((p) => p.kind === kind).map((p) => p.amount);
  const change = series.length >= 2 && series[0] > 0 ? ((series[series.length - 1] - series[0]) / series[0]) * 100 : null;
  const rarityName = card.rarity ? card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1) : null;
  const typeAndSet = [card.typeLine, setLabel(card.setId, card.collectorNumber)].filter(Boolean).join(" · ");

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <HoloBackdrop height={480} />
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Hero: the card held up to the light */}
        <View style={[styles.hero, { paddingTop: insets.top + 64 }]}>
          <Floaty>
            <HoloRing radius={14} thickness={3} style={styles.heroShadow}>
              <View style={{ width: artWidth, borderRadius: 11, overflow: "hidden" }}>
                <CardArt uri={card.imageUri} name={card.name} foil={finish !== "nonfoil"} />
                <FoilSweep width={artWidth} />
              </View>
            </HoloRing>
          </Floaty>
        </View>

        <View style={[styles.sheet, { paddingBottom: insets.bottom + 120 }]}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>{card.name}</Text>
              {!!typeAndSet && (
                <Text variant="callout" color={color.textSecondary} style={{ marginTop: 2 }}>
                  {typeAndSet}
                </Text>
              )}
            </View>
            {rarityName && (
              <View style={[styles.rarityPill, { backgroundColor: `${rarityColor[card.rarity!] ?? color.textTertiary}22` }]}>
                <Text variant="number" color={rarityColor[card.rarity!] ?? color.textSecondary}>
                  {rarityName}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{best ? formatUsd(best.amount) : "—"}</Text>
            {change != null && (
              <View style={[styles.changePill, { backgroundColor: change >= 0 ? color.positiveSoft : color.negativeSoft }]}>
                <Ionicons name={change >= 0 ? "arrow-up" : "arrow-down"} size={12} color={change >= 0 ? color.positive : color.negative} />
                <Text variant="number" color={change >= 0 ? color.positive : color.negative}>
                  {Math.abs(change).toFixed(1)}% · 30d
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            <IconButton icon="notifications-outline" label="Set price alert" variant="surface" onPress={() => requireAccount(() => setAlertSheet(true))} />
          </View>
          <Text variant="caption" color={color.textTertiary}>
            {best ? `Lowest ${FINISH_NAME[finish].toLowerCase()} · ${best.store}` : "No USD price yet"}
          </Text>

          {series.length >= 2 && (
            <View style={{ marginTop: space.md }}>
              <Sparkline values={series} width={width - space.xl * 2} height={72} />
            </View>
          )}

          {finishes.length > 1 && (
            <View style={{ marginTop: space.lg }}>
              <Segmented options={finishes.map((f) => ({ value: f, label: FINISH_NAME[f] }))} value={finish} onChange={setFinish} />
            </View>
          )}

          <Text style={styles.sectionTitle}>Prices by store</Text>
          {card.storePricing.length === 0 ? (
            <Text variant="callout" color={color.textTertiary}>
              No store prices yet.
            </Text>
          ) : (
            <View>
              {card.storePricing.map((store, i) => (
                <StoreRow key={store.store} store={store} tint={STORE_TINTS[i % STORE_TINTS.length]} />
              ))}
            </View>
          )}

          {card.oracleText && (
            <>
              <Text style={styles.sectionTitle}>Card text</Text>
              <View style={styles.oracle}>
                <Text variant="body" style={{ lineHeight: 23 }}>
                  {card.oracleText}
                </Text>
              </View>
            </>
          )}
        </View>
      </Animated.ScrollView>

      {/* Once the art scrolls away, a frosted bar fades in behind the back button so it never sits on top of content. */}
      <Animated.View style={[styles.topBar, { height: insets.top + 60 }, topBarStyle]} pointerEvents="none">
        <GlassFill strong />
        <Text variant="headline" numberOfLines={1} style={[styles.topBarTitle, { top: insets.top + 19 }]}>
          {card.name}
        </Text>
      </Animated.View>
      <View style={[styles.floatingBar, { top: insets.top + space.sm }]} pointerEvents="box-none">
        <IconButton icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      </View>

      <View style={[styles.actionBar, { bottom: Math.max(insets.bottom, space.lg) }]}>
        <View style={[StyleSheet.absoluteFill, { borderRadius: 36, overflow: "hidden" }]}>
          <GlassFill strong />
        </View>
        <Button label="Add to collection" icon="add" size="lg" onPress={() => requireAccount(onAdd)} loading={adding} style={{ flex: 1 }} />
        <Touchable onPress={() => requireAccount(() => setDeckSheet(true))} accessibilityRole="button" accessibilityLabel="Add to a deck" pressedScale={0.94}>
          <HoloRing radius={29} thickness={2}>
            <View style={styles.deckButton}>
              <Ionicons name="layers" size={18} color={color.ink} />
              <Text variant="bodyStrong" style={{ fontFamily: font.heavy }}>
                Deck
              </Text>
            </View>
          </HoloRing>
        </Touchable>
      </View>

      <Sheet visible={binderSheet} onClose={() => setBinderSheet(false)} title="Add to…" subtitle={`${FINISH_NAME[finish]} ${card.name}`}>
        <ListGroup>
          {binders.map((b) => {
            const look = BINDER_LOOK[b.kind] ?? BINDER_LOOK.custom;
            return <ListRow key={b.id} icon={look.icon} tint={look.tint} title={b.name} onPress={() => addToCollection(b.id)} />;
          })}
        </ListGroup>
      </Sheet>

      {toast && (
        <Animated.View entering={FadeInDown} exiting={FadeOutDown} style={[styles.toast, { bottom: insets.bottom + 110 }]}>
          <Ionicons name={toast.ok ? "checkmark-circle" : "alert-circle"} size={18} color={toast.ok ? color.positive : color.negative} />
          <Text variant="callout">{toast.message}</Text>
        </Animated.View>
      )}

      <DeckPickerSheet
        visible={deckSheet}
        card={card}
        onClose={() => setDeckSheet(false)}
        onAdded={(deck) => {
          setDeckSheet(false);
          showToast(`Added to ${deck.name}`);
        }}
      />
      <PriceAlertSheet
        visible={alertSheet}
        card={card}
        defaultFinish={finish}
        onClose={() => setAlertSheet(false)}
        onSaved={() => {
          setAlertSheet(false);
          showToast("Price alert set");
          // Let the sheet finish closing before the system prompt.
          setTimeout(offerPushForAlerts, 600);
        }}
      />
    </View>
  );
}

const STORE_TINTS: BubbleColor[] = ["blue", "violet", "green", "orange", "pink"];

function StoreRow({ store, tint }: { store: CardDetail["storePricing"][number]; tint: BubbleColor }) {
  const summary = store.prices
    .map((p) => `${p.label} ${p.currency === "EUR" ? "€" : "$"}${p.amount.toFixed(2)}`)
    .join("  ·  ");
  const content = (
    <View style={styles.storeRow}>
      <LinearGradient colors={bubble[tint]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.monogram}>
        <Text variant="callout" color="#FFFFFF" style={{ fontFamily: font.heavy }}>
          {store.store.slice(0, 1).toUpperCase()}
        </Text>
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{store.store}</Text>
        <Text variant="number" color={color.textSecondary} style={{ marginTop: 3, fontSize: 12 }}>
          {summary || "No price data"}
        </Text>
      </View>
      {store.buyUrl && <Ionicons name="open-outline" size={18} color={color.textTertiary} />}
    </View>
  );
  return store.buyUrl ? (
    <Touchable onPress={() => Linking.openURL(store.buyUrl!)} pressedScale={0.99} accessibilityRole="link" accessibilityLabel={`Buy on ${store.store}`}>
      {content}
    </Touchable>
  ) : (
    content
  );
}

function DeckPickerSheet({
  visible,
  card,
  onClose,
  onAdded,
}: {
  visible: boolean;
  card: CardDetail;
  onClose: () => void;
  onAdded: (deck: Deck) => void;
}) {
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDecks(null);
    setError(null);
    listDecks()
      .then(({ decks: d }) => setDecks(d))
      .catch(() => setError("Couldn't load your decks."));
  }, [visible]);

  const add = async (deck: Deck) => {
    setSavingId(deck.id);
    try {
      const { deck: full } = await getDeck(deck.id);
      const existing = full.cards.map((c) => ({
        cardName: c.cardName,
        variantId: c.variantId ?? undefined,
        quantity: c.quantity,
        section: c.section,
      }));
      const updated = existing.some((c) => c.cardName === card.name)
        ? existing.map((c) => (c.cardName === card.name ? { ...c, quantity: c.quantity + 1 } : c))
        : [...existing, { cardName: card.name, variantId: card.variantId, quantity: 1, section: "mainboard" }];
      await updateDeckCards(deck.id, updated);
      onAdded(deck);
    } catch (e: unknown) {
      setError((e as Error).message || "Couldn't add the card.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Add to deck" subtitle={card.name}>
      {error && (
        <Text variant="callout" color={color.negative}>
          {error}
        </Text>
      )}
      {decks === null && !error ? (
        <ActivityIndicator color={color.textSecondary} style={{ marginVertical: space.xl }} />
      ) : decks && decks.length === 0 ? (
        <Text variant="body" color={color.textSecondary}>
          You don't have any decks yet. Create one from the Decks tab.
        </Text>
      ) : (
        <ScrollView style={{ maxHeight: 360 }}>
          <ListGroup>
            {(decks ?? []).map((deck) => (
              <ListRow
                key={deck.id}
                icon="layers"
                title={deck.name}
                subtitle={deck.commander ?? deck.format}
                value={savingId === deck.id ? "Adding…" : undefined}
                onPress={() => add(deck)}
              />
            ))}
          </ListGroup>
        </ScrollView>
      )}
    </Sheet>
  );
}

function PriceAlertSheet({
  visible,
  card,
  defaultFinish,
  onClose,
  onSaved,
}: {
  visible: boolean;
  card: CardDetail;
  defaultFinish: Finish;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [market, setMarket] = useState<Market>("tcgplayer");
  const [kind, setKind] = useState<AlertKind>("market");
  const [direction, setDirection] = useState<"below" | "above">("below");
  const [threshold, setThreshold] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill with the current price whenever the sheet opens or the target changes.
  useEffect(() => {
    if (!visible) return;
    const current = storePrice(card, market, KIND_TO_FINISH[kind]);
    setThreshold(current != null ? current.toFixed(2) : "");
  }, [visible, card, market, kind]);

  useEffect(() => {
    if (visible) {
      setKind(defaultFinish === "nonfoil" ? "market" : defaultFinish);
      setError(null);
    }
  }, [visible, defaultFinish]);

  const currency = market === "cardmarket" ? "EUR" : "USD";

  const save = async () => {
    const amount = parseFloat(threshold);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a target price above zero.");
      return;
    }
    setSaving(true);
    try {
      await addWatchlistEntry({ variantId: card.variantId, market, kind, currency, thresholdAmount: amount, direction });
      onSaved();
    } catch (e: unknown) {
      setError((e as Error).message || "Couldn't save the alert.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Price alert" subtitle={card.name}>
      <FieldLabel>Market</FieldLabel>
      <Segmented
        options={[
          { value: "tcgplayer", label: "TCGplayer" },
          { value: "cardmarket", label: "Cardmarket" },
        ]}
        value={market}
        onChange={setMarket}
      />
      <FieldLabel>Finish</FieldLabel>
      <Segmented
        options={[
          { value: "market", label: "Non-foil" },
          { value: "foil", label: "Foil" },
          { value: "etched", label: "Etched" },
        ]}
        value={kind}
        onChange={setKind}
      />
      <FieldLabel>Notify me when the price goes</FieldLabel>
      <View style={styles.alertRow}>
        <View style={{ flex: 1 }}>
          <Segmented
            options={[
              { value: "below", label: "Below" },
              { value: "above", label: "Above" },
            ]}
            value={direction}
            onChange={setDirection}
          />
        </View>
        <View style={styles.amountField}>
          <Text variant="bodyStrong" color={color.textSecondary}>
            {currency === "EUR" ? "€" : "$"}
          </Text>
          <TextInput
            value={threshold}
            onChangeText={(t) => {
              setThreshold(cleanAmount(t));
              setError(null);
            }}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={color.textTertiary}
            selectionColor={color.accent}
            style={styles.amountInput}
            accessibilityLabel="Target price"
          />
        </View>
      </View>
      {error && (
        <Text variant="callout" color={color.negative}>
          {error}
        </Text>
      )}
      <Button label="Save alert" size="lg" onPress={save} loading={saving} disabled={!threshold} style={{ marginTop: space.sm }} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  backStandalone: { marginLeft: space.lg, marginTop: space.sm },
  hero: { alignItems: "center", paddingBottom: space.xxxl },
  heroShadow: {
    shadowColor: "#46329C",
    shadowOpacity: 0.35,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 22 },
    elevation: 18,
  },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.xl,
    paddingTop: space.xxl,
    flexGrow: 1,
    ...elevation.card,
  },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  cardName: { fontFamily: font.heavy, fontSize: 26, lineHeight: 32, letterSpacing: -0.8, color: color.ink },
  rarityPill: { paddingHorizontal: 10, height: 26, borderRadius: 9, justifyContent: "center", marginTop: 4 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.lg },
  price: { fontFamily: font.heavy, fontSize: 40, lineHeight: 46, letterSpacing: -1.5, color: color.ink, fontVariant: ["tabular-nums"] },
  changePill: { flexDirection: "row", alignItems: "center", gap: 3, height: 26, paddingHorizontal: 9, borderRadius: 13 },
  sectionTitle: { fontFamily: font.heavy, fontSize: 18, letterSpacing: -0.4, color: color.ink, marginTop: space.xxl, marginBottom: space.sm },
  oracle: { padding: space.lg, borderRadius: radius.lg, backgroundColor: color.surface2 },
  storeRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  monogram: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  alertRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  amountField: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    width: 120,
    height: 42,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.surface2,
  },
  amountInput: { flex: 1, color: color.text, fontSize: 17, fontFamily: font.bold, fontVariant: ["tabular-nums"] },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderStrong },
  topBarTitle: { position: "absolute", left: 72, right: 72, textAlign: "center" },
  floatingBar: { position: "absolute", left: space.lg, right: space.lg, flexDirection: "row", justifyContent: "space-between" },
  actionBar: {
    position: "absolute",
    left: space.md,
    right: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.sm,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.95)",
    ...elevation.floating,
  },
  deckButton: { flexDirection: "row", alignItems: "center", gap: 6, height: 54, paddingHorizontal: 18, borderRadius: 27, backgroundColor: color.surface },
  toast: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    ...elevation.floating,
  },
});
