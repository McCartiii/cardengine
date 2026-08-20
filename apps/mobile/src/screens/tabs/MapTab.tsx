import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  type ViewStyle,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { colors, spacing, radii, typography, shadows, tabColors } from "../../theme";
import { Header } from "../../components/ui/Header";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";

const t = colors.light;
const tc = tabColors.map;

// react-native-maps requires native build
let MapView: React.ComponentType<any> | null = null;
let RNMarker: React.ComponentType<any> | null = null;

try {
  const Maps = require("react-native-maps");
  MapView = Maps.default;
  RNMarker = Maps.Marker;
} catch {
  // Maps not available
}

// Const alias: TS can't narrow the mutable `let` inside JSX map callbacks.
const Marker = RNMarker;

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

interface Shop {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  lat?: number;
  lng?: number;
  category: string;
  phone?: string;
  hours?: string;
  distance?: number;
}

export function MapTab() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [searchCity, setSearchCity] = useState("");
  const [viewMode, setViewMode] = useState<"map" | "list">("list");
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [showShopModal, setShowShopModal] = useState(false);
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());

  const fetchShops = useCallback(async (city?: string) => {
    try {
      const params = new URLSearchParams();
      if (city) params.set("city", city);
      params.set("radius", "30");
      params.set("limit", "50");
      const res = await fetch(`${API_URL}/v1/shops?${params}`);
      const data = await res.json();
      setShops(data.shops ?? []);
    } catch {
      // Offline
    }
  }, []);

  useEffect(() => {
    fetchShops();
  }, [fetchShops]);

  const handleSearch = () => fetchShops(searchCity || undefined);

  const handleCheckin = async (shopId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      Alert.alert("Sign in", "You must be signed in to check in.");
      return;
    }
    try {
      await fetch(`${API_URL}/v1/checkins`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ shopId }),
      });
      setCheckedIn((prev) => new Set([...prev, shopId]));
      Alert.alert("Checked in!", "You have checked in to this shop.");
    } catch {
      Alert.alert("Error", "Failed to check in.");
    }
  };

  const renderShop = ({ item }: { item: Shop }) => (
    <Card
      onPress={() => {
        setSelectedShop(item);
        setShowShopModal(true);
      }}
      style={styles.shopCard}
    >
      <View style={styles.shopHeader}>
        <Text style={styles.shopName} numberOfLines={1}>{item.name}</Text>
        <Badge variant="default">
          {item.category.replace("_", " ")}
        </Badge>
      </View>
      <Text style={styles.shopAddress}>
        {[item.address, item.city, item.state].filter(Boolean).join(", ")}
      </Text>
      {item.distance != null && (
        <Text style={styles.shopDistance}>{item.distance.toFixed(1)} mi</Text>
      )}
    </Card>
  );

  return (
    <View style={styles.container}>
      <Header title="Local Scene" />

      {/* View toggle */}
      <View style={styles.tabBar}>
        {(["list", ...(MapView ? ["map"] : [])] as const).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.tabBtn, viewMode === m && styles.activeTabBtn]}
            onPress={() => setViewMode(m as typeof viewMode)}
          >
            <Text
              style={[
                styles.tabText,
                viewMode === m && styles.activeTabText,
              ]}
            >
              {m === "list" ? "Shops" : "Map"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="City name..."
          placeholderTextColor={t.textMuted}
          value={searchCity}
          onChangeText={setSearchCity}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {viewMode === "map" && MapView ? (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: 40.76,
            longitude: -111.89,
            latitudeDelta: 0.5,
            longitudeDelta: 0.5,
          }}
        >
          {Marker &&
            shops
              .filter((s) => s.lat != null && s.lng != null)
              .map((shop) => (
                <Marker
                  key={shop.id}
                  coordinate={{ latitude: shop.lat!, longitude: shop.lng! }}
                  title={shop.name}
                  description={shop.address}
                  onPress={() => {
                    setSelectedShop(shop);
                    setShowShopModal(true);
                  }}
                />
              ))}
        </MapView>
      ) : (
        <FlatList
          data={shops}
          keyExtractor={(item) => item.id}
          renderItem={renderShop}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No shops found nearby</Text>
            </View>
          }
        />
      )}

      {/* Shop detail modal */}
      <Modal
        visible={showShopModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowShopModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedShop && (
              <>
                <Text style={styles.modalTitle}>{selectedShop.name}</Text>
                <Text style={styles.modalAddress}>
                  {[selectedShop.address, selectedShop.city, selectedShop.state]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
                {selectedShop.hours && (
                  <Text style={styles.modalDetail}>
                    Hours: {selectedShop.hours}
                  </Text>
                )}
                {selectedShop.phone && (
                  <Text style={styles.modalDetail}>
                    Phone: {selectedShop.phone}
                  </Text>
                )}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[
                      styles.checkinBtn,
                      checkedIn.has(selectedShop.id) && styles.checkinBtnDone,
                    ]}
                    onPress={() => handleCheckin(selectedShop.id)}
                    disabled={checkedIn.has(selectedShop.id)}
                  >
                    <Text style={[
                      styles.checkinText,
                      checkedIn.has(selectedShop.id) && styles.checkinTextDone,
                    ]}>
                      {checkedIn.has(selectedShop.id)
                        ? "Checked In"
                        : "Check In"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.closeBtn}
                    onPress={() => setShowShopModal(false)}
                  >
                    <Text style={styles.closeBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  tabBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: t.surfaceSunken,
    borderWidth: 1,
    borderColor: t.border,
  },
  activeTabBtn: {
    backgroundColor: tc.color,
    borderColor: tc.color,
  },
  tabText: {
    ...typography.caption,
    fontWeight: "600",
    color: t.textSecondary,
  },
  activeTabText: { color: t.textInverse, fontWeight: "600" },
  searchRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: t.textPrimary,
  },
  searchButton: {
    backgroundColor: tc.color,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
  },
  searchButtonText: {
    color: t.textInverse,
    ...typography.caption,
  },
  map: { flex: 1 },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing["3xl"],
  },
  shopCard: {
    marginBottom: spacing.sm,
  } as ViewStyle,
  shopHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  shopName: {
    ...typography.body,
    fontWeight: "600",
    color: t.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  shopAddress: {
    ...typography.caption,
    color: t.textSecondary,
    marginTop: spacing.xs,
  },
  shopDistance: {
    ...typography.small,
    color: tc.color,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  empty: {
    paddingTop: spacing["4xl"],
    alignItems: "center",
  },
  emptyText: {
    ...typography.body,
    color: t.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(28,25,23,0.4)",
  },
  modalContent: {
    backgroundColor: t.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing["2xl"],
    paddingBottom: spacing["4xl"],
    ...shadows.elevated,
  } as ViewStyle,
  modalTitle: {
    ...typography.heading,
    color: t.textPrimary,
  },
  modalAddress: {
    ...typography.caption,
    color: t.textSecondary,
    marginTop: spacing.xs,
  },
  modalDetail: {
    ...typography.caption,
    color: t.textMuted,
    marginTop: spacing.xs,
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  checkinBtn: {
    flex: 1,
    backgroundColor: tc.color,
    borderRadius: radii.md,
    padding: spacing.lg,
    alignItems: "center",
  },
  checkinBtnDone: {
    backgroundColor: t.surfaceSunken,
    borderWidth: 1,
    borderColor: t.border,
  },
  checkinText: {
    color: t.textInverse,
    fontWeight: "600",
  },
  checkinTextDone: {
    color: t.textMuted,
  },
  closeBtn: {
    flex: 1,
    backgroundColor: t.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: t.border,
  },
  closeBtnText: {
    color: t.textSecondary,
    fontWeight: "600",
  },
});
