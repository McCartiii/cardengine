// Goldfish an opening hand: shuffle, draw seven, mulligan the London way
// (draw seven again, then put one card on the bottom per mulligan), and draw
// a few turns to see how the deck plays out.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { space } from "@/design/tokens";
import { font } from "@/design/fonts";
import { buildLibrary, shuffled, type AnalysisCard, type LibraryCard } from "@/lib/deckAnalysis";
import { binderPage, CardArt, Text, Touchable, tap } from "@/ui";

const HAND = 7;
const GAP = 8;

interface Game {
  library: LibraryCard[];
  hand: LibraryCard[];
  mulligans: number;
  /** Cards still to put on the bottom for this mulligan. */
  toBottom: number;
  /** Cards drawn after keeping. */
  draws: number;
}

/** In multiplayer Commander the first mulligan is free: nothing goes to the bottom. */
function deal(all: LibraryCard[], mulligans: number, freeFirst: boolean): Game {
  const deck = shuffled(all);
  const toBottom = Math.max(0, mulligans - (freeFirst ? 1 : 0));
  return { library: deck.slice(HAND), hand: deck.slice(0, HAND), mulligans, toBottom, draws: 0 };
}

export function OpeningHand({
  visible,
  cards,
  deckName,
  format,
  onClose,
}: {
  visible: boolean;
  cards: AnalysisCard[];
  deckName: string;
  format: string;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const library = useMemo(() => buildLibrary(cards), [cards]);
  const freeFirst = format === "commander" || format === "oathbreaker";
  const [game, setGame] = useState<Game>(() => deal(library, 0, freeFirst));
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const restart = useCallback(() => {
    tap();
    setPicked(new Set());
    setGame(deal(library, 0, freeFirst));
  }, [library, freeFirst]);

  useEffect(() => {
    if (visible) restart();
  }, [visible, restart]);

  const mulligan = () => {
    tap();
    setPicked(new Set());
    setGame((g) => deal(library, Math.min(g.mulligans + 1, HAND - 1), freeFirst));
  };

  const togglePick = (key: string) => {
    if (game.toBottom === 0) return;
    tap();
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(key)) next.delete(key);
      else if (next.size < game.toBottom) next.add(key);
      return next;
    });
  };

  const keep = () => {
    tap();
    setGame((g) => ({
      ...g,
      hand: g.hand.filter((c) => !picked.has(c.key)),
      library: [...g.library, ...g.hand.filter((c) => picked.has(c.key))],
      toBottom: 0,
    }));
    setPicked(new Set());
  };

  const draw = () => {
    if (game.library.length === 0) return;
    tap();
    setGame((g) => ({ ...g, hand: [...g.hand, g.library[0]], library: g.library.slice(1), draws: g.draws + 1 }));
  };

  const choosing = game.toBottom > 0;
  const lands = game.hand.filter((c) => c.land).length;
  const spells = game.hand.length - lands;
  // Three across while the hand is small, four once draws fill it out.
  const columns = game.hand.length <= 9 ? 3 : 4;
  const cardWidth = Math.floor((width - space.lg * 2 - GAP * (columns - 1)) / columns);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.root}>
        <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
          <View style={styles.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title}>Opening hand</Text>
              <Text variant="caption" color={binderPage.muted} numberOfLines={1}>
                {deckName}
                {game.mulligans > 0 ? ` · Mulligan ${game.mulligans}${freeFirst && game.mulligans === 1 ? " (free)" : ""}` : ""}
                {game.draws > 0 ? ` · Turn ${game.draws + 1}` : ""}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={styles.summary}>
            <Summary icon="earth" label={`${lands} ${lands === 1 ? "land" : "lands"}`} tone={lands >= 2 && lands <= 4 ? "good" : "warn"} />
            <Summary icon="flash" label={`${spells} ${spells === 1 ? "spell" : "spells"}`} />
            <Summary icon="layers" label={`${game.library.length} in library`} />
          </View>

          {choosing && (
            <Animated.View entering={FadeInDown.duration(200)} style={styles.banner}>
              <Ionicons name="arrow-down-circle" size={18} color="#FFD58A" />
              <Text variant="callout" color="#FFFFFF" style={{ flex: 1 }}>
                Tap {game.toBottom} {game.toBottom === 1 ? "card" : "cards"} to put on the bottom ({picked.size}/{game.toBottom})
              </Text>
            </Animated.View>
          )}

          <ScrollView contentContainerStyle={styles.hand}>
            {game.hand.map((c, i) => {
              const on = picked.has(c.key);
              return (
                <Animated.View key={`${c.key}-${game.mulligans}`} entering={FadeInDown.delay(i * 45).springify().damping(16)} layout={LinearTransition}>
                  <Touchable
                    onPress={() => togglePick(c.key)}
                    disabled={!choosing}
                    pressedScale={0.96}
                    accessibilityRole={choosing ? "button" : undefined}
                    accessibilityLabel={c.name}
                    accessibilityState={choosing ? { selected: on } : undefined}
                    style={[{ width: cardWidth }, on && styles.picked]}
                  >
                    <CardArt uri={c.imageUri} name={c.name} />
                    {on && (
                      <View style={styles.pickBadge}>
                        <Ionicons name="arrow-down" size={14} color="#0E0F13" />
                      </View>
                    )}
                  </Touchable>
                </Animated.View>
              );
            })}
          </ScrollView>

          <View style={styles.actions}>
            {choosing ? (
              <ActionButton icon="checkmark" label={`Keep ${HAND - game.toBottom}`} primary disabled={picked.size !== game.toBottom} onPress={keep} />
            ) : (
              <>
                <ActionButton icon="refresh" label="New hand" onPress={restart} />
                <ActionButton icon="shuffle" label="Mulligan" onPress={mulligan} disabled={game.mulligans >= HAND - 1 || game.draws > 0} />
                <ActionButton icon="add" label="Draw" primary onPress={draw} disabled={game.library.length === 0} />
              </>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Summary({ icon, label, tone }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; tone?: "good" | "warn" }) {
  const fg = tone === "good" ? "#5CE0A0" : tone === "warn" ? "#FFB547" : "#FFFFFF";
  return (
    <View style={styles.summaryChip}>
      <Ionicons name={icon} size={13} color={fg} />
      <Text variant="callout" color={fg}>
        {label}
      </Text>
    </View>
  );
}

function ActionButton({ icon, label, primary, disabled, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; primary?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      pressedScale={0.95}
      style={[styles.action, primary && styles.actionPrimary, disabled && { opacity: 0.35 }]}
    >
      <Ionicons name={icon} size={18} color={primary ? "#0E0F13" : "#FFFFFF"} />
      <Text style={[styles.actionText, primary && { color: "#0E0F13" }]}>{label}</Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: binderPage.page },
  header: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingTop: space.sm },
  title: { fontFamily: font.heavy, fontSize: 24, letterSpacing: -0.6, color: "#FFFFFF" },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)" },
  summary: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, marginTop: space.lg },
  summaryChip: { flexDirection: "row", alignItems: "center", gap: 5, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.08)" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.md,
    padding: space.md,
    borderRadius: 14,
    backgroundColor: "rgba(255,213,138,0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,213,138,0.35)",
  },
  hand: { flexDirection: "row", flexWrap: "wrap", gap: GAP, padding: space.lg },
  picked: { opacity: 0.5 },
  pickBadge: { position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFD58A", alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  actionPrimary: { backgroundColor: "#FFFFFF" },
  actionText: { fontFamily: font.bold, fontSize: 15, color: "#FFFFFF" },
});
