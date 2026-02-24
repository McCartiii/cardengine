import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../src/lib/constants";
import { getNearbyShops, type Shop } from "../../src/lib/api";

function formatDistance(mi: number | null): string {
  if (mi == null) return "";
  if (mi < 0.1) return "< 0.1 mi";
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

export default function ShopsScreen() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError("Location permission denied. Showing all shops.");
        const { shops: s } = await getNearbyShops({});
        setShops(s);
        return;
      }
      setLocationError(null);
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { shops: s } = await getNearbyShops({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        radius: 50,
      });
      setShops(s);
    } catch {
      setLocationError("Could not load shops. Check your connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openMaps = (shop: Shop) => {
    const addr = [shop.address, shop.city, shop.state, shop.zip].filter(Boolean).join(", ");
    const query = encodeURIComponent(addr || shop.name);
    const url = Platform.OS === "ios"
      ? `maps:?q=${query}`
      : `geo:0,0?q=${query}`;
    Linking.openURL(url).catch(() => Linking.openURL(`https://maps.google.com/?q=${query}`));
  };

  const renderShop = ({ item }: { item: Shop }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconWrap}>
          <Ionicons name="storefront-outline" size={22} color={COLORS.accent} />
        </View>
        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.shopName}>{item.name}</Text>
            {item.verified && (
              <Ionicons name="checkmark-circle" size={14} color={COLORS.accent} style={{ marginLeft: 4, marginTop: 2 }} />
            )}
          </View>
          {item.address && (
            <Text style={styles.address}>{[item.address, item.city, item.state].filter(Boolean).join(", ")}</Text>
          )}
          {item.distance != null && (
            <Text style={styles.distance}>{formatDistance(item.distance)}</Text>
          )}
        </View>
      </View>

      {item.hours && (
        <View style={styles.hoursRow}>
          <Ionicons name="time-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.hours}>{item.hours}</Text>
        </View>
      )}

      <View style={styles.actions}>
        {item.address && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => openMaps(item)}>
            <Ionicons name="navigate-outline" size={16} color={COLORS.accent} />
            <Text style={styles.actionText}>Directions</Text>
          </TouchableOpacity>
        )}
        {item.website && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(item.website!)}>
            <Ionicons name="globe-outline" size={16} color={COLORS.accent} />
            <Text style={styles.actionText}>Website</Text>
          </TouchableOpacity>
        )}
        {item.phone && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(`tel:${item.phone}`)}>
            <Ionicons name="call-outline" size={16} color={COLORS.accent} />
            <Text style={styles.actionText}>Call</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {locationError && (
        <View style={styles.banner}>
          <Ionicons name="location-outline" size={16} color={COLORS.textMuted} />
          <Text style={styles.bannerText}>{locationError}</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={COLORS.accent} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={shops}
          keyExtractor={(s) => s.id}
          renderItem={renderShop}
          contentContainerStyle={shops.length === 0 ? styles.emptyContainer : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.accent} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="storefront-outline" size={56} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No shops nearby</Text>
              <Text style={styles.emptyHint}>Try expanding your search radius</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.surface,
    padding: 10,
    paddingHorizontal: 16,
  },
  bannerText: { color: COLORS.textMuted, fontSize: 13, flex: 1 },
  list: { padding: 16, gap: 12 },
  emptyContainer: { flex: 1 },
  card: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, gap: 10 },
  cardHeader: { flexDirection: "row", gap: 12 },
  iconWrap: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: COLORS.background,
    alignItems: "center", justifyContent: "center",
  },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center" },
  shopName: { color: COLORS.text, fontSize: 16, fontWeight: "700", flex: 1 },
  address: { color: COLORS.textMuted, fontSize: 13, marginTop: 2 },
  distance: { color: COLORS.accent, fontSize: 12, fontWeight: "600", marginTop: 2 },
  hoursRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  hours: { color: COLORS.textMuted, fontSize: 13, flex: 1 },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: COLORS.background,
  },
  actionText: { color: COLORS.accent, fontSize: 13, fontWeight: "600" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, marginTop: 100 },
  emptyTitle: { color: COLORS.text, fontSize: 20, fontWeight: "700" },
  emptyHint: { color: COLORS.textMuted, fontSize: 14 },
});
