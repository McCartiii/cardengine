import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { setStatusBarStyle } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown, FadeOutDown } from "react-native-reanimated";
import { CARD_ASPECT, color, elevation, hairline, radius, space } from "@/design/tokens";
import { font } from "@/design/fonts";
import { formatUsd } from "@/design/format";
import { primaryType } from "@/lib/deckAnalysis";
import {
  deleteDeck,
  getDeck,
  getDeckEdhrec,
  importDeckFromUrl,
  importDeckText,
  isDeckUrl,
  toggleDeckVisibility,
  type DeckCard,
} from "@/lib/api";
import { DeckAnalysisView } from "@/components/deck/DeckAnalysisView";
import { OpeningHand } from "@/components/deck/OpeningHand";
import { DeckAgentPanel } from "@/components/deck/DeckAgentPanel";
import { CardEditSheet } from "@/components/deck/CardEditSheet";
import { AddCardsSheet } from "@/components/deck/AddCardsSheet";
import { localDeckCard, useDeckEditor } from "@/components/deck/useDeckEditor";
import { addCard, countOf, hasCommandZone, moveCard, setCount } from "@/lib/deckEdits";
import { Button, CardArt, CardTile, Chip, Segmented, Sheet, Text, Touchable, padToColumns, tap } from "@/ui";

type Tab = "cards" | "analysis" | "edhrec" | "ai";
type Layout = "grid" | "list";

const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: "cards", label: "Cards" },
  { value: "analysis", label: "Analysis" },
  { value: "edhrec", label: "EDHREC" },
  { value: "ai", label: "AI" },
];

// The main deck is grouped by type, in the order a decklist reads.
const GROUP_ORDER = ["Commander", "Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land", "Other", "Companion", "Sideboard"];
const GROUP_LABEL: Record<string, string> = {
  Commander: "Commander",
  Creature: "Creatures",
  Planeswalker: "Planeswalkers",
  Battle: "Battles",
  Instant: "Instants",
  Sorcery: "Sorceries",
  Artifact: "Artifacts",
  Enchantment: "Enchantments",
  Land: "Lands",
  Other: "Other",
  Companion: "Companion",
  Sideboard: "Sideboard",
};

