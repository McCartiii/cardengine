import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  SectionList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Image,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../src/lib/constants";
import {
  getDeck,
  getDeckEdhrec,
  getAiAdvice,
  importDeckText,
  deleteDeck,
  updateDeckCards,
  type DeckCard,
} from "../../src/lib/api";

type Tab = "cards" | "edhrec" | "ai";

const SECTION_ORDER = ["commander", "mainboard", "sideboard", "companion"];
const SECTION_LABEL: Record<string, string> = {
  commander: "Commander",
  mainboard: "Mainboard",
  sideboard: "Sideboard",
  companion: "Companion",
};
const RARITY_COLOR: Record<string, string> = {
  common: "#AAA", uncommon: "#C0C0C0", rare: "#FFD700", mythic: "#FF6B35",
};

function formatUsd(n: number | null | undefined) {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

export default function DeckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("cards");
  const [loading, setLoading] = useState(true);
  const [deck, setDeck] = useState<Awaited<ReturnType<typeof getDeck>> | null>(null);

  // EDHRec
  const [edhrecData, setEdhrecData] = useState<Awaited<ReturnType<typeof getDeckEdhrec>> | null>(null);
  const [edhrecLoading, setEdhrecLoading] = useState(false);

  // AI
  const [aiAdvice, setAiAdvice] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("What are the main weaknesses and top 5 improvements for this deck?");

  // Import modal
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);

  const loadDeck = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDeck(id);
      setDeck(data);
    } catch (e: unknown) {
      Alert.alert("Error", (e as Error).message);
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadDeck(); }, [loadDeck]);

  const loadEdhrec = useCallback(async () => {
    if (edhrecData || edhrecLoading) return;
    setEdhrecLoading(true);
    try {
      const data = await getDeckEdhrec(id);
      setEdhrecData(data);
    } catch {
      // No commander or not found — handled in UI
    } finally {
      setEdhrecLoading(false);
    }
  }, [id, edhrecData, edhrecLoading]);

  useEffect(() => {
    if (tab === "edhrec") loadEdhrec();
  }, [tab, loadEdhrec]);

  const handleAiAdvice = async () => {
    setAiLoading(true);
    setAiAdvice("");
    try {
      const { advice } = await getAiAdvice({ deckId: id, question: aiQuestion });
      setAiAdvice(advice);
    } catch (e: unknown) {
      setAiAdvice(`Error: ${(e as Error).message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    try {
      const result = await importDeckText(id, importText.trim());
      setShowImport(false);
      setImportText("");
      Alert.alert(
        "Imported",
        `${result.imported} cards imported (${result.resolved} resolved).\n` +
        (result.legality.issues.length > 0
          ? `⚠️ ${result.legality.issues.slice(0, 3).join("\n")}`
          : "✓ Deck is legal")
      );
      loadDeck();
    } catch (e: unknown) {
      Alert.alert("Import failed", (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteDeck = () => {
    Alert.alert("Delete deck", `Delete "${deck?.deck.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteDeck(id);
          router.back();
        },
      },
    ]);
  };

  if (loading || !deck) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  const { deck: d, totalValue, legality } = deck;

  // Group cards by section
  const sections = SECTION_ORDER
    .map((section) => ({
      title: SECTION_LABEL[section],
      section,
      data: d.cards.filter((c) => c.section === section),
    }))
    .filter((s) => s.data.length > 0);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: d.name,
          headerStyle: { backgroundColor: COLORS.surface },
          headerTintColor: COLORS.text,
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: 16, marginRight: 4 }}>
              <TouchableOpacity onPress={() => setShowImport(true)}>
                <Ionicons name="download-outline" size={22} color={COLORS.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDeleteDeck}>
                <Ionicons name="trash-outline" size={22} color="#E74C3C" />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      {/* Header stats */}
      <View style={styles.header}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{d.cards.reduce((s, c) => s + c.quantity, 0)}</Text>
          <Text style={styles.statLabel}>Cards</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>${totalValue.toFixed(2)}</Text>
          <Text style={styles.statLabel}>Value</Text>
        </View>
        <View style={styles.stat}>
          <View style={[styles.legalityBadge, { backgroundColor: legality.valid ? "#27AE60" : "#E74C3C" }]}>
            <Text style={styles.legalityText}>{legality.valid ? "Legal" : "Issues"}</Text>
          </View>
          <Text style={styles.statLabel}>{d.format}</Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(["cards", "edhrec", "ai"] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "cards" ? "Cards" : t === "edhrec" ? "EDHRec" : "AI Advice"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Cards tab */}
      {tab === "cards" && (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>
                {section.data.reduce((s, c) => s + c.quantity, 0)}
              </Text>
            </View>
          )}
          renderItem={({ item }: { item: DeckCard }) => (
            <View style={styles.cardRow}>
              {item.variant?.imageUri ? (
                <Image source={{ uri: item.variant.imageUri }} style={styles.cardThumb} />
              ) : (
                <View style={[styles.cardThumb, styles.cardThumbPlaceholder]}>
                  <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>?</Text>
                </View>
              )}
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{item.cardName}</Text>
                {item.variant?.typeLine && (
                  <Text style={styles.cardType} numberOfLines={1}>{item.variant.typeLine}</Text>
                )}
              </View>
              <View style={styles.cardRight}>
                {item.variant?.rarity && (
                  <View style={[styles.rarityDot, { backgroundColor: RARITY_COLOR[item.variant.rarity] ?? "#666" }]} />
                )}
                <Text style={styles.cardPrice}>{formatUsd(item.price)}</Text>
                <Text style={styles.cardQty}>×{item.quantity}</Text>
              </View>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No cards yet. Import a decklist to get started.</Text>
            </View>
          }
        />
      )}

      {/* EDHRec tab */}
      {tab === "edhrec" && (
        <ScrollView contentContainerStyle={styles.listContent}>
          {edhrecLoading ? (
            <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />
          ) : !edhrecData ? (
            <View style={styles.center}>
              <Ionicons name="information-circle-outline" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>No commander set, or commander not found on EDHRec.</Text>
            </View>
          ) : (
            <>
              <View style={styles.edhrecHeader}>
                <Text style={styles.edhrecCommander}>{edhrecData.commander}</Text>
                <Text style={styles.edhrecMeta}>
                  {edhrecData.num_decks.toLocaleString()} decks · avg ${edhrecData.avg_price.toFixed(0)}
                </Text>
              </View>
              {edhrecData.themes.length > 0 && (
                <View style={styles.themeRow}>
                  {edhrecData.themes.slice(0, 6).map((t) => (
                    <View key={t} style={styles.themeChip}>
                      <Text style={styles.themeText}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Text style={styles.sectionTitle2}>Recommended Cards</Text>
              {edhrecData.recommendations
                .filter((r) => !r.alreadyInDeck)
                .slice(0, 40)
                .map((r) => (
                  <View key={r.name} style={styles.recRow}>
                    {r.image ? (
                      <Image source={{ uri: r.image }} style={styles.recThumb} />
                    ) : (
                      <View style={[styles.recThumb, styles.cardThumbPlaceholder]} />
                    )}
                    <View style={styles.recInfo}>
                      <Text style={styles.recName}>{r.name}</Text>
                      <Text style={styles.recType}>{r.primary_type}</Text>
                    </View>
                    <View style={styles.recRight}>
                      <Text style={styles.recSynergy}>+{r.synergy}%</Text>
                      <Text style={styles.recInclusion}>{r.inclusion}%</Text>
                      <Text style={styles.recPrice}>{r.price_usd != null ? `$${r.price_usd.toFixed(2)}` : "—"}</Text>
                    </View>
                  </View>
                ))}
            </>
          )}
        </ScrollView>
      )}

      {/* AI Advice tab */}
      {tab === "ai" && (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.listContent}>
            <Text style={styles.label}>Question</Text>
            <TextInput
              style={styles.aiInput}
              value={aiQuestion}
              onChangeText={setAiQuestion}
              multiline
              numberOfLines={3}
              placeholderTextColor={COLORS.textMuted}
            />
            <TouchableOpacity
              style={[styles.aiBtn, aiLoading && { opacity: 0.6 }]}
              onPress={handleAiAdvice}
              disabled={aiLoading}
            >
              {aiLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <Text style={styles.aiBtnText}>Get AI Advice</Text>
                </>
              )}
            </TouchableOpacity>
            {aiAdvice !== "" && (
              <View style={styles.aiResponse}>
                <Text style={styles.aiResponseText}>{aiAdvice}</Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Import modal */}
      <Modal visible={showImport} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>Import Decklist</Text>
              <Text style={styles.modalHint}>Paste in MTGO, Moxfield, or plain text format</Text>
              <TextInput
                style={styles.importInput}
                value={importText}
                onChangeText={setImportText}
                multiline
                placeholder={"1 Sol Ring\n1 Command Tower\n4 Lightning Bolt\n\nSideboard\n2 Counterspell"}
                placeholderTextColor={COLORS.textMuted}
                autoFocus
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowImport(false); setImportText(""); }}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.createBtn, (!importText.trim() || importing) && { opacity: 0.5 }]}
                  onPress={handleImport}
                  disabled={!importText.trim() || importing}
                >
                  {importing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.createText}>Import</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    padding: 16,
    gap: 0,
  },
  stat: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { color: COLORS.text, fontSize: 20, fontWeight: "800" },
  statLabel: { color: COLORS.textMuted, fontSize: 12 },
  legalityBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  legalityText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  tabBar: { flexDirection: "row", backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border ?? "#222" },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: COLORS.accent },
  tabText: { color: COLORS.textMuted, fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: COLORS.accent },
  listContent: { padding: 16, gap: 8, paddingBottom: 32 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  sectionTitle: { color: COLORS.textMuted, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  sectionCount: { color: COLORS.textMuted, fontSize: 12 },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 10,
    gap: 10,
  },
  cardThumb: { width: 36, height: 50, borderRadius: 4 },
  cardThumbPlaceholder: { backgroundColor: COLORS.background, alignItems: "center", justifyContent: "center" },
  cardInfo: { flex: 1 },
  cardName: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  cardType: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  cardRight: { alignItems: "flex-end", gap: 4 },
  rarityDot: { width: 7, height: 7, borderRadius: 4 },
  cardPrice: { color: COLORS.textMuted, fontSize: 12 },
  cardQty: { color: COLORS.accent, fontSize: 13, fontWeight: "700" },
  emptyText: { color: COLORS.textMuted, fontSize: 14, textAlign: "center", marginTop: 16 },
  // EDHRec
  edhrecHeader: { marginBottom: 12 },
  edhrecCommander: { color: COLORS.text, fontSize: 20, fontWeight: "800" },
  edhrecMeta: { color: COLORS.textMuted, fontSize: 13, marginTop: 4 },
  themeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  themeChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, backgroundColor: COLORS.surface },
  themeText: { color: COLORS.accent, fontSize: 12 },
  sectionTitle2: { color: COLORS.textMuted, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 },
  recRow: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surface, borderRadius: 10, padding: 10, gap: 10, marginBottom: 8 },
  recThumb: { width: 36, height: 50, borderRadius: 4 },
  recInfo: { flex: 1 },
  recName: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  recType: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  recRight: { alignItems: "flex-end", gap: 3 },
  recSynergy: { color: "#27AE60", fontSize: 12, fontWeight: "700" },
  recInclusion: { color: COLORS.textMuted, fontSize: 11 },
  recPrice: { color: COLORS.textMuted, fontSize: 11 },
  // AI
  label: { color: COLORS.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
  aiInput: {
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  aiBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  aiResponse: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16 },
  aiResponseText: { color: COLORS.text, fontSize: 14, lineHeight: 22 },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modal: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 12 },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: "800" },
  modalHint: { color: COLORS.textMuted, fontSize: 13 },
  importInput: {
    backgroundColor: COLORS.background,
    color: COLORS.text,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 180,
    textAlignVertical: "top",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  modalActions: { flexDirection: "row", gap: 10 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: COLORS.background, alignItems: "center" },
  cancelText: { color: COLORS.textMuted, fontWeight: "700" },
  createBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: COLORS.accent, alignItems: "center" },
  createText: { color: "#fff", fontWeight: "700" },
});
