import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  Linking,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { COLORS } from "../../src/lib/constants";
import {
  getCardDetail,
  addCollectionEvents,
  listDecks,
  updateDeckCards,
  getDeck,
  addWatchlistEntry,
  type CardDetail,
  type Deck,
} from "../../src/lib/api";

const { width } = Dimensions.get("window");
const IMAGE_HEIGHT = width * 0.72;

const RARITY_COLOR: Record<string, string> = {
  common: "#AAA", uncommon: "#C0C0C0", rare: "#FFD700", mythic: "#FF6B35", special: "#A855F7",
};
const COLOR_ICONS: Record<string, string> = {
  W: "☀️", U: "💧", B: "💀", R: "🔥", G: "🌲",
};

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [card, setCard] = useState<CardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingToCollection, setAddingToCollection] = useState(false);
  const [collectionFinish, setCollectionFinish] = useState<
    "nonfoil" | "foil" | "etched"
  >("nonfoil");
  const [showDeckPicker, setShowDeckPicker] = useState(false);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [decksLoading, setDecksLoading] = useState(false);
  const [addedToDeck, setAddedToDeck] = useState<string | null>(null);

  // Set price alert
  const [showAlertSheet, setShowAlertSheet] = useState(false);
  const [alertMarket, setAlertMarket] = useState<"tcgplayer" | "cardmarket">(
    "tcgplayer"
  );
  const [alertKind, setAlertKind] = useState<"market" | "foil" | "etched">(
    "market"
  );
  const [alertDirection, setAlertDirection] = useState<"above" | "below">("below");
  const [alertThreshold, setAlertThreshold] = useState("");
  const [savingAlert, setSavingAlert] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { card: c } = await getCardDetail(id);
        setCard(c);
        setCollectionFinish(
          c.variantId.endsWith("-foil") ? "foil" : "nonfoil"
        );
      } catch (e: unknown) {
        Alert.alert("Error", (e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleAddToCollection = useCallback(async () => {
    if (!card) return;
    setAddingToCollection(true);
    try {
      await addCollectionEvents([{
        id: `${card.variantId}-${Date.now()}`,
        at: new Date().toISOString(),
        type: "add",
        variantId: card.variantId,
        payload: { quantity: 1, finish: collectionFinish },
      }]);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Added", `${card.name} added to your collection.`);
    } catch (e: unknown) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setAddingToCollection(false);
    }
  }, [card, collectionFinish]);

  const openDeckPicker = useCallback(async () => {
    setDecksLoading(true);
    setShowDeckPicker(true);
    try {
      const { decks: d } = await listDecks();
      setDecks(d);
    } catch {
      setDecks([]);
    } finally {
      setDecksLoading(false);
    }
  }, []);

  const handleAddToDeck = useCallback(async (deck: Deck) => {
    if (!card) return;
    try {
      // Fetch current deck cards so we can append
      const { deck: full } = await getDeck(deck.id);
      const existing = full.cards.map((c) => ({
        cardName: c.cardName,
        variantId: c.variantId ?? undefined,
        quantity: c.quantity,
        section: c.section,
      }));
      const alreadyIn = existing.find((c) => c.cardName === card.name);
      let updated;
      if (alreadyIn) {
        updated = existing.map((c) =>
          c.cardName === card.name ? { ...c, quantity: c.quantity + 1 } : c
        );
      } else {
        updated = [...existing, { cardName: card.name, variantId: card.variantId, quantity: 1, section: "mainboard" }];
      }
      await updateDeckCards(deck.id, updated);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddedToDeck(deck.id);
      setShowDeckPicker(false);
    } catch (e: unknown) {
      Alert.alert("Error", (e as Error).message);
    }
  }, [card]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.accent} size="large" /></View>;
  }

  if (!card) return null;

  const availableCollectionFinishes = (
    [
      { value: "nonfoil", label: "Non-foil", priceLabel: "Normal" },
      { value: "foil", label: "Foil", priceLabel: "Foil" },
      { value: "etched", label: "Etched", priceLabel: "Etched" },
    ] as const
  ).filter(
    (finish) =>
      finish.value === collectionFinish ||
      card.storePricing.some((store) =>
        store.prices.some((price) => price.label === finish.priceLabel)
      )
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: card.name,
          headerStyle: { backgroundColor: COLORS.surface },
          headerTintColor: COLORS.text,
        }}
      />

      {/* Card image */}
      {card.imageUri ? (
        <Image source={{ uri: card.imageUri }} style={styles.cardImage} resizeMode="contain" />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Ionicons name="image-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.placeholderName}>{card.name}</Text>
        </View>
      )}

      {/* Name + identity row */}
      <View style={styles.nameRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{card.name}</Text>
          {card.typeLine && <Text style={styles.typeLine}>{card.typeLine}</Text>}
        </View>
        <View style={styles.identityRow}>
          {(card.colorIdentity ?? card.colors ?? []).map((c) => (
            <Text key={c} style={styles.colorIcon}>{COLOR_ICONS[c] ?? c}</Text>
          ))}
        </View>
      </View>

      {/* Badges row */}
      <View style={styles.badgeRow}>
        {card.manaCost && <View style={styles.badge}><Text style={styles.badgeText}>{card.manaCost}</Text></View>}
        {card.cmc != null && <View style={styles.badge}><Text style={styles.badgeText}>CMC {card.cmc}</Text></View>}
        {card.rarity && (
          <View style={[styles.badge, { borderColor: RARITY_COLOR[card.rarity] ?? "#666" }]}>
            <Text style={[styles.badgeText, { color: RARITY_COLOR[card.rarity] ?? COLORS.textMuted }]}>
              {card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1)}
            </Text>
          </View>
        )}
        {card.setId && <View style={styles.badge}><Text style={styles.badgeText}>{card.setId.toUpperCase()}</Text></View>}
      </View>

      {/* Oracle text */}
      {card.oracleText && (
        <View style={styles.oracleBox}>
          <Text style={styles.oracleText}>{card.oracleText}</Text>
        </View>
      )}

      {/* Prices */}
      <Text style={styles.sectionHeader}>Prices</Text>
      {card.storePricing.map((store) => (
        <View key={store.store} style={styles.storeRow}>
          <View style={styles.storeInfo}>
            <Text style={styles.storeName}>{store.store}</Text>
            <View style={styles.priceList}>
              {store.prices.map((p) => (
                <Text key={p.label} style={styles.priceEntry}>
                  {p.label}: <Text style={styles.priceAmount}>${p.amount.toFixed(2)}</Text>
                </Text>
              ))}
              {store.prices.length === 0 && <Text style={styles.noPrice}>No price data</Text>}
            </View>
          </View>
          {store.buyUrl && (
            <TouchableOpacity onPress={() => Linking.openURL(store.buyUrl!)}>
              <Ionicons name="open-outline" size={20} color={COLORS.accent} />
            </TouchableOpacity>
          )}
        </View>
      ))}

      {/* Actions */}
      <Text style={styles.sectionHeader}>Copy finish</Text>
      <View style={styles.segRow}>
        {availableCollectionFinishes.map((finish) => (
          <TouchableOpacity
            key={finish.value}
            style={[
              styles.seg,
              collectionFinish === finish.value && styles.segActive,
            ]}
            onPress={() => setCollectionFinish(finish.value)}
          >
            <Text
              style={[
                styles.segText,
                collectionFinish === finish.value && styles.segTextActive,
              ]}
            >
              {finish.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnPrimary, addingToCollection && { opacity: 0.6 }]}
          onPress={handleAddToCollection}
          disabled={addingToCollection}
        >
          {addingToCollection
            ? <ActivityIndicator color="#fff" size="small" />
            : <><Ionicons name="add-circle-outline" size={20} color="#fff" /><Text style={styles.actionBtnText}>Add to Collection</Text></>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSecondary]}
          onPress={openDeckPicker}
        >
          <Ionicons name="layers-outline" size={20} color={COLORS.accent} />
          <Text style={[styles.actionBtnText, { color: COLORS.accent }]}>Add to Deck</Text>
        </TouchableOpacity>
      </View>

      {/* Set Price Alert button */}
      <TouchableOpacity
        style={styles.alertBtn}
        onPress={() => {
          const store = card.storePricing.find(
            (entry) => entry.store.toLowerCase() === "tcgplayer"
          );
          const best = store?.prices
            .filter((price) => price.label === "Normal" && price.currency === "USD")
            .sort((a, b) => a.amount - b.amount)[0];
          if (best) setAlertThreshold(best.amount.toFixed(2));
          setAlertMarket("tcgplayer");
          setAlertKind("market");
          setShowAlertSheet(true);
        }}
      >
        <Ionicons name="notifications-outline" size={18} color={COLORS.textMuted} />
        <Text style={styles.alertBtnText}>Set Price Alert</Text>
      </TouchableOpacity>

      {/* Deck picker modal */}
      <Modal visible={showDeckPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Add to Deck</Text>
            {decksLoading ? (
              <ActivityIndicator color={COLORS.accent} style={{ marginVertical: 20 }} />
            ) : decks.length === 0 ? (
              <Text style={styles.noDecks}>No decks yet. Create one in the Decks tab first.</Text>
            ) : (
              decks.map((deck) => (
                <TouchableOpacity
                  key={deck.id}
                  style={[styles.deckOption, addedToDeck === deck.id && { borderColor: COLORS.accent }]}
                  onPress={() => handleAddToDeck(deck)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deckOptionName}>{deck.name}</Text>
                    {deck.commander && <Text style={styles.deckOptionCommander}>{deck.commander}</Text>}
                  </View>
                  {addedToDeck === deck.id && <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />}
                </TouchableOpacity>
              ))
            )}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowDeckPicker(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Set Price Alert modal */}
      <Modal visible={showAlertSheet} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>Set Price Alert</Text>
              <Text style={styles.modalSubtitle}>{card.name}</Text>

              {/* Market */}
              <Text style={styles.alertLabel}>Market</Text>
              <View style={styles.segRow}>
                {([
                  { value: "tcgplayer", label: "TCGplayer" },
                  { value: "cardmarket", label: "Cardmarket" },
                ] as const).map((market) => (
                  <TouchableOpacity
                    key={market.value}
                    style={[
                      styles.seg,
                      alertMarket === market.value && styles.segActive,
                    ]}
                    onPress={() => {
                      setAlertMarket(market.value);
                      const currency =
                        market.value === "cardmarket" ? "EUR" : "USD";
                      const store = card.storePricing.find(
                        (entry) =>
                          entry.store.toLowerCase() === market.value
                      );
                      const label =
                        alertKind === "market"
                          ? "Normal"
                          : alertKind === "foil"
                            ? "Foil"
                            : "Etched";
                      const price = store?.prices.find(
                        (entry) =>
                          entry.label === label && entry.currency === currency
                      );
                      setAlertThreshold(
                        price ? price.amount.toFixed(2) : ""
                      );
                    }}
                  >
                    <Text
                      style={[
                        styles.segText,
                        alertMarket === market.value && styles.segTextActive,
                      ]}
                    >
                      {market.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Finish */}
              <Text style={styles.alertLabel}>Finish</Text>
              <View style={styles.segRow}>
                {([
                  { value: "market", label: "Non-foil" },
                  { value: "foil", label: "Foil" },
                  { value: "etched", label: "Etched" },
                ] as const).map((finish) => (
                  <TouchableOpacity
                    key={finish.value}
                    style={[
                      styles.seg,
                      alertKind === finish.value && styles.segActive,
                    ]}
                    onPress={() => {
                      setAlertKind(finish.value);
                      const currency =
                        alertMarket === "cardmarket" ? "EUR" : "USD";
                      const store = card.storePricing.find(
                        (entry) =>
                          entry.store.toLowerCase() === alertMarket
                      );
                      const price = store?.prices.find(
                        (entry) =>
                          entry.label === finish.label.replace("Non-foil", "Normal") &&
                          entry.currency === currency
                      );
                      setAlertThreshold(
                        price ? price.amount.toFixed(2) : ""
                      );
                    }}
                  >
                    <Text
                      style={[
                        styles.segText,
                        alertKind === finish.value && styles.segTextActive,
                      ]}
                    >
                      {finish.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Direction */}
              <Text style={styles.alertLabel}>Alert when price is</Text>
              <View style={styles.segRow}>
                {(["below", "above"] as const).map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.seg, alertDirection === d && styles.segActive]}
                    onPress={() => setAlertDirection(d)}
                  >
                    <Text style={[styles.segText, alertDirection === d && styles.segTextActive]}>
                      {d === "below" ? "⬇ Below" : "⬆ Above"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Threshold */}
              <Text style={styles.alertLabel}>
                Target price ({alertMarket === "cardmarket" ? "EUR" : "USD"})
              </Text>
              <TextInput
                style={styles.alertInput}
                value={alertThreshold}
                onChangeText={(t) => setAlertThreshold(t.replace(/[^0-9.]/g, ""))}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={COLORS.textMuted}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAlertSheet(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.createBtn, (savingAlert || !alertThreshold) && { opacity: 0.5 }]}
                  disabled={savingAlert || !alertThreshold}
                  onPress={async () => {
                    setSavingAlert(true);
                    try {
                      await addWatchlistEntry({
                        variantId: card.variantId,
                        market: alertMarket,
                        kind: alertKind,
                        currency: alertMarket === "cardmarket" ? "EUR" : "USD",
                        thresholdAmount: parseFloat(alertThreshold),
                        direction: alertDirection,
                      });
                      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      setShowAlertSheet(false);
                      Alert.alert(
                        "Alert set!",
                        `You'll be notified when ${card.name} (${alertKind === "market" ? "non-foil" : alertKind}) goes ${alertDirection} ${alertMarket === "cardmarket" ? "€" : "$"}${alertThreshold} on ${alertMarket}.`
                      );
                    } catch (e: unknown) {
                      Alert.alert("Error", (e as Error).message);
                    } finally {
                      setSavingAlert(false);
                    }
                  }}
                >
                  {savingAlert
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.createText}>Save Alert</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  cardImage: { width, height: IMAGE_HEIGHT },
  imagePlaceholder: {
    width, height: IMAGE_HEIGHT,
    backgroundColor: COLORS.surface,
    alignItems: "center", justifyContent: "center", gap: 12,
  },
  placeholderName: { color: COLORS.textMuted, fontSize: 16, textAlign: "center", paddingHorizontal: 24 },
  nameRow: { flexDirection: "row", alignItems: "flex-start", padding: 16, gap: 12 },
  cardName: { color: COLORS.text, fontSize: 22, fontWeight: "800" },
  typeLine: { color: COLORS.textMuted, fontSize: 14, marginTop: 4 },
  identityRow: { flexDirection: "row", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" },
  colorIcon: { fontSize: 18 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, marginBottom: 16 },
  badge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border ?? "#333",
  },
  badgeText: { color: COLORS.textMuted, fontSize: 12, fontWeight: "600" },
  oracleBox: { marginHorizontal: 16, marginBottom: 20, backgroundColor: COLORS.surface, borderRadius: 12, padding: 14 },
  oracleText: { color: COLORS.text, fontSize: 14, lineHeight: 22 },
  sectionHeader: {
    color: COLORS.textMuted, fontSize: 12, fontWeight: "800",
    textTransform: "uppercase", letterSpacing: 1,
    paddingHorizontal: 16, marginBottom: 10,
  },
  storeRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.surface, borderRadius: 12,
    padding: 14, marginHorizontal: 16, marginBottom: 8,
  },
  storeInfo: { flex: 1 },
  storeName: { color: COLORS.text, fontSize: 15, fontWeight: "700", marginBottom: 6 },
  priceList: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  priceEntry: { color: COLORS.textMuted, fontSize: 13 },
  priceAmount: { color: COLORS.text, fontWeight: "700" },
  noPrice: { color: COLORS.textMuted, fontSize: 13 },
  actions: { flexDirection: "row", gap: 10, padding: 16, marginTop: 8 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, padding: 14, borderRadius: 12,
  },
  actionBtnPrimary: { backgroundColor: COLORS.accent },
  actionBtnSecondary: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.accent },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modal: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 10, maxHeight: "70%" },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: "800", marginBottom: 8 },
  noDecks: { color: COLORS.textMuted, fontSize: 14, textAlign: "center", paddingVertical: 20 },
  deckOption: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.background, borderRadius: 10,
    padding: 14, borderWidth: 1, borderColor: "transparent",
  },
  deckOptionName: { color: COLORS.text, fontSize: 15, fontWeight: "600" },
  deckOptionCommander: { color: COLORS.textMuted, fontSize: 13, marginTop: 2 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: COLORS.background, alignItems: "center", marginTop: 4 },
  cancelText: { color: COLORS.textMuted, fontWeight: "700" },
  // Set Alert button
  alertBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, marginHorizontal: 16, marginBottom: 16, padding: 12,
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.border ?? "#333",
  },
  alertBtnText: { color: COLORS.textMuted, fontSize: 13, fontWeight: "600" },
  // Alert modal
  modalSubtitle: { color: COLORS.textMuted, fontSize: 14, marginBottom: 16 },
  alertLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
  segRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  seg: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: COLORS.background, alignItems: "center", borderWidth: 1, borderColor: "transparent" },
  segActive: { borderColor: COLORS.accent, backgroundColor: `${COLORS.accent}22` },
  segText: { color: COLORS.textMuted, fontSize: 13, fontWeight: "600" },
  segTextActive: { color: COLORS.accent },
  alertInput: {
    backgroundColor: COLORS.background, color: COLORS.text, borderRadius: 10,
    padding: 14, fontSize: 18, fontWeight: "700", textAlign: "center",
    borderWidth: 1, borderColor: COLORS.border ?? "#333", marginBottom: 14,
  },
  modalActions: { flexDirection: "row", gap: 10 },
  createBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: COLORS.accent, alignItems: "center" },
  createText: { color: "#fff", fontWeight: "700" },
});