function groupOf(c: DeckCard): string {
  if (c.section === "commander") return "Commander";
  if (c.section === "sideboard") return "Sideboard";
  if (c.section === "companion") return "Companion";
  return primaryType(c.variant?.typeLine);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const SECTION_NAME: Record<string, string> = { mainboard: "the main deck", sideboard: "the sideboard", commander: "the command zone", companion: "companion" };

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export default function DeckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>("cards");
  const [layout, setLayout] = useState<Layout>("grid");
  const [showHand, setShowHand] = useState(false);
  const [deck, setDeck] = useState<Awaited<ReturnType<typeof getDeck>> | null>(null);

  const [edhrec, setEdhrec] = useState<Awaited<ReturnType<typeof getDeckEdhrec>> | null>(null);
  const [edhrecState, setEdhrecState] = useState<"idle" | "loading" | "done">("idle");
  const [edhrecDown, setEdhrecDown] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);

  const [editing, setEditing] = useState<{ name: string; section: string } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [showAdd, setShowAdd] = useState(false);
  const editor = useDeckEditor(id, deck, setDeck);
  const { edit, undo, dismissUndo } = editor;

  // The undo offer stays a few seconds.
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(dismissUndo, 4500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo]);

  const [loadError, setLoadError] = useState<string | null>(null);
  const loadDeck = useCallback(async () => {
    try {
      setDeck(await getDeck(id));
      setLoadError(null);
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      setLoadError(status === 404 || status === 403 ? "This deck doesn't exist or isn't yours." : (e as Error).message || "Check your connection and try again.");
    }
  }, [id]);

  useEffect(() => {
    loadDeck();
  }, [loadDeck]);

  // The hero is dark, so the status bar goes light while this screen is up.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      return () => setStatusBarStyle("dark");
    }, [])
  );

  useEffect(() => {
    if (tab !== "edhrec" || edhrecState !== "idle") return;
    setEdhrecState("loading");
    getDeckEdhrec(id)
      .then((r) => {
        setEdhrec(r);
        setEdhrecDown(false);
      })
      .catch((e: { status?: number }) => {
        setEdhrec(null);
        // 503: EDHREC itself is down or unreachable, which isn't "no data".
        setEdhrecDown(e?.status === 503 || e?.status === undefined);
      })
      .finally(() => setEdhrecState("done"));
  }, [tab, edhrecState, id]);

  const groups = useMemo(() => {
    if (!deck) return [];
    const map = new Map<string, DeckCard[]>();
    for (const c of deck.deck.cards) {
      const g = groupOf(c);
      map.set(g, [...(map.get(g) ?? []), c]);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => {
      const cards = [...map.get(g)!].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
      return {
        key: g,
        label: GROUP_LABEL[g],
        cards,
        count: cards.reduce((n, c) => n + c.quantity, 0),
        value: cards.reduce((n, c) => n + (c.price ?? 0) * c.quantity, 0),
      };
    });
  }, [deck]);

  const runImport = async () => {
    const text = importText.trim();
    if (!text) return;
    setImporting(true);
    try {
      let message: string;
      let issues: string[];
      if (isDeckUrl(text)) {
        // A Moxfield / Archidekt / MTGGoldfish link refreshes the deck from that site.
        const r = await importDeckFromUrl({ url: text, deckId: id });
        message =
          `${r.imported} cards imported.` +
          (r.unresolved.length ? `\n${r.unresolved.length} not in our catalog yet: ${r.unresolved.slice(0, 3).join(", ")}` : "");
        issues = r.legality.issues;
      } else {
        const r = await importDeckText(id, text);
        const unknown = r.imported - r.resolved;
        message =
          `${r.imported} cards imported.` +
          (unknown ? `\n${unknown} aren't in our catalog yet; they're kept by name.` : "") +
          (r.skipped ? `\n${r.skipped} ${r.skipped === 1 ? "line" : "lines"} without a count didn't match a card and were skipped.` : "");
        issues = r.legality.issues;
      }
      setShowImport(false);
      setImportText("");
      Alert.alert("Imported", message + (issues.length ? `\n\n${issues.slice(0, 3).join("\n")}` : "\n\nDeck is legal."));
      loadDeck();
    } catch (e: unknown) {
      Alert.alert("Import failed", (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const share = async () => {
    if (!deck) return;
    const WEB_BASE = process.env.EXPO_PUBLIC_WEB_URL ?? "https://cardengine.app";
    try {
      if (!deck.deck.isPublic) {
        await toggleDeckVisibility(id, true);
        loadDeck();
      }
      await Share.share({
        title: deck.deck.name,
        message: `Check out my ${deck.deck.format} deck "${deck.deck.name}" on CardEngine!\n${WEB_BASE}/decks/${id}/share`,
        url: `${WEB_BASE}/decks/${id}/share`,
      });
    } catch {
      // dismissed
    }
  };

  const confirmDelete = () =>
    Alert.alert("Delete deck", `Delete "${deck?.deck.name}"? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteDeck(id);
          router.back();
        },
      },
    ]);

  const more = () => {
    if (!deck) return;
    const toggleLabel = deck.deck.isPublic ? "Make private" : "Make public";
    const toggle = async () => {
      await toggleDeckVisibility(id, !deck.deck.isPublic);
      loadDeck();
    };
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Import or refresh cards", toggleLabel, "Delete deck", "Cancel"], destructiveButtonIndex: 2, cancelButtonIndex: 3 },
        (i) => (i === 0 ? setShowImport(true) : i === 1 ? toggle() : i === 2 ? confirmDelete() : undefined)
      );
    } else {
      Alert.alert(deck.deck.name, undefined, [
        { text: "Import or refresh cards", onPress: () => setShowImport(true) },
        { text: toggleLabel, onPress: toggle },
        { text: "Delete deck", style: "destructive", onPress: confirmDelete },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const openCard = (c: DeckCard) => setEditing({ name: c.cardName, section: c.section });

  const openDetails = (c: DeckCard) => {
    setEditing(null);
    if (c.variantId) router.push({ pathname: "/card/[id]", params: { id: c.variantId } });
  };

  if (!deck) {
    return (
      <View style={[styles.root, styles.center, { gap: space.md, padding: space.xxl }]}>
        <Stack.Screen options={{ headerShown: false }} />
        {loadError ? (
          <>
            <Ionicons name="alert-circle-outline" size={40} color={color.textTertiary} />
            <Text variant="headline" align="center">
              Couldn't open this deck
            </Text>
            <Text variant="body" color={color.textSecondary} align="center">
              {loadError}
            </Text>
            <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
              <Button label="Back" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/decks"))} />
              <Button
                label="Retry"
                onPress={() => {
                  setLoadError(null);
                  loadDeck();
                }}
              />
            </View>
          </>
        ) : (
          <ActivityIndicator color={color.textSecondary} />
        )}
      </View>
    );
  }

  const { deck: d, totalValue, legality } = deck;
  const commander = d.cards.find((c) => c.section === "commander");
  const heroArt = commander?.variant?.imageUri ?? [...d.cards].sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0]?.variant?.imageUri ?? null;
  const total = d.cards.filter((c) => c.section !== "sideboard").reduce((n, c) => n + c.quantity, 0);
  const lands = d.cards.filter((c) => c.section === "mainboard" && primaryType(c.variant?.typeLine) === "Land").reduce((n, c) => n + c.quantity, 0);
  const editingCard = editing ? d.cards.find((c) => c.section === editing.section && sameName(c.cardName, editing.name)) ?? null : null;
  const inDeck = (name: string) => d.cards.some((c) => sameName(c.cardName, name));
  const columns = 3;
  const tileWidth = (width - space.lg * 2 - space.md * (columns - 1)) / columns;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          {/* Hero: the commander's art behind the deck's name and numbers. */}
          <View style={[styles.hero, { paddingTop: insets.top + space.sm }]}>
            {heroArt && <Image source={{ uri: heroArt }} blurRadius={30} contentFit="cover" style={styles.heroBlur} />}
            <LinearGradient colors={["rgba(10,11,18,0.55)", "rgba(10,11,18,0.82)", "#0E0F13"]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />

            <View style={styles.heroBar}>
              <HeroButton icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/decks"))} />
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <HeroButton icon="share-outline" label="Share" onPress={share} />
                <HeroButton icon="ellipsis-horizontal" label="More" onPress={more} />
              </View>
            </View>

            <View style={styles.heroBody}>
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <View style={styles.heroChips}>
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>{capitalize(d.format)}</Text>
                  </View>
                  <View style={[styles.chip, { backgroundColor: legality.valid ? "rgba(92,224,160,0.16)" : "rgba(255,181,71,0.16)" }]}>
                    <Ionicons name={legality.valid ? "checkmark-circle" : "alert-circle"} size={12} color={legality.valid ? "#5CE0A0" : "#FFB547"} />
                    <Text style={[styles.chipText, { color: legality.valid ? "#5CE0A0" : "#FFB547" }]}>
                      {legality.valid ? "Legal" : `${legality.issues.length} issue${legality.issues.length === 1 ? "" : "s"}`}
                    </Text>
                  </View>
                  {d.isPublic && (
                    <View style={styles.chip}>
                      <Ionicons name="globe-outline" size={12} color="rgba(255,255,255,0.8)" />
                      <Text style={styles.chipText}>Public</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.deckName} numberOfLines={2}>
                  {d.name}
                </Text>
                {d.commander && (
                  <Text variant="callout" color="rgba(255,255,255,0.65)" numberOfLines={1}>
                    {d.commander}
                  </Text>
                )}
              </View>
              {commander?.variant?.imageUri && (
                <View style={styles.heroCard}>
                  <CardArt uri={commander.variant.imageUri} name={commander.cardName} />
                </View>
              )}
            </View>

            <View style={styles.heroStats}>
              <HeroStat label="Cards" value={String(total)} />
              <View style={styles.statDivider} />
              <HeroStat label="Value" value={formatUsd(totalValue)} />
              <View style={styles.statDivider} />
              <HeroStat label="Lands" value={String(lands)} />
            </View>

            <View style={styles.heroActions}>
              <Touchable onPress={() => setShowAdd(true)} accessibilityRole="button" pressedScale={0.96} style={[styles.heroAction, styles.heroActionPrimary]}>
                <Ionicons name="add" size={19} color="#0E0F13" />
                <Text style={[styles.heroActionText, { color: "#0E0F13" }]}>Add cards</Text>
              </Touchable>
              <Touchable
                onPress={() => setShowHand(true)}
                disabled={total < 8}
                accessibilityRole="button"
                pressedScale={0.96}
                style={[styles.heroAction, total < 8 && { opacity: 0.4 }]}
              >
                <Ionicons name="hand-left-outline" size={17} color="#FFFFFF" />
                <Text style={styles.heroActionText}>Test hand</Text>
              </Touchable>
            </View>
          </View>

          <View style={styles.tabs}>
            {/* EDHREC only covers Commander. */}
            <Segmented options={hasCommandZone(d.format) ? TABS : TABS.filter((t) => t.value !== "edhrec")} value={tab} onChange={setTab} />
          </View>

          {legality.issues.length > 0 && tab === "cards" && (
            <View style={styles.issues}>
              <Ionicons name="alert-circle" size={16} color="#B26A00" style={{ marginTop: 1 }} />
              <Text variant="callout" color="#7A4A00" style={{ flex: 1 }}>
                {legality.issues.slice(0, 3).join("\n")}
              </Text>
            </View>
          )}

          {tab === "cards" &&
            (d.cards.length === 0 ? (
              <Empty
                icon="albums-outline"
                text="No cards yet. Search for cards to add, or import a Moxfield or Archidekt link or a pasted list."
                action="Add cards"
                actionIcon="add"
                onAction={() => setShowAdd(true)}
                secondary="Import a list"
                onSecondary={() => setShowImport(true)}
              />
            ) : (
              <>
                <View style={styles.cardsBar}>
                  <Text variant="caption" color={color.textTertiary} style={{ flex: 1 }}>
                    Tap a card to change it
                  </Text>
                  <View style={styles.viewToggle}>
                    {(["grid", "list"] as const).map((v) => (
                      <Pressable
                        key={v}
                        onPress={() => {
                          tap();
                          setLayout(v);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: layout === v }}
                        accessibilityLabel={v === "grid" ? "Show as grid" : "Show as list"}
                        style={[styles.toggleBtn, layout === v && styles.toggleOn]}
                      >
                        <Ionicons name={v === "grid" ? "grid-outline" : "list-outline"} size={16} color={layout === v ? color.ink : color.textTertiary} />
                      </Pressable>
                    ))}
                  </View>
                </View>
                {groups.map((g) => (
                  <Animated.View key={g.key} entering={FadeIn.duration(200)} style={styles.group}>
                    <View style={styles.groupHeader}>
                      <Text variant="headline">{g.label}</Text>
                      <Text variant="number" color={color.textTertiary}>
                        {g.count}
                      </Text>
                      <View style={{ flex: 1 }} />
                      <Text variant="callout" color={color.textSecondary}>
                        {formatUsd(g.value)}
                      </Text>
                    </View>
                    {layout === "grid" ? (
                      <View style={styles.grid}>
                        {padToColumns(g.cards, columns).map((c, i) =>
                          c ? (
                            <CardTile
                              key={c.id}
                              style={{ width: tileWidth }}
                              name={c.cardName}
                              imageUri={c.variant?.imageUri}
                              price={c.price}
                              quantity={c.quantity}
                              onPress={() => openCard(c)}
                            />
                          ) : (
                            <View key={`pad-${i}`} style={{ width: tileWidth }} />
                          )
                        )}
                      </View>
                    ) : (
                      <View style={styles.listCard}>
                        {g.cards.map((c, i) => (
                          <Touchable key={c.id} onPress={() => openCard(c)} accessibilityRole="button" pressedScale={0.99} style={[styles.row, i > 0 && styles.rowDivider]}>
                            <Text variant="number" color={color.textTertiary} style={{ width: 22 }}>
                              {c.quantity}
                            </Text>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text variant="bodyStrong" numberOfLines={1}>
                                {c.cardName}
                              </Text>
                              {!c.variantId && (
                                <Text variant="caption" color={color.textTertiary}>
                                  Not in our catalog yet
                                </Text>
                              )}
                            </View>
                            <ManaCost cost={c.variant?.manaCost} />
                            <Text variant="price" style={{ width: 64, textAlign: "right" }}>
                              {c.price != null ? formatUsd(c.price) : "—"}
                            </Text>
                          </Touchable>
                        ))}
                      </View>
                    )}
                  </Animated.View>
                ))}
              </>
            ))}

          {tab === "analysis" && (
            <View style={{ paddingTop: space.sm }}>
              <DeckAnalysisView cards={d.cards} format={d.format} onTestHand={() => setShowHand(true)} />
            </View>
          )}

          {tab === "edhrec" &&
            (edhrecState !== "done" ? (
              <ActivityIndicator color={color.textSecondary} style={{ marginTop: 48 }} />
            ) : !edhrec && edhrecDown ? (
              <Empty icon="cloud-offline-outline" text="EDHREC isn't reachable right now." action="Try again" onAction={() => setEdhrecState("idle")} />
            ) : !edhrec ? (
              <Empty icon="people-outline" text={d.commander ? `EDHREC doesn't have data for ${d.commander} yet.` : "Set a commander to see what other players run with it."} />
            ) : (
              <View style={styles.section}>
                <View style={styles.panel}>
                  <Text variant="headline">{edhrec.commander}</Text>
                  <Text variant="caption" color={color.textSecondary}>
                    {edhrec.num_decks.toLocaleString()} decks on EDHREC · average deck ${edhrec.avg_price.toFixed(0)}
                  </Text>
                  {edhrec.themes.length > 0 && (
                    <View style={styles.themes}>
                      {edhrec.themes.slice(0, 8).map((t) => (
                        <Chip key={t} label={t} />
                      ))}
                    </View>
                  )}
                </View>
                <Text variant="headline" style={styles.subhead}>
                  Popular cards you don't run
                </Text>
                <View style={styles.listCard}>
                  {edhrec.recommendations
                    .filter((r) => !r.alreadyInDeck || inDeck(r.name))
                    .slice(0, 40)
                    .map((r, i) => (
                      <View key={r.name} style={[styles.recRow, i > 0 && styles.rowDivider]}>
                        <View style={styles.recArt}>
                          <CardArt uri={r.image} name={r.name} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                          <Text variant="bodyStrong" numberOfLines={1}>
                            {r.name}
                          </Text>
                          <Text variant="caption" color={color.textSecondary}>
                            {r.primary_type} · in {r.inclusion}% of decks
                          </Text>
                          <View style={styles.synergyTrack}>
                            <View style={[styles.synergyFill, { width: `${Math.max(4, Math.min(100, r.synergy * 2))}%` }]} />
                          </View>
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 2 }}>
                          <Text variant="number" color={r.synergy >= 0 ? color.positive : color.textSecondary}>
                            {r.synergy >= 0 ? "+" : ""}
                            {r.synergy}% synergy
                          </Text>
                          <Text variant="price">{r.price_usd != null ? formatUsd(r.price_usd) : "—"}</Text>
                        </View>
                        {inDeck(r.name) ? (
                          <View style={[styles.recAdd, styles.recAdded]} accessibilityLabel={`${r.name} is in the deck`}>
                            <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                          </View>
                        ) : (
                          <Pressable
                            onPress={() => {
                              tap();
                              edit(
                                (cards) => addCard(cards, localDeckCard({ name: r.name, imageUri: r.image, price: r.price_usd, typeLine: r.primary_type, cmc: r.cmc }, "mainboard")),
                                `Added ${r.name}`
                              );
                            }}
                            hitSlop={6}
                            style={styles.recAdd}
                            accessibilityRole="button"
                            accessibilityLabel={`Add ${r.name}`}
                          >
                            <Ionicons name="add" size={20} color={color.ink} />
                          </Pressable>
                        )}
                      </View>
                    ))}
                </View>
              </View>
            ))}

          {tab === "ai" && (
            <View style={styles.section}>
              <DeckAgentPanel
                deck={d}
                onApplied={loadDeck}
                onAsk={() => router.push({ pathname: "/assistant", params: { deckId: id, deckName: d.name } })}
                // The AI's progress and answer appear below the buttons; follow them.
                onStart={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 350)}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Sheet visible={showImport} onClose={() => setShowImport(false)} title="Import cards" subtitle="Replaces the cards in this deck">
        <TextInput
          style={[styles.input, { minHeight: 140 }]}
          value={importText}
          onChangeText={setImportText}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={"Paste a Moxfield, Archidekt or MTGGoldfish link\n\nor a decklist:\n1 Sol Ring\n1 Arcane Signet"}
          placeholderTextColor={color.textTertiary}
          selectionColor={color.accent}
        />
        <Button label={isDeckUrl(importText) ? "Import from link" : "Import list"} size="lg" onPress={runImport} loading={importing} disabled={!importText.trim()} />
      </Sheet>

      <CardEditSheet
        card={editingCard}
        format={d.format}
        onClose={() => setEditing(null)}
        onSetCount={(q) => editingCard && edit((cards) => setCount(cards, editingCard.cardName, editingCard.section, q), q === 0 ? `Removed ${editingCard.cardName}` : undefined)}
        onMove={(to) => {
          if (!editingCard) return;
          edit((cards) => moveCard(cards, editingCard.cardName, editingCard.section, to), `Moved ${editingCard.cardName} to ${SECTION_NAME[to] ?? to}`);
          setEditing({ name: editingCard.cardName, section: to });
        }}
        onRemove={() => {
          if (!editingCard) return;
          edit((cards) => setCount(cards, editingCard.cardName, editingCard.section, 0), `Removed ${editingCard.cardName}`);
          setEditing(null);
        }}
        onOpen={() => editingCard && openDetails(editingCard)}
      />

      <AddCardsSheet
        visible={showAdd}
        cards={d.cards}
        onClose={() => setShowAdd(false)}
        onAdd={(c, section) =>
          edit((cards) =>
            addCard(
              cards,
              localDeckCard({ name: c.name, variantId: c.variantId, imageUri: c.imageUri, typeLine: c.typeLine, manaCost: c.manaCost, rarity: c.rarity, price: c.priceUsd }, section)
            )
          )
        }
        onRemoveOne={(name, section) => edit((cards) => setCount(cards, name, section, countOf(cards, name, section) - 1))}
      />

      {(undo || editor.saveState === "error") && !showAdd && !editingCard && (
        <Animated.View entering={FadeInDown} exiting={FadeOutDown} style={[styles.toast, { bottom: insets.bottom + space.lg }]}>
          <Ionicons
            name={editor.saveState === "error" ? "cloud-offline-outline" : "checkmark-circle"}
            size={18}
            color={editor.saveState === "error" ? color.negative : color.positive}
          />
          <Text variant="callout" numberOfLines={1} style={{ flex: 1 }}>
            {editor.saveState === "error" ? "Couldn't save your changes" : undo?.label}
          </Text>
          <Pressable onPress={editor.saveState === "error" ? editor.retry : editor.undoLast} hitSlop={8} accessibilityRole="button">
            <Text variant="bodyStrong" color={color.accent}>
              {editor.saveState === "error" ? "Retry" : "Undo"}
            </Text>
          </Pressable>
        </Animated.View>
      )}

      <OpeningHand visible={showHand} cards={d.cards} deckName={d.name} format={d.format} onClose={() => setShowHand(false)} />
    </View>
  );
}

