import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Switch,
  ScrollView,
  Alert,
  type ViewStyle,
} from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { colors, spacing, radii, typography, shadows, tabColors } from "../../theme";
import { Header } from "../../components/ui/Header";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";

const t = colors.light;
const tc = tabColors.profile;
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

export function ProfileTab() {
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [minorSafe, setMinorSafe] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      try {
        const res = await fetch(`${API_URL}/v1/profile`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setDisplayName(data.displayName ?? "");
          setDateOfBirth(data.dateOfBirth?.split("T")[0] ?? "");
          setMinorSafe(data.minorSafe ?? true);
        }
      } catch {
        // Offline
      }
    }
    loadProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const res = await fetch(`${API_URL}/v1/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          displayName: displayName || null,
          dateOfBirth: dateOfBirth || null,
          minorSafe,
        }),
      });
      if (res.ok) {
        Alert.alert("Saved", "Profile updated.");
      }
    } catch {
      Alert.alert("Error", "Failed to save profile.");
    }
    setSaving(false);
  };

  return (
    <ScrollView style={styles.container}>
      <Header title="Profile" />

      {/* Avatar card */}
      <Card style={styles.avatarCard}>
        <View style={styles.avatarRing}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(displayName || user?.email)?.[0]?.toUpperCase() ?? "?"}
            </Text>
          </View>
        </View>
        <Text style={styles.email}>{user?.email ?? "Unknown"}</Text>
        <Text style={styles.userId}>ID: {user?.id?.slice(0, 8)}...</Text>
      </Card>

      {/* Profile settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile Settings</Text>

        <Card style={styles.fieldCard}>
          <Text style={styles.fieldLabel}>Display Name</Text>
          <TextInput
            style={styles.fieldInput}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your display name"
            placeholderTextColor={t.textMuted}
          />
        </Card>

        <Card style={styles.fieldCard}>
          <Text style={styles.fieldLabel}>Date of Birth</Text>
          <TextInput
            style={styles.fieldInput}
            value={dateOfBirth}
            onChangeText={setDateOfBirth}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={t.textMuted}
          />
          <Text style={styles.fieldHint}>
            Used for minor-safe mode. Under-18 users get restricted content.
          </Text>
        </Card>

        <Card style={styles.toggleCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Minor-Safe Mode</Text>
            <Text style={styles.fieldHint}>
              Hides links, disables DMs, and filters content.
            </Text>
          </View>
          <Switch
            value={minorSafe}
            onValueChange={setMinorSafe}
            trackColor={{ false: t.border, true: tc.color }}
            thumbColor={t.surface}
          />
        </Card>

        {minorSafe && (
          <View style={styles.minorBanner}>
            <Text style={styles.minorBannerText}>
              Minor-safe mode is active. Links are hidden and content is
              filtered.
            </Text>
          </View>
        )}

        <Button
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          size="lg"
          style={styles.saveButton}
        >
          Save Profile
        </Button>
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={{ height: spacing["4xl"] }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  avatarCard: {
    alignItems: "center",
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingVertical: spacing["2xl"],
  } as ViewStyle,
  avatarRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: t.accent,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: t.accentLight,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    ...typography.title,
    color: t.accent,
  },
  email: {
    ...typography.body,
    fontWeight: "600",
    color: t.textPrimary,
  },
  userId: {
    ...typography.small,
    color: t.textMuted,
    marginTop: spacing.xs,
  },
  section: {
    marginTop: spacing["2xl"],
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    ...typography.label,
    color: t.textMuted,
    marginBottom: spacing.sm,
  },
  fieldCard: {
    marginBottom: spacing.sm,
  } as ViewStyle,
  fieldLabel: {
    ...typography.caption,
    fontWeight: "600",
    color: t.textSecondary,
    marginBottom: spacing.sm,
  },
  fieldInput: {
    backgroundColor: t.surfaceSunken,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: t.textPrimary,
  },
  fieldHint: {
    ...typography.small,
    color: t.textMuted,
    marginTop: spacing.xs,
  },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
    gap: spacing.md,
  } as ViewStyle,
  minorBanner: {
    backgroundColor: t.warningLight,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: t.warning,
  },
  minorBannerText: {
    ...typography.small,
    color: t.warningText,
  },
  saveButton: {
    marginTop: spacing.sm,
    width: "100%",
  } as ViewStyle,
  signOutButton: {
    marginHorizontal: spacing.lg,
    marginTop: spacing["3xl"],
    backgroundColor: t.surface,
    borderWidth: 1.5,
    borderColor: t.danger,
    borderRadius: radii.md,
    padding: spacing.lg,
    alignItems: "center",
    ...shadows.card,
  } as ViewStyle,
  signOutText: {
    color: t.danger,
    fontSize: 16,
    fontWeight: "600",
  },
});
