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
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { COLORS } from "../../src/lib/constants";
import { getCardDetail, addCollectionEvents, listDecks, updateDeckCards, getDeck, type CardDetail, type Deck } from "../../src/lib/api";

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
  const [showDeckPicker, setShowDeckPicker] = useState(false);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [decksLoading, setDecksLoading] = useState(false);
  const [addedToDeck, setAddedToDeck] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { card: c } = await getCardDetail(id);
        setCard(c);
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
        payload: { quantity: 1 },
      }]);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Added", `${card.name} added to your collection.`);
    } catch (e: unknown) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setAddingToCollection(false);
    }
  }, [card]);

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

  const bestPrice = card.storePricing
    .flatMap((s) => s.prices.filter((p) => p.currency === "USD"))
    .sort((a, b) => a.amount - b.amount)[0] ?? null;

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
  cancelBtn: { padding: 14, borderRadius: 10, backgroundColor: COLORS.background, alignItems: "center", marginTop: 4 },
  cancelText: { color: COLORS.textMuted, fontWeight: "700" },
});
