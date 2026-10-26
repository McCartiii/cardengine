import React, { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Linking, ScrollView, StyleSheet, Switch, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Constants from "expo-constants";
import { color, elevation, hairline, radius, space } from "@/design/tokens";
import { font } from "@/design/fonts";
import { CURRENCIES, formatUsd } from "@/design/format";
import { deleteAccount, getProfile, sendTestPush, updateProfile } from "@/lib/api";
import { disablePush, enablePush, pushPermission, showDenied } from "@/lib/push";
import { useAuthStore } from "@/store/authStore";
import { useSettings } from "@/store/settingsStore";
import { Button, Chip, IconBubble, ListGroup, ListRow, PageHeader, Screen, Sheet, Text } from "@/ui";

type Permission = Awaited<ReturnType<typeof pushPermission>>;

export default function SettingsScreen() {
  const router = useRouter();
  const { session, user, signOut } = useAuthStore();
  const settings = useSettings();
  const [permission, setPermission] = useState<Permission>("undetermined");
  const [pushBusy, setPushBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [draft, setDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const checkPermission = useCallback(() => {
    pushPermission()
      .then(setPermission)
      .catch(() => setPermission("unavailable"));
  }, []);

  useFocusEffect(checkPermission);

  // Coming back from the phone's Settings app may have changed the permission.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && checkPermission());
    return () => sub.remove();
  }, [checkPermission]);

  useEffect(() => {
    if (!session) return;
    getProfile()
      .then((p) => setName(p.displayName))
      .catch(() => {});
  }, [session]);

  const pushOn = settings.pushAlerts === true && permission === "granted";

  const togglePush = async (on: boolean) => {
    setPushBusy(true);
    try {
      if (!on) {
        await disablePush();
        return;
      }
      const r = await enablePush();
      if (!r.ok) {
        if (r.reason === "denied") showDenied();
        else Alert.alert("Couldn't turn on notifications", r.message);
      }
    } finally {
      checkPermission();
      setPushBusy(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      await sendTestPush();
    } catch (e) {
      Alert.alert("No notification sent", (e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const saveName = async () => {
    const next = draft.trim() || null;
    setSavingName(true);
    try {
      await updateProfile({ displayName: next });
      setName(next);
      setEditingName(false);
    } catch (e) {
      Alert.alert("Couldn't save your name", (e as Error).message);
    } finally {
      setSavingName(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      "Delete your account?",
      "Your collection, decks, price alerts and profile are deleted for good. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete everything",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              await signOut().catch(() => {});
              router.replace("/(auth)/sign-in");
            } catch (e) {
              Alert.alert("Couldn't delete your account", (e as Error).message);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );

  const pushSubtitle =
    permission === "unavailable"
      ? "Needs the app on a real phone"
      : permission === "denied"
        ? "Turned off in your phone's Settings"
        : pushOn
          ? "We'll tell you when a card hits your price"
          : "Get a notification when an alert hits";

  const version = Constants.expoConfig?.version ?? "1.0.0";
  const sample = formatUsd(54.2);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <PageHeader title="Settings" back />

        <GroupLabel>Prices</GroupLabel>
        <View style={[styles.section, styles.card]}>
          <View style={styles.cardHead}>
            <IconBubble icon="cash" tint="green" size={36} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Currency</Text>
              <Text variant="caption" color={color.textSecondary}>
                Prices show like {sample}
              </Text>
            </View>
          </View>
          <View style={styles.chips}>
            {CURRENCIES.map((c) => (
              <Chip key={c.code} label={`${c.symbol} ${c.code}`} active={settings.currency === c.code} onPress={() => settings.setCurrency(c.code)} />
            ))}
          </View>
          {settings.currency !== "USD" && (
            <Text variant="caption" color={color.textTertiary}>
              Converted from US market prices at today's exchange rate. Store prices on a card's page stay in the store's own currency.
            </Text>
          )}
        </View>

        <GroupLabel>Notifications</GroupLabel>
        <View style={styles.section}>
          <ListGroup>
            <SwitchRow
              icon="notifications"
              tint="orange"
              title="Price alerts"
              subtitle={pushSubtitle}
              value={pushOn}
              disabled={pushBusy || permission === "unavailable"}
              onChange={togglePush}
            />
            {permission === "denied" && <ListRow icon="settings-outline" tint="blue" title="Open phone Settings" onPress={() => Linking.openSettings()} />}
            {pushOn && session && <ListRow icon="paper-plane" tint="violet" title={testing ? "Sending…" : "Send a test notification"} onPress={testing ? undefined : test} />}
            <ListRow icon="list" tint="teal" title="Your price alerts" onPress={() => router.push("/alerts")} />
          </ListGroup>
        </View>

        <GroupLabel>Feel</GroupLabel>
        <View style={styles.section}>
          <ListGroup>
            <SwitchRow icon="pulse" tint="pink" title="Haptics" subtitle="Little taps when you press things" value={settings.haptics} onChange={settings.setHaptics} />
          </ListGroup>
        </View>

        <GroupLabel>Account</GroupLabel>
        <View style={styles.section}>
          {session ? (
            <ListGroup>
              <ListRow
                icon="person"
                tint="violet"
                title="Name"
                value={name ?? user?.email?.split("@")[0] ?? ""}
                onPress={() => {
                  setDraft(name ?? "");
                  setEditingName(true);
                }}
              />
              <ListRow icon="mail" tint="blue" title="Email" value={user?.email ?? ""} />
              <ListRow
                icon="log-out-outline"
                title="Sign out"
                destructive
                onPress={() =>
                  Alert.alert("Sign out?", "Your collection stays saved to your account.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Sign out", style: "destructive", onPress: () => signOut() },
                  ])
                }
              />
              <ListRow icon="trash-outline" title={deleting ? "Deleting…" : "Delete account"} destructive onPress={deleting ? undefined : confirmDelete} />
            </ListGroup>
          ) : (
            <ListGroup>
              <ListRow icon="log-in" tint="blue" title="Sign in" subtitle="Save your collection and decks" onPress={() => router.push("/(auth)/sign-in")} />
            </ListGroup>
          )}
        </View>

        <GroupLabel>About</GroupLabel>
        <View style={styles.section}>
          <ListGroup>
            <ListRow icon="information-circle" tint="teal" title="Version" value={version} />
          </ListGroup>
          <Text variant="caption" color={color.textTertiary} style={styles.footnote}>
            Card data and images from Scryfall. Prices from TCGplayer, Card Kingdom and Cardmarket. Magic: The Gathering is a trademark of Wizards of the
            Coast; CardEngine isn't affiliated with or endorsed by them.
          </Text>
        </View>
      </ScrollView>

      <Sheet visible={editingName} onClose={() => setEditingName(false)} title="Your name" subtitle="Shown on your profile and shared decks">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="e.g. Carter"
          placeholderTextColor={color.textTertiary}
          maxLength={50}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={saveName}
          selectionColor={color.accent}
          style={styles.input}
        />
        <Button label="Save" size="lg" onPress={saveName} loading={savingName} />
      </Sheet>
    </Screen>
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <Text variant="label" color={color.textTertiary} style={styles.groupLabel}>
      {children}
    </Text>
  );
}

function SwitchRow({
  icon,
  tint,
  title,
  subtitle,
  value,
  disabled,
  onChange,
}: {
  icon: React.ComponentProps<typeof IconBubble>["icon"];
  tint: React.ComponentProps<typeof IconBubble>["tint"];
  title: string;
  subtitle?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <IconBubble icon={icon} tint={tint} size={36} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle && (
          <Text variant="caption" color={color.textSecondary} style={{ marginTop: 1 }}>
            {subtitle}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: color.surface3, true: color.accent }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={color.surface3}
        accessibilityLabel={title}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: space.xxxl * 2 },
  section: { marginHorizontal: space.lg },
  groupLabel: { paddingHorizontal: space.lg, marginTop: space.xl, marginBottom: space.sm },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md, ...hairline, ...elevation.card },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, minHeight: 64, paddingVertical: space.md },
  footnote: { marginTop: space.md, paddingHorizontal: space.xs, lineHeight: 17 },
  input: {
    height: 52,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: color.surface2,
    color: color.ink,
    fontFamily: font.semibold,
    fontSize: 17,
  },
});
