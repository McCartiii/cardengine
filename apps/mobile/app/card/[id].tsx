import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { color, radius, rarity as rarityColor, space } from "@/design/tokens";
import { formatUsd, setLabel } from "@/design/format";
import {
  addCollectionEvents,
  addWatchlistEntry,
  getCardDetail,
  getDeck,
  listDecks,
  updateDeckCards,
  type CardDetail,
  type Deck,
} from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import {
  Button,
  CardArt,
  EmptyState,
  FieldLabel,
  IconButton,
  ListGroup,
  ListRow,
  Segmented,
  Sheet,
  Text,
  Touchable,
} from "@/ui";

type Finish = "nonfoil" | "foil" | "etched";
type AlertKind = "market" | "foil" | "etched";
type Market = "tcgplayer" | "cardmarket";

const FINISH_PRICE_LABEL: Record<Finish, string> = { nonfoil: "Normal", foil: "Foil", etched: "Etched" };
const FINISH_NAME: Record<Finish, string> = { nonfoil: "Non-foil", foil: "Foil", etched: "Etched" };
const KIND_TO_FINISH: Record<AlertKind, Finish> = { market: "nonfoil", foil: "foil", etched: "etched" };

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
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
    setToast({ message, ok });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const requireAccount = (action: () => void) => {
    if (session) action();
    else router.push("/(auth)/sign-in");
  };

  const addToCollection = async () => {
    if (!card) return;
    setAdding(true);
    try {
      await addCollectionEvents([
        {
          id: `${card.variantId}-${Date.now()}`,
          at: new Date().toISOString(),
          type: "add",
          variantId: card.variantId,
          payload: { quantity: 1, finish },
        },
      ]);
      showToast(`Added ${FINISH_NAME[finish].toLowerCase()} copy to collection`);
    } catch (e: unknown) {
      showToast((e as Error).message || "Couldn't add the card", false);
    } finally {
      setAdding(false);
    }
  };

  const artWidth = Math.min(width * 0.62, 280);

  if (status !== "ready" || !card) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} style={styles.backStandalone} />
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
  const identity = card.colorIdentity ?? card.colors ?? [];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl * 2 }} showsVerticalScrollIndicator={false}>
        {/* Hero: the card on a blurred wash of its own art */}
        <View style={[styles.hero, { paddingTop: insets.top + space.xxxl + space.lg }]}>
          {card.imageUri && (
            <Image source={{ uri: card.imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} />
          )}
          <LinearGradient colors={["rgba(9,9,11,0.35)", color.bg]} locations={[0, 0.92]} style={StyleSheet.absoluteFill} />
          <View style={styles.heroShadow}>
            <CardArt uri={card.imageUri} name={card.name} style={{ width: artWidth }} rounded={radius.md} />
          </View>
        </View>

        <View style={styles.body}>
          <View>
            <Text variant="title">{card.name}</Text>
            {card.typeLine && (
              <Text variant="body" color={color.textSecondary} style={{ marginTop: 2 }}>
                {card.typeLine}
              </Text>
            )}
          </View>
          <View style={styles.metaRow}>
            {card.rarity && (
              <View style={styles.metaItem}>
                <View style={[styles.dot, { backgroundColor: rarityColor[card.rarity] ?? color.textTertiary }]} />
                <Text variant="caption" color={color.textSecondary}>
                  {card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1)}
                </Text>
              </View>
            )}
            {card.setId && (
              <Text variant="caption" color={color.textSecondary}>
                {setLabel(card.setId, card.collectorNumber)}
              </Text>
            )}
            {card.manaCost && (
              <Text variant="caption" color={color.textSecondary}>
                {card.manaCost}
              </Text>
            )}
            {identity.length > 0 && (
              <Text variant="caption" color={color.textSecondary}>
                {identity.join("")}
              </Text>
            )}
          </View>

          {/* Price */}
          <View style={styles.priceCard}>
            <View style={{ flex: 1 }}>
              <Text variant="label" color={color.textTertiary}>
                {FINISH_NAME[finish]} · lowest
              </Text>
              <Text variant="priceLarge" style={{ marginTop: space.xs }}>
                {best ? formatUsd(best.amount) : "—"}
              </Text>
              <Text variant="caption" color={color.textTertiary}>
                {best ? `on ${best.store}` : "No USD price yet"}
              </Text>
            </View>
            <IconButton
              icon="notifications-outline"
              label="Set price alert"
              onPress={() => requireAccount(() => setAlertSheet(true))}
            />
          </View>

          {finishes.length > 1 && (
            <Segmented options={finishes.map((f) => ({ value: f, label: FINISH_NAME[f] }))} value={finish} onChange={setFinish} />
          )}

          <View style={styles.actions}>
            <Button
              label="Collection"
              icon="add"
              onPress={() => requireAccount(addToCollection)}
              loading={adding}
              style={{ flex: 1 }}
            />
            <Button label="Deck" icon="add" variant="secondary" onPress={() => requireAccount(() => setDeckSheet(true))} style={{ flex: 1 }} />
          </View>

          {card.oracleText && (
            <View style={styles.oracle}>
              <Text variant="body" style={{ lineHeight: 23 }}>
                {card.oracleText}
              </Text>
            </View>
          )}

          <Text variant="label" color={color.textTertiary} style={styles.sectionLabel}>
            Prices by store
          </Text>
          {card.storePricing.length === 0 ? (
            <Text variant="callout" color={color.textTertiary}>
              No store prices yet.
            </Text>
          ) : (
            <ListGroup>
              {card.storePricing.map((store) => (
                <StoreRow key={store.store} store={store} />
              ))}
            </ListGroup>
          )}
        </View>
      </ScrollView>

      <View style={[styles.floatingBar, { top: insets.top + space.sm }]} pointerEvents="box-none">
        <IconButton icon="chevron-back" label="Back" variant="overlay" onPress={() => router.back()} />
      </View>

      {toast && (
        <Animated.View entering={FadeInDown} exiting={FadeOutDown} style={[styles.toast, { bottom: insets.bottom + space.xl }]}>
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
        }}
      />
    </View>
  );
}

function StoreRow({ store }: { store: CardDetail["storePricing"][number] }) {
  const summary = store.prices
    .map((p) => `${p.label} ${p.currency === "EUR" ? "€" : "$"}${p.amount.toFixed(2)}`)
    .join("  ·  ");
  const content = (
    <View style={styles.storeRow}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{store.store}</Text>
        <Text variant="callout" color={color.textSecondary} style={{ marginTop: 2, fontVariant: ["tabular-nums"] }}>
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
              setThreshold(t.replace(/[^0-9.]/g, ""));
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
  hero: { alignItems: "center", paddingBottom: space.xxl, overflow: "hidden" },
  heroShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 16,
  },
  body: { paddingHorizontal: space.lg, gap: space.lg },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.md, rowGap: space.xs, marginTop: -space.xs },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  priceCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: space.xl,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
  },
  actions: { flexDirection: "row", gap: space.md },
  oracle: { padding: space.lg, borderRadius: radius.lg, backgroundColor: color.surface },
  sectionLabel: { marginTop: space.sm, marginBottom: -space.sm },
  storeRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 60 },
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
  amountInput: { flex: 1, color: color.text, fontSize: 17, fontWeight: "700", fontVariant: ["tabular-nums"] },
  floatingBar: { position: "absolute", left: space.lg, right: space.lg, flexDirection: "row", justifyContent: "space-between" },
  toast: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: color.surface3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
  },
});
