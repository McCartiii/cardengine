import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getProfile } from "@/lib/api";
import { COLORS } from "@/lib/constants";

interface Profile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  minorSafe: boolean;
  createdAt: string;
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProfile()
      .then(setProfile)
      .catch((e) => setError(e.message ?? "Failed to load profile"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (error || !profile) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? "Not signed in"}</Text>
          <Text style={styles.errorSub}>Sign in to track your collection across devices.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const memberSince = new Date(profile.createdAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <View style={styles.card}>
        {profile.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>
              {(profile.displayName ?? "?").charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        <Text style={styles.displayName}>
          {profile.displayName ?? "Anonymous Collector"}
        </Text>
        <Text style={styles.memberSince}>Member since {memberSince}</Text>

        {profile.minorSafe && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Safe Mode On</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Links</Text>
        <TouchableOpacity style={styles.row}>
          <Text style={styles.rowText}>Price Alerts</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row}>
          <Text style={styles.rowText}>Deck Suggestions</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row}>
          <Text style={styles.rowText}>Nearby Shops</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  errorText: { color: COLORS.textMuted, fontSize: 16, textAlign: "center" },
  errorSub: { color: COLORS.border, fontSize: 13, textAlign: "center", lineHeight: 20 },
  card: {
    margin: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  avatar: { width: 72, height: 72, borderRadius: 36, marginBottom: 4 },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarInitial: { color: "#fff", fontSize: 30, fontWeight: "700" },
  displayName: { color: COLORS.text, fontSize: 20, fontWeight: "700" },
  memberSince: { color: COLORS.textMuted, fontSize: 13 },
  badge: {
    marginTop: 4,
    backgroundColor: "rgba(34,197,94,0.15)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.3)",
  },
  badgeText: { color: COLORS.success, fontSize: 12, fontWeight: "600" },
  section: { paddingHorizontal: 16, gap: 2 },
  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  row: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 2,
  },
  rowText: { color: COLORS.text, fontSize: 15 },
  rowChevron: { color: COLORS.textMuted, fontSize: 20, lineHeight: 22 },
});
