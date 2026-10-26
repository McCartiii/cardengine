import React, { useCallback, useState } from "react";
import { Alert, FlatList, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { color, elevation, radius, space, TAB_BAR_CLEARANCE, type BubbleColor } from "@/design/tokens";
import { createDeck, deleteDeck, importDeckFromUrl, isDeckUrl, listDecks, type Deck } from "@/lib/api";
import { EMPTY_DECKS, pick } from "@/lib/flavor";
import { useAuthStore } from "@/store/authStore";
import {
  Button,
  Chip,
  EmptyState,
  FieldLabel,
  IconBubble,
  IconButton,
  PageHeader,
  Screen,
  Segmented,
  Sheet,
  SkeletonBlock,
  Text,
  Touchable,
} from "@/ui";

const FORMATS = ["commander", "standard", "modern", "pioneer", "legacy", "vintage", "pauper"] as const;
type Format = (typeof FORMATS)[number];

const FORMAT_DOT: Record<string, string> = {
  commander: "#C084FC",
  standard: "#34D399",
  modern: "#60A5FA",
  pioneer: "#FB923C",
  legacy: "#F87171",
  vintage: "#FFB224",
  pauper: "#A1A1AA",
};

const FORMAT_TINT: Record<string, BubbleColor> = {
  commander: "violet",
  standard: "green",
  modern: "blue",
  pioneer: "orange",
  legacy: "pink",
  vintage: "orange",
  pauper: "teal",
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function DecksScreen() {
  const [emptyTitle] = useState(() => pick("empty-decks", EMPTY_DECKS));
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const { decks: d } = await listDecks();
      setDecks(d);
      setStatus("ready");
    } catch {
      setStatus("error");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (session) load();
    }, [session, load])
  );

  const confirmDelete = (deck: Deck) => {
    Alert.alert(`Delete “${deck.name}”?`, "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDecks((prev) => prev.filter((d) => d.id !== deck.id));
          try {
            await deleteDeck(deck.id);
          } catch {
            load();
          }
        },
      },
    ]);
  };

  if (!session) {
    return (
      <Screen>
        <PageHeader title="Decks" />
        <EmptyState
          icon="layers-outline"
          title="Build and price your decks"
          body="Sign in to create decks, import lists and check legality."
          action="Sign in"
          onAction={() => router.push("/(auth)/sign-in")}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader
        title="Decks"
        subtitle={status === "ready" && decks.length > 0 ? `${decks.length} ${decks.length === 1 ? "deck" : "decks"}` : undefined}
        right={<IconButton icon="add" label="New deck" variant="accent" onPress={() => setShowCreate(true)} />}
      />

      {status === "loading" ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} height={84} />
          ))}
        </View>
      ) : status === "error" ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn't load your decks" body="Check your connection and try again." action="Retry" onAction={load} />
      ) : (
        <FlatList
          data={decks}
          keyExtractor={(d) => d.id}
          contentContainerStyle={[styles.list, { flexGrow: 1 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={color.textSecondary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="layers-outline"
              title={emptyTitle}
              body="Start a deck from scratch, then add cards from search or your collection."
              action="New deck"
              onAction={() => setShowCreate(true)}
            />
          }
          renderItem={({ item }) => (
            <DeckRow
              deck={item}
              onPress={() => router.push({ pathname: "/deck/[id]", params: { id: item.id } })}
              onLongPress={() => confirmDelete(item)}
            />
          )}
        />
      )}

      <CreateDeckSheet
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(deck) => {
          setShowCreate(false);
          router.push({ pathname: "/deck/[id]", params: { id: deck.id } });
        }}
      />
    </Screen>
  );
}

function DeckRow({ deck, onPress, onLongPress }: { deck: Deck; onPress: () => void; onLongPress: () => void }) {
  const count = deck._count?.cards ?? 0;
  return (
    <Touchable onPress={onPress} onLongPress={onLongPress} pressedScale={0.985} style={styles.deck} accessibilityRole="button">
      <IconBubble icon="layers" tint={FORMAT_TINT[deck.format] ?? "blue"} size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {deck.name}
        </Text>
        {deck.commander ? (
          <Text variant="callout" color={color.textSecondary} numberOfLines={1}>
            {deck.commander}
          </Text>
        ) : null}
        <View style={styles.deckMeta}>
          <View style={[styles.dot, { backgroundColor: FORMAT_DOT[deck.format] ?? color.textTertiary }]} />
          <Text variant="caption" color={color.textTertiary}>
            {capitalize(deck.format)} · {count} {count === 1 ? "card" : "cards"}
            {deck.isPublic ? " · Shared" : ""}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
    </Touchable>
  );
}

function CreateDeckSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (deck: Deck) => void }) {
  const [mode, setMode] = useState<"new" | "import">("new");
  const [name, setName] = useState("");
  const [format, setFormat] = useState<Format>("commander");
  const [commander, setCommander] = useState("");
  const [link, setLink] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setCommander("");
    setFormat("commander");
    setLink("");
  };

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { deck } = await createDeck({
        name: name.trim(),
        format,
        commander: format === "commander" ? commander.trim() || undefined : undefined,
      });
      reset();
      onCreated(deck);
    } catch (e: unknown) {
      Alert.alert("Couldn't create deck", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const importLink = async () => {
    if (!isDeckUrl(link)) return;
    setSaving(true);
    try {
      const r = await importDeckFromUrl({ url: link.trim() });
      reset();
      setMode("new");
      onCreated(r.deck);
      if (r.unresolved.length) {
        Alert.alert(
          `Imported ${r.imported} cards`,
          `${r.unresolved.length} ${r.unresolved.length === 1 ? "card isn't" : "cards aren't"} in our catalog yet: ${r.unresolved.slice(0, 4).join(", ")}${r.unresolved.length > 4 ? "…" : ""}`
        );
      }
    } catch (e: unknown) {
      Alert.alert("Couldn't import that deck", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const linkTyped = link.trim().length > 0;
  return (
    <Sheet visible={visible} onClose={onClose} title={mode === "new" ? "New deck" : "Import a deck"}>
      <Segmented
        options={[
          { value: "new", label: "Create", icon: "add" },
          { value: "import", label: "Import link", icon: "link" },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === "import" ? (
        <>
          <FieldLabel>Deck link</FieldLabel>
          <TextInput
            style={styles.input}
            value={link}
            onChangeText={setLink}
            placeholder="https://moxfield.com/decks/…"
            placeholderTextColor={color.textTertiary}
            selectionColor={color.accent}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={importLink}
            autoFocus
          />
          <Text variant="caption" color={linkTyped && !isDeckUrl(link) ? color.negative : color.textSecondary}>
            {linkTyped && !isDeckUrl(link)
              ? "That isn't a Moxfield, Archidekt or MTGGoldfish deck link."
              : "Works with public decks on Moxfield, Archidekt and MTGGoldfish. The name, format, commander and exact printings come across."}
          </Text>
          <Button label="Import deck" size="lg" onPress={importLink} loading={saving} disabled={!isDeckUrl(link)} style={{ marginTop: space.sm }} />
        </>
      ) : (
        <>
          <FieldLabel>Name</FieldLabel>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Atraxa Superfriends"
            placeholderTextColor={color.textTertiary}
            selectionColor={color.accent}
            autoFocus
            returnKeyType="done"
          />
          <FieldLabel>Format</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {FORMATS.map((f) => (
              <Chip key={f} label={capitalize(f)} active={format === f} onPress={() => setFormat(f)} />
            ))}
          </ScrollView>
          {format === "commander" && (
            <>
              <FieldLabel>Commander (optional)</FieldLabel>
              <TextInput
                style={styles.input}
                value={commander}
                onChangeText={setCommander}
                placeholder="e.g. Atraxa, Praetors' Voice"
                placeholderTextColor={color.textTertiary}
                selectionColor={color.accent}
              />
            </>
          )}
          <Button label="Create deck" size="lg" onPress={submit} loading={saving} disabled={!name.trim()} style={{ marginTop: space.sm }} />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: TAB_BAR_CLEARANCE, gap: space.md },
  deck: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    ...elevation.card,
  },
  deckIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: color.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  deckMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  input: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: color.surface2,
    paddingHorizontal: space.lg,
    color: color.text,
    fontSize: 16,
    fontWeight: "500",
  },
});
