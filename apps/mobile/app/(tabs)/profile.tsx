import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/lib/constants";
import { getProfile, getCollectionValue } from "@/lib/api";
import { useAuthStore } from "../../src/store/authStore";

interface Profile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  minorSafe: boolean;
  createdAt: string;
}

const QUICK_LINKS = [
  { icon: "notifications", label: "Price Alerts", sub: "Watchlist & notifications", route: "/(tabs)/watchlist" },
  { icon: "layers", label: "My Decks", sub: "Build and manage decklists", route: "/(tabs)/decks" },
  { icon: "storefront", label: "Nearby Shops", sub: "Find local game stores", route: "/(tabs)/shops" },
  { icon: "search", label: "Browse Cards", sub: "Search & discover cards", route: "/(tabs)/browse" },
] as const;

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [collectionValue, setCollectionValue] = useState<number | null>(null);
  const [cardCount, setCardCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getProfile(), getCollectionValue()])
      .then(([p, v]) => {
        if (cancelled) return;
        setProfile(p);
        setCollectionValue(v.totalValue);
        setCardCount(v.cardCount);
      })
      .catch(() => null)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []));

  const handleSignOut = () => {
    Alert.alert("Sign out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => signOut() },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator color={COLORS.accent} size="large" /></View>
      </SafeAreaView>
    );
  }

  const displayName = profile?.displayName ?? user?.email?.split("@")[0] ?? "Collector";
  const memberSince = profile
    ? new Date(profile.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>

        {/* Avatar card */}
        <View style={styles.avatarCard}>
          {profile?.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{displayName.slice(0, 2).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.avatarInfo}>
            <Text style={styles.displayName}>{displayName}</Text>
            {user?.email && <Text style={styles.email}>{user.email}</Text>}
            {memberSince && <Text style={styles.memberSince}>Member since {memberSince}</Text>}
          </View>
        </View>

        {/* Collection stats */}
        <View style={styles.statsRow}>
          <TouchableOpacity style={styles.statCard} onPress={() => router.push("/(tabs)/collection" as never)}>
            <Text style={styles.statValue}>{cardCount ?? 0}</Text>
            <Text style={styles.statLabel}>Unique Cards</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={() => router.push("/(tabs)/collection" as never)}>
            <Text style={[styles.statValue, { color: COLORS.accent }]}>
              ${(collectionValue ?? 0).toFixed(2)}
            </Text>
            <Text style={styles.statLabel}>Collection Value</Text>
          </TouchableOpacity>
        </View>

        {/* Quick links */}
        <Text style={styles.sectionLabel}>Quick Access</Text>
        <View style={styles.linksContainer}>
          {QUICK_LINKS.map((link, i) => (
            <TouchableOpacity
              key={link.route}
              style={[styles.linkRow, i < QUICK_LINKS.length - 1 && styles.linkRowBorder]}
              onPress={() => router.push(link.route as never)}
            >
              <View style={styles.linkIconWrap}>
                <Ionicons name={link.icon as never} size={20} color={COLORS.accent} />
              </View>
              <View style={styles.linkText}>
                <Text style={styles.linkLabel}>{link.label}</Text>
                <Text style={styles.linkSub}>{link.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Account info */}
        {profile && (
          <>
            <Text style={styles.sectionLabel}>Account</Text>
            <View style={styles.linksContainer}>
              <View style={styles.accountRow}>
                <Text style={styles.accountLabel}>User ID</Text>
                <Text style={styles.accountValue} numberOfLines={1}>{profile.id.slice(0, 20)}…</Text>
              </View>
              {profile.minorSafe && (
                <View style={[styles.accountRow, styles.accountRowBorder]}>
                  <Text style={styles.accountLabel}>Safe Mode</Text>
                  <View style={styles.safeBadge}><Text style={styles.safeBadgeText}>Enabled</Text></View>
                </View>
              )}
            </View>
          </>
        )}

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color="#E74C3C" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, paddingBottom: 48, gap: 12 },
  header: { marginBottom: 4 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  avatarCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16,
    flexDirection: "row", alignItems: "center", gap: 14,
    borderWidth: 1, borderColor: COLORS.border ?? "#222",
  },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarPlaceholder: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center",
  },
  avatarInitials: { color: "#fff", fontSize: 24, fontWeight: "800" },
  avatarInfo: { flex: 1, gap: 3 },
  displayName: { color: COLORS.text, fontSize: 18, fontWeight: "700" },
  email: { color: COLORS.textMuted, fontSize: 13 },
  memberSince: { color: COLORS.textMuted, fontSize: 12 },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 16,
    alignItems: "center", gap: 4, borderWidth: 1, borderColor: COLORS.border ?? "#222",
  },
  statValue: { color: COLORS.text, fontSize: 22, fontWeight: "900" },
  statLabel: { color: COLORS.textMuted, fontSize: 12 },
  sectionLabel: {
    color: COLORS.textMuted, fontSize: 12, fontWeight: "700",
    textTransform: "uppercase", letterSpacing: 1, marginTop: 4,
  },
  linksContainer: {
    backgroundColor: COLORS.surface, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border ?? "#222", overflow: "hidden",
  },
  linkRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  linkRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border ?? "#222" },
  linkIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: `${COLORS.accent}22`, alignItems: "center", justifyContent: "center",
  },
  linkText: { flex: 1 },
  linkLabel: { color: COLORS.text, fontSize: 15, fontWeight: "600" },
  linkSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 1 },
  accountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  accountRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.border ?? "#222" },
  accountLabel: { color: COLORS.textMuted, fontSize: 14 },
  accountValue: { color: COLORS.text, fontSize: 12, fontFamily: "monospace", flex: 1, textAlign: "right", marginLeft: 8 },
  safeBadge: {
    backgroundColor: "rgba(34,197,94,0.15)", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "rgba(34,197,94,0.3)",
  },
  safeBadgeText: { color: "#22C55E", fontSize: 12, fontWeight: "600" },
  signOutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, padding: 14, borderRadius: 14, marginTop: 8,
    borderWidth: 1, borderColor: "#E74C3C33", backgroundColor: "#E74C3C11",
  },
  signOutText: { color: "#E74C3C", fontWeight: "700", fontSize: 15 },
});