function HeroButton({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.heroButton, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={20} color="#FFFFFF" />
    </Pressable>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text variant="caption" color="rgba(255,255,255,0.6)">
        {label}
      </Text>
    </View>
  );
}

const PIP: Record<string, string> = { W: "#F4EBC8", U: "#4A90D9", B: "#5E556E", R: "#E5533D", G: "#3FA45B", C: "#B8B3AE" };

/** A mana cost as small colored pips, with generic costs as numbers. */
function ManaCost({ cost }: { cost: string | null | undefined }) {
  const symbols = (cost ?? "").match(/\{[^}]+\}/g)?.map((s) => s.slice(1, -1)) ?? [];
  if (!symbols.length) return null;
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {symbols.slice(0, 7).map((s, i) => {
        const generic = /^\d+$|^X$/.test(s);
        const tint = generic ? undefined : PIP[s[0]];
        return (
          <View key={i} style={[styles.pip, { backgroundColor: tint ?? color.surface3 }]}>
            {!tint && <Text style={styles.pipText}>{s}</Text>}
          </View>
        );
      })}
    </View>
  );
}

function Empty({
  icon,
  text,
  action,
  onAction,
  secondary,
  onSecondary,
  actionIcon,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  text: string;
  action?: string;
  onAction?: () => void;
  secondary?: string;
  onSecondary?: () => void;
  actionIcon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={34} color={color.textTertiary} />
      <Text variant="body" color={color.textSecondary} align="center">
        {text}
      </Text>
      {(action || secondary) && (
        <View style={{ flexDirection: "row", gap: space.sm }}>
          {action && <Button label={action} icon={actionIcon} onPress={onAction} />}
          {secondary && <Button label={secondary} variant="secondary" onPress={onSecondary} />}
        </View>
      )}
    </View>
  );
}

