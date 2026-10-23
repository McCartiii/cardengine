import React, { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Image } from "expo-image";
import { color, radius, space } from "@/design/tokens";
import { formatUsd } from "@/design/format";
import { getCollectionValue, getProfile } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { ListGroup, ListRow, PageHeader, Screen, SkeletonBlock, Text, Touchable } from "@/ui";

interface Profile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, session, signOut } = useAuthStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<{ value: number; cards: number } | null>(null);
  const [loading, setLoading] = useState(!!session);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;
      Promise.allSettled([getProfile(), getCollectionValue()]).then(([p, v]) => {
        if (cancelled) return;
        if (p.status === "fulfilled") setProfile(p.value);
        if (v.status === "fulfilled") setStats({ value: v.value.totalValue, cards: v.value.cardCount });
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [session])
  );

  const displayName = profile?.displayName ?? user?.email?.split("@")[0] ?? "Guest";
  const memberSince = profile
    ? new Date(profile.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  const confirmSignOut = () =>
    Alert.alert("Sign out?", "Your collection stays saved to your account.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => signOut() },
    ]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <PageHeader title="Profile" back />

        <View style={styles.identity}>
          {profile?.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text variant="headline" color={color.onAccent}>
                {displayName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text variant="headline" numberOfLines={1}>
              {displayName}
            </Text>
            <Text variant="callout" color={color.textSecondary} numberOfLines={1}>
              {session ? user?.email ?? "" : "Browsing without an account"}
            </Text>
            {memberSince && (
              <Text variant="caption" color={color.textTertiary}>
                Member since {memberSince}
              </Text>
            )}
          </View>
        </View>

        {session && (
          <View style={styles.stats}>
            {loading ? (
              <>
                <SkeletonBlock height={84} style={{ flex: 1 }} />
                <SkeletonBlock height={84} style={{ flex: 1 }} />
              </>
            ) : (
              <>
                <Stat label="Collection value" value={formatUsd(stats?.value ?? 0)} onPress={() => router.navigate("/(tabs)/collection")} />
                <Stat label="Cards" value={String(stats?.cards ?? 0)} onPress={() => router.navigate("/(tabs)/collection")} />
              </>
            )}
          </View>
        )}

        <Text variant="label" color={color.textTertiary} style={styles.groupLabel}>
          Tools
        </Text>
        <View style={styles.section}>
          <ListGroup>
            <ListRow icon="notifications-outline" title="Price alerts" subtitle="Get notified when prices move" onPress={() => router.push("/alerts")} />
            <ListRow icon="heart-outline" title="Life counter" subtitle="Track life, poison and commander damage" onPress={() => router.push("/life")} />
            <ListRow icon="storefront-outline" title="Local shops" subtitle="Find game stores near you" onPress={() => router.push("/shops")} />
          </ListGroup>
        </View>

        <Text variant="label" color={color.textTertiary} style={styles.groupLabel}>
          Account
        </Text>
        <View style={styles.section}>
          <ListGroup>
            {session ? (
              <ListRow icon="log-out-outline" title="Sign out" destructive onPress={confirmSignOut} />
            ) : (
              <ListRow icon="log-in-outline" title="Sign in" subtitle="Save your collection and decks" onPress={() => router.push("/(auth)/sign-in")} />
            )}
          </ListGroup>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} style={styles.stat} accessibilityRole="button">
      <Text variant="label" color={color.textTertiary}>
        {label}
      </Text>
      <Text variant="price" style={{ fontSize: 22, lineHeight: 28, marginTop: space.xs }}>
        {value}
      </Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: space.xxxl * 2 },
  section: { paddingHorizontal: space.lg },
  identity: { flexDirection: "row", alignItems: "center", gap: space.lg, paddingHorizontal: space.lg, marginTop: space.sm },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarFallback: { backgroundColor: color.accent, alignItems: "center", justifyContent: "center" },
  stats: { flexDirection: "row", gap: space.md, paddingHorizontal: space.lg, marginTop: space.xxl },
  stat: { flex: 1, padding: space.lg, borderRadius: radius.lg, backgroundColor: color.surface },
  groupLabel: { paddingHorizontal: space.lg + space.xs, marginTop: space.xxl, marginBottom: space.sm },
});
