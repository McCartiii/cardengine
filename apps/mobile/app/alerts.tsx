import React, { useCallback, useState } from "react";
import { Alert, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Switch, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { color, radius, space, TAB_BAR_CLEARANCE } from "@/design/tokens";
import { formatUsd } from "@/design/format";
import { deleteWatchlistEntry, getWatchlist, toggleWatchlistEntry, type WatchlistEntry } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useSettings } from "@/store/settingsStore";
import { enablePush, showDenied } from "@/lib/push";
import { Card, CardArt, EmptyState, PageHeader, Screen, SkeletonBlock, Text, Touchable } from "@/ui";

const pushSupported = Platform.OS === "ios" || Platform.OS === "android";

function priceStatus(entry: WatchlistEntry): { triggered: boolean; label: string } {
  const { currentPrice, thresholdAmount, direction } = entry;
  if (currentPrice == null) return { triggered: false, label: "No price yet" };
  const triggered = direction === "above" ? currentPrice >= thresholdAmount : currentPrice <= thresholdAmount;
  const diff = formatUsd(Math.abs(currentPrice - thresholdAmount));
  if (triggered) return { triggered, label: `Hit · ${diff} ${direction}` };
  return { triggered, label: `${diff} to go` };
}

export default function AlertsScreen() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const pushAlerts = useSettings((s) => s.pushAlerts);
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) {
      setStatus("ready");
      return;
    }
    try {
      const res = await getWatchlist();
      setEntries(res?.entries ?? []);
      setStatus("ready");
    } catch {
      setStatus((s) => (s === "loading" ? "error" : s));
    } finally {
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggle = async (entry: WatchlistEntry, enabled: boolean) => {
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, enabled } : e)));
    try {
      await toggleWatchlistEntry(entry.id, enabled);
    } catch {
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, enabled: !enabled } : e)));
    }
  };

  const remove = (entry: WatchlistEntry) => {
    Alert.alert("Remove alert?", `Stop watching ${entry.cardName}.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setEntries((prev) => prev.filter((e) => e.id !== entry.id));
          try {
            await deleteWatchlistEntry(entry.id);
          } catch {
            load();
          }
        },
      },
    ]);
  };

  const triggered = entries.filter((e) => e.enabled && priceStatus(e).triggered).length;
  const subtitle = entries.length
    ? `${entries.length} watching${triggered ? ` · ${triggered} hit` : ""}`
    : undefined;

  const renderEntry = ({ item }: { item: WatchlistEntry }) => {
    const s = priceStatus(item);
    const hit = s.triggered && item.enabled;
    const up = item.direction === "above";
    return (
      <Touchable
        onPress={() => router.push({ pathname: "/card/[id]", params: { id: item.variantId } })}
        pressedScale={0.99}
        accessibilityRole="button"
        accessibilityLabel={`${item.cardName}, alert when ${item.direction} ${formatUsd(item.thresholdAmount)}`}
        style={{ marginHorizontal: space.lg }}
      >
        <Card style={[styles.row, hit && styles.rowHit, !item.enabled && { opacity: 0.6 }]}>
          <View style={styles.thumb}>
            <CardArt uri={item.imageUri} name={item.cardName} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="headline" numberOfLines={1}>
              {item.cardName}
            </Text>
            <View style={styles.target}>
              <Ionicons name={up ? "trending-up" : "trending-down"} size={14} color={up ? color.positive : color.negative} />
              <Text variant="callout" color={color.textSecondary}>
                {up ? "Above" : "Below"} {formatUsd(item.thresholdAmount)}
              </Text>
            </View>
            <View style={styles.priceRow}>
              <Text variant="price">{item.currentPrice != null ? formatUsd(item.currentPrice) : "—"}</Text>
              <View style={[styles.statusPill, { backgroundColor: hit ? color.accentSoft : color.surface2 }]}>
                {hit && <Ionicons name="notifications" size={11} color={color.accent} />}
                <Text variant="caption" color={hit ? color.accent : color.textSecondary}>
                  {s.label}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.actions}>
            <Switch
              value={item.enabled}
              onValueChange={(v) => toggle(item, v)}
              trackColor={{ false: color.surface3, true: color.accent }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={color.surface3}
              accessibilityLabel={item.enabled ? "Pause alert" : "Turn alert on"}
            />
            <Pressable onPress={() => remove(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove alert">
              <Ionicons name="trash-outline" size={18} color={color.textTertiary} />
            </Pressable>
          </View>
        </Card>
      </Touchable>
    );
  };

  const showPushBanner = !!session && entries.length > 0 && pushAlerts !== true && pushSupported;
  const header = (
    <View>
      <PageHeader title="Price alerts" subtitle={subtitle} back />
      {showPushBanner && (
        <Card style={styles.banner}>
          <View style={styles.bannerIcon}>
            <Ionicons name="notifications" size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Get a notification when these hit</Text>
            <Text variant="caption" color={color.textSecondary}>
              Otherwise you'll only see it here.
            </Text>
          </View>
          <Touchable
            onPress={async () => {
              const r = await enablePush();
              if (!r.ok) r.reason === "denied" ? showDenied() : Alert.alert("Couldn't turn on notifications", r.message);
            }}
            style={styles.bannerBtn}
            accessibilityRole="button"
          >
            <Text variant="callout" color="#FFFFFF">
              Turn on
            </Text>
          </Touchable>
        </Card>
      )}
    </View>
  );

  if (status === "loading") {
    return (
      <Screen>
        {header}
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          <SkeletonBlock height={104} />
          <SkeletonBlock height={104} />
          <SkeletonBlock height={104} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        renderItem={renderEntry}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        style={{ flex: 1 }}
        refreshControl={
          session ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={color.textSecondary}
            />
          ) : undefined
        }
        ListEmptyComponent={
          status === "error" ? (
            <EmptyState icon="cloud-offline-outline" tint="orange" title="Couldn't load your alerts" body="Check your connection and try again." action="Retry" onAction={load} />
          ) : !session ? (
            <EmptyState icon="notifications" tint="orange" title="Sign in for price alerts" body="We'll watch prices and tell you when a card hits your target." action="Sign in" onAction={() => router.push("/(auth)/sign-in")} />
          ) : (
            <EmptyState
              icon="notifications"
              tint="orange"
              title="No alerts yet"
              body="Open any card and tap the bell to set a price target."
              action="Find a card"
              onAction={() => router.push("/(tabs)/search")}
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  rowHit: { borderColor: color.accent, borderWidth: 1.5 },
  thumb: { width: 52, borderRadius: 4, overflow: "hidden" },
  target: { flexDirection: "row", alignItems: "center", gap: 4 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 4 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  actions: { alignItems: "center", gap: space.md },
  banner: { flexDirection: "row", alignItems: "center", gap: space.md, marginHorizontal: space.lg, marginBottom: space.lg, padding: space.md },
  bannerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: color.accent },
  bannerBtn: { height: 36, paddingHorizontal: 14, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: color.ink },
});
