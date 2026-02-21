import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  Switch,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../src/lib/constants";
import {
  getWatchlist,
  deleteWatchlistEntry,
  toggleWatchlistEntry,
  type WatchlistEntry,
} from "../../src/lib/api";

function priceStatus(entry: WatchlistEntry): { triggered: boolean; label: string; color: string } {
  const { currentPrice, thresholdAmount, direction } = entry;
  if (currentPrice == null) return { triggered: false, label: "No price data", color: COLORS.textMuted };
  const triggered =
    direction === "above" ? currentPrice >= thresholdAmount : currentPrice <= thresholdAmount;
  const diff = Math.abs(currentPrice - thresholdAmount);
  const label = triggered
    ? `Alert triggered · $${diff.toFixed(2)} ${direction === "above" ? "above" : "below"}`
    : `$${diff.toFixed(2)} ${direction === "above" ? "below" : "above"} target`;
  return { triggered, label, color: triggered ? (direction === "above" ? "#27AE60" : "#E74C3C") : COLORS.textMuted };
}

export default function WatchlistScreen() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { entries: e } = await getWatchlist();
      setEntries(e);
    } catch {
      // not authed
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleToggle = async (entry: WatchlistEntry, enabled: boolean) => {
    setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, enabled } : e));
    try {
      await toggleWatchlistEntry(entry.id, enabled);
    } catch {
      setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, enabled: !enabled } : e));
    }
  };

  const handleDelete = (entry: WatchlistEntry) => {
    Alert.alert("Remove alert", `Remove price alert for ${entry.cardName}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setEntries((prev) => prev.filter((e) => e.id !== entry.id));
          await deleteWatchlistEntry(entry.id);
        },
      },
    ]);
  };

  const renderEntry = ({ item }: { item: WatchlistEntry }) => {
    const status = priceStatus(item);
    return (
      <View style={[styles.card, status.triggered && item.enabled && styles.cardTriggered]}>
        <View style={styles.cardLeft}>
          {item.imageUri ? (
            <Image source={{ uri: item.imageUri }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Ionicons name="image-outline" size={18} color={COLORS.textMuted} />
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>{item.cardName}</Text>

          <View style={styles.targetRow}>
            <Ionicons
              name={item.direction === "above" ? "arrow-up-circle" : "arrow-down-circle"}
              size={14}
              color={item.direction === "above" ? "#27AE60" : "#E74C3C"}
            />
            <Text style={styles.targetText}>
              Alert when {item.direction} ${item.thresholdAmount.toFixed(2)}
            </Text>
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.currentPrice}>
              Now: {item.currentPrice != null ? `$${item.currentPrice.toFixed(2)}` : "—"}
            </Text>
            <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
          </View>

          <Text style={styles.market}>{item.market} · {item.kind} · {item.currency}</Text>
        </View>

        <View style={styles.cardActions}>
          <Switch
            value={item.enabled}
            onValueChange={(v) => handleToggle(item, v)}
            trackColor={{ false: COLORS.border ?? "#333", true: COLORS.accent }}
            thumbColor="#fff"
          />
          <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={18} color="#E74C3C" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator color={COLORS.accent} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          renderItem={renderEntry}
          contentContainerStyle={entries.length === 0 ? styles.emptyContainer : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.accent} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-outline" size={56} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No price alerts</Text>
              <Text style={styles.emptyHint}>View a card and set a price target to get notified when it hits</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: 16, gap: 10 },
  emptyContainer: { flex: 1 },
  card: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  cardTriggered: { borderColor: COLORS.accent },
  cardLeft: {},
  thumb: { width: 44, height: 62, borderRadius: 4 },
  thumbPlaceholder: { backgroundColor: COLORS.background, alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1, gap: 4 },
  cardName: { color: COLORS.text, fontSize: 15, fontWeight: "700" },
  targetRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  targetText: { color: COLORS.textMuted, fontSize: 12 },
  priceRow: { gap: 2 },
  currentPrice: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  statusLabel: { fontSize: 12 },
  market: { color: COLORS.textMuted, fontSize: 11, textTransform: "capitalize" },
  cardActions: { alignItems: "center", gap: 12 },
  deleteBtn: { padding: 4 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyTitle: { color: COLORS.text, fontSize: 20, fontWeight: "700" },
  emptyHint: { color: COLORS.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
});
