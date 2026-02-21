import React, { useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from "react-native";
import * as Haptics from "expo-haptics";
import { addCollectionEvents } from "../lib/api";
import { useScanStore, type PendingScan } from "../store/scanStore";
import { COLORS } from "../lib/constants";

function generateEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ScannedCardTray() {
  const { pending, incrementQty, decrementQty, markAdded, clearAdded } =
    useScanStore();
  const adding = useRef(false);

  const unadded = pending.filter((p) => !p.added);
  if (unadded.length === 0) return null;

  const totalCards = unadded.reduce((sum, p) => sum + p.quantity, 0);

  const handleAddAll = useCallback(async () => {
    if (adding.current || unadded.length === 0) return;
    adding.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const events = unadded.flatMap((p) => {
      const events = [];
      for (let i = 0; i < p.quantity; i++) {
        events.push({
          id: generateEventId(),
          at: new Date().toISOString(),
          type: "add" as const,
          variantId: p.candidate.variantId,
          payload: { quantity: 1 },
        });
      }
      return events;
    });

    try {
      await addCollectionEvents(events);
      unadded.forEach((p) => markAdded(p.key));
      // Clear added entries after a brief delay so the user sees the ✓
      setTimeout(() => clearAdded(), 1200);
    } catch (err) {
      console.warn("[tray] Failed to add cards:", err);
    } finally {
      adding.current = false;
    }
  }, [unadded, markAdded, clearAdded]);

  return (
    <View style={styles.container}>
      {/* Scroll horizontally through pending cards */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {unadded.map((p) => (
          <CardPill
            key={p.key}
            scan={p}
            onIncrement={() => {
              incrementQty(p.key);
              Haptics.selectionAsync();
            }}
            onDecrement={() => {
              decrementQty(p.key);
              Haptics.selectionAsync();
            }}
          />
        ))}
      </ScrollView>

      {/* Add all button */}
      <TouchableOpacity style={styles.addButton} onPress={handleAddAll} activeOpacity={0.8}>
        <Text style={styles.addButtonText}>
          Add {totalCards} card{totalCards !== 1 ? "s" : ""} to collection
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function CardPill({ scan, onIncrement, onDecrement }: {
  scan: PendingScan;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const usdPrice = scan.candidate.prices.find(
    (p) => p.currency === "USD" && p.kind === "market"
  );

  return (
    <View style={styles.pill}>
      {/* Card thumbnail */}
      {scan.candidate.imageUri ? (
        <Image
          source={{ uri: scan.candidate.imageUri }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
          <Text style={styles.thumbnailPlaceholderText}>
            {scan.candidate.name.slice(0, 2).toUpperCase()}
          </Text>
        </View>
      )}

      {/* Card info */}
      <View style={styles.pillInfo}>
        <Text style={styles.pillName} numberOfLines={2}>
          {scan.candidate.name}
        </Text>
        {usdPrice && (
          <Text style={styles.pillPrice}>${usdPrice.amount.toFixed(2)}</Text>
        )}
      </View>

      {/* Qty controls */}
      <View style={styles.qtyRow}>
        <TouchableOpacity style={styles.qtyBtn} onPress={onDecrement}>
          <Text style={styles.qtyBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.qtyValue}>{scan.quantity}</Text>
        <TouchableOpacity style={styles.qtyBtn} onPress={onIncrement}>
          <Text style={styles.qtyBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(10,10,10,0.96)",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingBottom: 34, // safe area
  },
  scroll: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    flexDirection: "row",
  },
  pill: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    width: 150,
    gap: 8,
  },
  thumbnail: {
    width: "100%",
    aspectRatio: 0.72,
    borderRadius: 6,
    backgroundColor: COLORS.surfaceHighlight,
  },
  thumbnailPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnailPlaceholderText: {
    color: COLORS.textMuted,
    fontSize: 20,
    fontWeight: "700",
  },
  pillInfo: {
    gap: 2,
  },
  pillName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
  },
  pillPrice: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: "500",
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceHighlight,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnText: {
    color: COLORS.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "500",
  },
  qtyValue: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
    minWidth: 20,
    textAlign: "center",
  },
  addButton: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  addButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
