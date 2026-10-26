import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Linking, Platform, RefreshControl, StyleSheet, View } from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { color, radius, space, TAB_BAR_CLEARANCE } from "@/design/tokens";
import { getNearbyShops, type Shop } from "@/lib/api";
import { Card, EmptyState, IconBubble, PageHeader, Screen, SearchField, SkeletonBlock, Text, Touchable } from "@/ui";

const LOCATION_TIMEOUT_MS = 8000;

function formatDistance(mi: number | null | undefined): string | null {
  if (mi == null) return null;
  if (mi < 0.1) return "< 0.1 mi";
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** The phone's position, or null if it's off, denied or too slow. Never hangs. */
async function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { status } = await withTimeout(Location.requestForegroundPermissionsAsync(), LOCATION_TIMEOUT_MS) ?? { status: "timeout" };
    if (status !== "granted") return null;
    const pos =
      (await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), LOCATION_TIMEOUT_MS)) ??
      (await Location.getLastKnownPositionAsync().catch(() => null));
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

function openMaps(shop: Shop) {
  const addr = [shop.address, shop.city, shop.state, shop.zip].filter(Boolean).join(", ");
  const query = encodeURIComponent(addr || shop.name);
  const url = Platform.OS === "ios" ? `maps:?q=${query}` : Platform.OS === "android" ? `geo:0,0?q=${query}` : `https://maps.google.com/?q=${query}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://maps.google.com/?q=${query}`));
}

function Action({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} style={styles.action} accessibilityRole="button">
      <Ionicons name={icon} size={15} color={color.ink} />
      <Text variant="callout">{label}</Text>
    </Touchable>
  );
}

export default function ShopsScreen() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [located, setLocated] = useState<boolean | null>(null);
  const [city, setCity] = useState("");
  const seq = useRef(0);

  const load = useCallback(async (cityQuery?: string) => {
    const n = ++seq.current;
    try {
      let params: Parameters<typeof getNearbyShops>[0] = {};
      if (cityQuery) {
        params = { city: cityQuery };
      } else {
        const pos = await currentPosition();
        if (n !== seq.current) return;
        setLocated(!!pos);
        if (pos) params = { ...pos, radius: 50 };
      }
      const res = await getNearbyShops(params);
      if (n !== seq.current) return;
      setShops(res?.shops ?? []);
      setStatus("ready");
    } catch {
      if (n === seq.current) setStatus("error");
    } finally {
      if (n === seq.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Searching by city replaces the nearby list; clearing it goes back to nearby.
  useEffect(() => {
    const q = city.trim();
    if (status === "loading") return;
    const t = setTimeout(() => load(q.length >= 2 ? q : undefined), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  const subtitle = city.trim().length >= 2 ? `In “${city.trim()}”` : located ? "Near you" : located === false ? "Location off · showing all shops" : undefined;

  const renderShop = ({ item }: { item: Shop }) => {
    const distance = formatDistance(item.distance);
    const where = [item.address, item.city, item.state].filter(Boolean).join(", ");
    return (
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <IconBubble icon="storefront" tint="green" size={44} />
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text variant="headline" numberOfLines={1} style={{ flexShrink: 1 }}>
                {item.name}
              </Text>
              {item.verified && <Ionicons name="checkmark-circle" size={15} color={color.accent} />}
            </View>
            {!!where && (
              <Text variant="callout" color={color.textSecondary} numberOfLines={2}>
                {where}
              </Text>
            )}
          </View>
          {distance && (
            <View style={styles.distance}>
              <Text variant="number" color={color.accent}>
                {distance}
              </Text>
            </View>
          )}
        </View>
        {!!item.hours && (
          <View style={styles.hours}>
            <Ionicons name="time-outline" size={14} color={color.textTertiary} />
            <Text variant="caption" color={color.textSecondary} style={{ flex: 1 }}>
              {item.hours}
            </Text>
          </View>
        )}
        <View style={styles.actions}>
          {(item.address || item.city) && <Action icon="navigate" label="Directions" onPress={() => openMaps(item)} />}
          {item.website && <Action icon="globe-outline" label="Website" onPress={() => Linking.openURL(item.website!)} />}
          {item.phone && <Action icon="call" label="Call" onPress={() => Linking.openURL(`tel:${item.phone}`)} />}
        </View>
      </Card>
    );
  };

  const header = (
    <View>
      <PageHeader title="Local shops" subtitle={subtitle} back />
      <SearchField value={city} onChangeText={setCity} placeholder="Search a city" style={{ marginHorizontal: space.lg, marginBottom: space.lg }} />
    </View>
  );

  return (
    <Screen>
      {status === "loading" ? (
        <>
          {header}
          <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
            <Text variant="callout" color={color.textSecondary}>
              Finding shops near you…
            </Text>
            <SkeletonBlock height={132} />
            <SkeletonBlock height={132} />
          </View>
        </>
      ) : (
        <FlatList
          data={shops}
          keyExtractor={(s) => s.id}
          renderItem={renderShop}
          ListHeaderComponent={header}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
          ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(city.trim().length >= 2 ? city.trim() : undefined);
              }}
              tintColor={color.textSecondary}
            />
          }
          ListEmptyComponent={
            status === "error" ? (
              <EmptyState icon="cloud-offline-outline" tint="green" title="Couldn't load shops" body="Check your connection and try again." action="Retry" onAction={() => load()} />
            ) : (
              <EmptyState icon="storefront" tint="green" title="No shops found" body="Try searching a nearby city." />
            )
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: space.lg, padding: space.lg, gap: space.md },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: space.md },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  distance: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: color.accentSoft },
  hours: { flexDirection: "row", alignItems: "center", gap: 6 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  action: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: color.surface2 },
});
