import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../src/lib/constants";
import { listDecks, createDeck, deleteDeck, type Deck } from "../../src/lib/api";

const FORMATS = ["commander", "standard", "modern", "pioneer", "legacy", "vintage", "pauper"] as const;
const FORMAT_COLORS: Record<string, string> = {
  commander: "#9B59B6",
  standard: "#27AE60",
  modern: "#2980B9",
  pioneer: "#E67E22",
  legacy: "#C0392B",
  vintage: "#F39C12",
  pauper: "#7F8C8D",
};

export default function DecksScreen() {
  const router = useRouter();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFormat, setNewFormat] = useState<(typeof FORMATS)[number]>("commander");
  const [newCommander, setNewCommander] = useState("");

  const load = useCallback(async () => {
    try {
      const { decks: d } = await listDecks();
      setDecks(d);
    } catch {
      // unauthenticated — show empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createDeck({
        name: newName.trim(),
        format: newFormat,
        commander: newCommander.trim() || undefined,
      });
      setShowCreate(false);
      setNewName("");
      setNewCommander("");
      setNewFormat("commander");
      load();
    } catch (e: unknown) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (deck: Deck) => {
    Alert.alert("Delete deck", `Delete "${deck.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteDeck(deck.id);
          load();
        },
      },
    ]);
  };

  const renderDeck = ({ item }: { item: Deck }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push({ pathname: "/(deck)/[id]", params: { id: item.id } } as never)}
      onLongPress={() => handleDelete(item)}
    >
      <View style={[styles.formatBadge, { backgroundColor: FORMAT_COLORS[item.format] ?? COLORS.surface }]}>
        <Text style={styles.formatText}>{item.format.slice(0, 3).toUpperCase()}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.deckName}>{item.name}</Text>
        {item.commander && (
          <Text style={styles.commander}>{item.commander}</Text>
        )}
        <Text style={styles.cardCount}>{item._count?.cards ?? 0} cards</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator color={COLORS.accent} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={decks}
          keyExtractor={(d) => d.id}
          renderItem={renderDeck}
          contentContainerStyle={decks.length === 0 ? styles.emptyContainer : styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.accent} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="layers-outline" size={56} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No decks yet</Text>
              <Text style={styles.emptyHint}>Tap + to create your first deck</Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Create modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>New Deck</Text>

            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="My Commander Deck"
              placeholderTextColor={COLORS.textMuted}
              autoFocus
            />

            <Text style={styles.label}>Format</Text>
            <View style={styles.formatRow}>
              {FORMATS.map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.formatChip, newFormat === f && { backgroundColor: FORMAT_COLORS[f] ?? COLORS.accent }]}
                  onPress={() => setNewFormat(f)}
                >
                  <Text style={[styles.formatChipText, newFormat === f && { color: "#fff", fontWeight: "700" }]}>
                    {f}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {(newFormat === "commander" || newFormat === "oathbreaker") && (
              <>
                <Text style={styles.label}>Commander (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={newCommander}
                  onChangeText={setNewCommander}
                  placeholder="Atraxa, Praetors' Voice"
                  placeholderTextColor={COLORS.textMuted}
                />
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreate(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createBtn, (!newName.trim() || creating) && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={!newName.trim() || creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.createText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  listContent: { padding: 16, gap: 10 },
  emptyContainer: { flex: 1 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  formatBadge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  formatText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  cardBody: { flex: 1 },
  deckName: { color: COLORS.text, fontSize: 16, fontWeight: "700" },
  commander: { color: COLORS.accent, fontSize: 13, marginTop: 2 },
  cardCount: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyTitle: { color: COLORS.text, fontSize: 20, fontWeight: "700" },
  emptyHint: { color: COLORS.textMuted, fontSize: 14 },
  fab: {
    position: "absolute",
    bottom: 28,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.accent,
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modal: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 12 },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: "800", marginBottom: 4 },
  label: { color: COLORS.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  input: {
    backgroundColor: COLORS.background,
    color: COLORS.text,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  formatRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  formatChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border ?? "#333",
  },
  formatChipText: { color: COLORS.textMuted, fontSize: 13 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: COLORS.background, alignItems: "center" },
  cancelText: { color: COLORS.textMuted, fontWeight: "700" },
  createBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: COLORS.accent, alignItems: "center" },
  createText: { color: "#fff", fontWeight: "700" },
});