const HERO_CARD = 96;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  center: { alignItems: "center", justifyContent: "center" },
  hero: { backgroundColor: "#0E0F13", paddingBottom: space.lg, overflow: "hidden" },
  heroBlur: { position: "absolute", top: -60, left: -60, right: -60, bottom: -60, opacity: 0.85 },
  heroBar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space.lg },
  heroButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  heroBody: { flexDirection: "row", alignItems: "flex-end", gap: space.lg, paddingHorizontal: space.lg, marginTop: space.lg },
  heroChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.12)" },
  chipText: { fontFamily: font.semibold, fontSize: 12, color: "rgba(255,255,255,0.85)" },
  deckName: { fontFamily: font.heavy, fontSize: 28, lineHeight: 33, letterSpacing: -0.8, color: "#FFFFFF" },
  heroCard: {
    width: HERO_CARD,
    height: HERO_CARD / CARD_ASPECT,
    transform: [{ rotate: "4deg" }],
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: space.lg,
    marginTop: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  statDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: "rgba(255,255,255,0.18)" },
  statValue: { fontFamily: font.heavy, fontSize: 18, color: "#FFFFFF", fontVariant: ["tabular-nums"] },
  heroActions: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, marginTop: space.md },
  heroAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  heroActionPrimary: { backgroundColor: "#FFFFFF" },
  heroActionText: { fontFamily: font.bold, fontSize: 15, color: "#FFFFFF" },
  tabs: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  issues: { flexDirection: "row", gap: space.sm, marginHorizontal: space.lg, marginTop: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: "#FFF3DC" },
  cardsBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, marginTop: space.sm },
  viewToggle: { flexDirection: "row", gap: 2, padding: 2, borderRadius: 10, backgroundColor: color.surface3 },
  toggleBtn: { width: 34, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  toggleOn: { backgroundColor: color.surface, ...elevation.card },
  group: { paddingHorizontal: space.lg, marginTop: space.md },
  groupHeader: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: space.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  listCard: { backgroundColor: color.surface, borderRadius: radius.lg, paddingHorizontal: space.lg, ...hairline, ...elevation.card },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48, paddingVertical: 8 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderStrong },
  pip: { minWidth: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  pipText: { fontFamily: font.bold, fontSize: 10, color: color.ink },
  section: { paddingHorizontal: space.lg, paddingTop: space.sm },
  panel: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm, ...hairline, ...elevation.card },
  subhead: { marginTop: space.xl, marginBottom: space.md },
  themes: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },
  recRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 10 },
  recArt: { width: 42 },
  recAdd: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: color.surface2, borderWidth: 1, borderColor: color.borderStrong },
  recAdded: { backgroundColor: color.positive, borderColor: color.positive },
  toast: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    ...elevation.floating,
  },
  synergyTrack: { height: 4, borderRadius: 2, backgroundColor: color.surface2, overflow: "hidden", marginTop: 2 },
  synergyFill: { height: "100%", borderRadius: 2, backgroundColor: color.positive },
  input: {
    minHeight: 72,
    borderRadius: radius.md,
    padding: space.md,
    backgroundColor: color.surface2,
    color: color.ink,
    fontFamily: font.medium,
    fontSize: 15,
    textAlignVertical: "top",
  },
  empty: { alignItems: "center", gap: space.md, padding: space.xxl, paddingTop: 48 },
});
