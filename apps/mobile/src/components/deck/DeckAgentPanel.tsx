// The deck screen's AI tab: ask the deck agent to build, upgrade or change
// the deck, watch it work, review its checked picks, and apply them.
import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown, LinearTransition } from "react-native-reanimated";
import { color, elevation, hairline, radius, space } from "@/design/tokens";
import { font } from "@/design/fonts";
import { formatUsd } from "@/design/format";
import { updateDeckCards, type DeckCard } from "@/lib/api";
import { cardInfo, initialAgentState, runDeckAgent, type AgentCard, type AgentState, type AgentSwap } from "@/lib/deckAgent";
import { addCards, applyBuild, applySwaps } from "@/lib/deckEdits";
import { Button, CardArt, Text, Touchable, tap } from "@/ui";

interface PanelDeck {
  id: string;
  name: string;
  format: string;
  commander: string | null;
  cards: DeckCard[];
}

const COMMANDER_FORMATS = new Set(["commander", "brawl", "oathbreaker"]);

const BUDGETS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: "Any" },
  { value: 25, label: "$25" },
  { value: 50, label: "$50" },
  { value: 100, label: "$100" },
  { value: 250, label: "$250" },
];

const BRACKETS = [1, 2, 3, 4, 5] as const;
const BRACKET_HINT = ["", "Casual", "Core", "Upgraded", "Optimized", "cEDH"];

const TOOL_LABEL: Record<string, string> = {
  fetch_edhrec: "EDHREC",
  search_web: "Web",
  get_meta_snapshot: "Meta",
  get_card_details: "Card check",
  search_cards: "Card search",
  get_collection: "Your binder",
};

function presetsFor(mainCount: number, targetSize: number): string[] {
  const build = mainCount < targetSize * 0.6 ? ["Build the rest of the deck"] : [];
  return [...build, "Upgrade this deck", "Make it cheaper", "Add more removal", "Lower the mana curve", "Improve the mana base"];
}

export function DeckAgentPanel({ deck, onApplied, onAsk }: { deck: PanelDeck; onApplied: () => void; onAsk: () => void }) {
  const commanderFormat = COMMANDER_FORMATS.has(deck.format);
  const mainCount = deck.cards.filter((c) => c.section === "mainboard").reduce((n, c) => n + c.quantity, 0);
  const presets = presetsFor(mainCount, commanderFormat ? 99 : 60);

  const [instruction, setInstruction] = useState("");
  const [refine, setRefine] = useState("");
  const [bracket, setBracket] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [budget, setBudget] = useState(0);
  const [state, setState] = useState<AgentState>(initialAgentState);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const run = async (text: string, sessionId?: string) => {
    const ask = text.trim();
    if (!ask || state.running) return;
    tap();
    abort.current?.abort();
    abort.current = new AbortController();
    setSkipped(new Set());
    await runDeckAgent(
      { instruction: ask, bracket, budget, deckId: deck.id, sessionId },
      setState,
      abort.current.signal
    );
  };

  const stop = () => {
    abort.current?.abort();
    setState((s) => ({ ...s, running: false, status: null }));
  };

  const { result } = state;
  const isBuild = state.mode === "build";
  const swaps = result.swaps;
  const chosenSwaps = swaps.filter((_, i) => !skipped.has(i));
  const additions = isBuild ? [] : result.cards;
  const hasResult = swaps.length > 0 || result.cards.length > 0;
  const variantOf = (name: string) => cardInfo(state, name)?.variantId;

  const tiers = useMemo(() => {
    const order = state.tiers.length ? state.tiers : [""];
    const map = new Map<string, AgentCard[]>();
    for (const c of result.cards) map.set(c.tier, [...(map.get(c.tier) ?? []), c]);
    return [...order, ...[...map.keys()].filter((t) => !order.includes(t))]
      .filter((t) => map.has(t))
      .map((t) => ({ name: t || "Cards", cards: map.get(t)! }));
  }, [result.cards, state.tiers]);

  const applyLabel = isBuild
    ? `Add ${result.cards.reduce((n, c) => n + c.quantity, 0)} cards to deck`
    : chosenSwaps.length && additions.length
      ? `Apply ${chosenSwaps.length} swaps + ${additions.length} adds`
      : chosenSwaps.length
        ? `Apply ${chosenSwaps.length} ${chosenSwaps.length === 1 ? "swap" : "swaps"}`
        : `Add ${additions.length} ${additions.length === 1 ? "card" : "cards"}`;
  const canApply = !state.running && (isBuild ? result.cards.length > 0 : chosenSwaps.length + additions.length > 0);

  const apply = () => {
    const doApply = async () => {
      setApplying(true);
      try {
        const entries = isBuild
          ? applyBuild(deck.cards, result.cards, variantOf)
          : addCards(applySwaps(deck.cards, chosenSwaps, variantOf), additions, variantOf);
        const r = await updateDeckCards(deck.id, entries);
        Alert.alert("Deck updated", r.legality.issues.length ? r.legality.issues.slice(0, 3).join("\n") : `${r.cardCount} entries saved. The deck is legal.`);
        setState(initialAgentState);
        onApplied();
      } catch (e) {
        Alert.alert("Couldn't update the deck", (e as Error).message);
      } finally {
        setApplying(false);
      }
    };
    if (isBuild && mainCount >= 10) {
      Alert.alert("Replace the main deck?", `This replaces the ${mainCount} cards in the main deck with the AI's list. The commander stays.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Replace", style: "destructive", onPress: doApply },
      ]);
    } else {
      void doApply();
    }
  };

  return (
    <View style={styles.root}>
      {/* Ask */}
      <View style={styles.panel}>
        <View style={styles.titleRow}>
          <View style={styles.aiIcon}>
            <Ionicons name="sparkles" size={16} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="headline">Deck AI</Text>
            <Text variant="caption" color={color.textSecondary}>
              Uses EDHREC, live prices and your binder. Every pick is checked.
            </Text>
          </View>
        </View>

        <View style={styles.presets}>
          {presets.map((p) => (
            <Pressable key={p} onPress={() => run(p)} disabled={state.running} style={({ pressed }) => [styles.preset, pressed && { opacity: 0.7 }, state.running && { opacity: 0.5 }]}>
              <Text variant="callout">{p}</Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          style={styles.input}
          value={instruction}
          onChangeText={setInstruction}
          multiline
          placeholder="Or say what you want, e.g. “more graveyard recursion, under $3 each”"
          placeholderTextColor={color.textTertiary}
          selectionColor={color.accent}
          editable={!state.running}
        />

        {commanderFormat && (
          <Setting label="Power">
            {BRACKETS.map((b) => (
              <Pill key={b} label={`${b}`} hint={BRACKET_HINT[b]} on={bracket === b} onPress={() => setBracket(b)} />
            ))}
          </Setting>
        )}
        <Setting label="Budget">
          {BUDGETS.map((b) => (
            <Pill key={b.value} label={b.label} on={budget === b.value} onPress={() => setBudget(b.value)} />
          ))}
        </Setting>

        {state.running ? (
          <Button label="Stop" variant="secondary" icon="stop" onPress={stop} />
        ) : (
          <Button label="Run" icon="sparkles" onPress={() => run(instruction)} disabled={!instruction.trim()} />
        )}
        <Pressable onPress={onAsk} hitSlop={6} style={styles.askLink} accessibilityRole="button">
          <Ionicons name="chatbubble-ellipses-outline" size={15} color={color.accent} />
          <Text variant="callout" color={color.accent}>
            Ask a question about this deck instead
          </Text>
        </Pressable>
      </View>

      {/* Working */}
      {state.running && (
        <Animated.View entering={FadeIn.duration(200)} style={[styles.panel, styles.working]}>
          <View style={styles.titleRow}>
            <ActivityIndicator color={color.accent} />
            <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={2}>
              {state.status ?? "Thinking…"}
            </Text>
          </View>
          {state.tools.length > 0 && (
            <View style={styles.tools}>
              {state.tools.map((t, i) => (
                <View key={`${t.name}-${i}`} style={[styles.tool, !t.running && styles.toolDone]}>
                  <Ionicons name={t.running ? "ellipsis-horizontal" : "checkmark"} size={12} color={t.running ? color.textSecondary : color.positive} />
                  <Text variant="caption" color={t.running ? color.textSecondary : color.positive}>
                    {TOOL_LABEL[t.name] ?? t.name}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Animated.View>
      )}

      {state.error && (
        <Banner tone="negative" icon="alert-circle" title={state.error} />
      )}

      {state.escalation && !state.running && (
        <Animated.View entering={FadeInDown.duration(220)} style={styles.panel}>
          <Text variant="bodyStrong">{state.escalation}</Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Full rebuild" variant="secondary" onPress={() => run("Do a full rebuild.", state.sessionId ?? undefined)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Push this deck" onPress={() => run("Keep the current strategy and push it as far as possible in this direction.", state.sessionId ?? undefined)} />
            </View>
          </View>
        </Animated.View>
      )}

      {state.check && !state.check.fixing && !state.running && hasResult && (
        state.check.ok ? (
          <Banner
            tone="positive"
            icon="shield-checkmark"
            title="Checked: every card is real, legal and on-color"
            detail={state.check.totalPrice ? `${isBuild ? "Deck" : "Additions"} about ${formatUsd(state.check.totalPrice)}` : undefined}
          />
        ) : (
          <Banner tone="warning" icon="alert-circle" title="Worth a look before applying" lines={state.check.issues} />
        )
      )}

      {/* Swaps */}
      {swaps.length > 0 && (
        <Animated.View layout={LinearTransition} style={styles.panel}>
          <View style={styles.sectionHead}>
            <Text variant="headline">Swaps</Text>
            <Text variant="caption" color={color.textSecondary}>
              {chosenSwaps.length} of {swaps.length} selected
            </Text>
          </View>
          {swaps.map((s, i) => (
            <SwapRow
              key={`${s.cut.name}-${s.add.name}-${i}`}
              swap={s}
              on={!skipped.has(i)}
              cutArt={cardImage(state, s.cut.name, deck.cards)}
              addArt={cardInfo(state, s.add.name)?.imageUri ?? null}
              addPrice={cardInfo(state, s.add.name)?.priceUsd ?? null}
              first={i === 0}
              onToggle={() =>
                setSkipped((prev) => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                })
              }
            />
          ))}
        </Animated.View>
      )}

      {/* Cards */}
      {tiers.map((t) => (
        <Animated.View key={t.name} entering={FadeInDown.duration(220)} layout={LinearTransition} style={styles.panel}>
          <View style={styles.sectionHead}>
            <Text variant="headline">{isBuild ? t.name : `Add · ${t.name}`}</Text>
            <Text variant="caption" color={color.textSecondary}>
              {t.cards.reduce((n, c) => n + c.quantity, 0)}
            </Text>
          </View>
          {t.cards.map((c, i) => (
            <CardRow key={`${c.name}-${i}`} card={c} first={i === 0} art={cardInfo(state, c.name)?.imageUri ?? null} price={cardInfo(state, c.name)?.priceUsd ?? null} />
          ))}
        </Animated.View>
      ))}

      {hasResult && !state.running && (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: space.sm }}>
          <Button label={applyLabel} icon="checkmark-circle" size="lg" onPress={apply} loading={applying} disabled={!canApply} />
          <View style={[styles.panel, styles.refine]}>
            <TextInput
              style={styles.refineInput}
              value={refine}
              onChangeText={setRefine}
              placeholder="Change something about this answer…"
              placeholderTextColor={color.textTertiary}
              selectionColor={color.accent}
              returnKeyType="send"
              onSubmitEditing={() => {
                void run(refine, state.sessionId ?? undefined);
                setRefine("");
              }}
            />
            <Pressable
              onPress={() => {
                void run(refine, state.sessionId ?? undefined);
                setRefine("");
              }}
              disabled={!refine.trim()}
              style={[styles.send, !refine.trim() && { opacity: 0.4 }]}
              accessibilityRole="button"
              accessibilityLabel="Send"
            >
              <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function cardImage(state: AgentState, name: string, deckCards: DeckCard[]): string | null {
  const inDeck = deckCards.find((c) => c.cardName.toLowerCase() === name.toLowerCase());
  return inDeck?.variant?.imageUri ?? cardInfo(state, name)?.imageUri ?? null;
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.setting}>
      <Text variant="label" color={color.textSecondary}>
        {label.toUpperCase()}
      </Text>
      <View style={styles.pills}>{children}</View>
    </View>
  );
}

function Pill({ label, hint, on, onPress }: { label: string; hint?: string; on: boolean; onPress: () => void }) {
  return (
    <Touchable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      accessibilityState={{ selected: on }}
      style={[styles.pill, on && styles.pillOn]}
    >
      <Text variant="callout" color={on ? "#FFFFFF" : color.text}>
        {label}
      </Text>
      {hint && on && (
        <Text variant="caption" color="rgba(255,255,255,0.7)">
          {hint}
        </Text>
      )}
    </Touchable>
  );
}

const BANNER = {
  positive: { bg: color.positiveSoft, fg: color.positive },
  warning: { bg: "#FFF3DC", fg: "#9A5B00" },
  negative: { bg: color.negativeSoft, fg: color.negative },
} as const;

function Banner({ tone, icon, title, detail, lines }: { tone: keyof typeof BANNER; icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; detail?: string; lines?: string[] }) {
  const t = BANNER[tone];
  return (
    <Animated.View entering={FadeIn.duration(200)} style={[styles.banner, { backgroundColor: t.bg }]}>
      <Ionicons name={icon} size={18} color={t.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" color={t.fg}>
          {title}
        </Text>
        {detail && (
          <Text variant="caption" color={t.fg}>
            {detail}
          </Text>
        )}
        {lines?.map((l) => (
          <Text key={l} variant="caption" color={t.fg}>
            • {l}
          </Text>
        ))}
      </View>
    </Animated.View>
  );
}

const THUMB = 40;

function SwapRow({ swap, on, cutArt, addArt, addPrice, first, onToggle }: { swap: AgentSwap; on: boolean; cutArt: string | null; addArt: string | null; addPrice: number | null; first: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onToggle();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`Swap ${swap.cut.name} for ${swap.add.name}`}
      style={[styles.swap, !first && styles.divider, !on && { opacity: 0.45 }]}
    >
      <View style={styles.swapTop}>
        <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={22} color={on ? color.accent : color.textTertiary} />
        <View style={{ flex: 1, gap: 8 }}>
          <SwapSide kind="out" name={swap.cut.name} art={cutArt} />
          <SwapSide kind="in" name={swap.add.name} art={addArt} price={addPrice} />
        </View>
      </View>
      {(swap.add.reason || swap.cut.reason) && (
        <Text variant="caption" color={color.textSecondary} style={styles.swapWhy}>
          {swap.add.reason || swap.cut.reason}
        </Text>
      )}
    </Pressable>
  );
}

function SwapSide({ kind, name, art, price }: { kind: "in" | "out"; name: string; art: string | null; price?: number | null }) {
  const tint = kind === "in" ? color.positive : color.negative;
  return (
    <View style={styles.swapSide}>
      <View style={styles.thumbSmall}>
        <CardArt uri={art} name={name} />
      </View>
      <View style={[styles.swapSign, { backgroundColor: kind === "in" ? color.positiveSoft : color.negativeSoft }]}>
        <Ionicons name={kind === "in" ? "add" : "remove"} size={12} color={tint} />
      </View>
      <Text variant="bodyStrong" numberOfLines={2} style={{ flex: 1 }} color={kind === "out" ? color.textSecondary : color.text}>
        {name}
      </Text>
      {price != null && <Text variant="price">{formatUsd(price)}</Text>}
    </View>
  );
}

const IMPORTANCE_TINT = { critical: color.accent, high: color.info, flex: color.textTertiary } as const;

function CardRow({ card, art, price, first }: { card: AgentCard; art: string | null; price: number | null; first: boolean }) {
  return (
    <View style={[styles.cardRow, !first && styles.divider]}>
      <View style={styles.thumb}>
        <CardArt uri={art} name={card.name} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {card.importance !== "flex" && <View style={[styles.dot, { backgroundColor: IMPORTANCE_TINT[card.importance] }]} />}
          <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {card.quantity > 1 ? `${card.quantity}× ` : ""}
            {card.name}
          </Text>
        </View>
        {card.reason !== "" && (
          <Text variant="caption" color={color.textSecondary} numberOfLines={3}>
            {card.reason}
          </Text>
        )}
      </View>
      <Text variant="price" style={styles.rowPrice}>
        {price != null ? formatUsd(price * card.quantity) : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  panel: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md, ...hairline, ...elevation.card },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  aiIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: color.accent },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  preset: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: 14, backgroundColor: color.surface2 },
  input: {
    minHeight: 64,
    borderRadius: radius.md,
    padding: space.md,
    backgroundColor: color.surface2,
    color: color.ink,
    fontFamily: font.medium,
    fontSize: 15,
    textAlignVertical: "top",
  },
  setting: { gap: 6 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: color.surface2 },
  pillOn: { backgroundColor: color.ink },
  askLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 2 },
  working: { gap: space.sm },
  tools: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tool: { flexDirection: "row", alignItems: "center", gap: 4, height: 24, paddingHorizontal: 9, borderRadius: 12, backgroundColor: color.surface2 },
  toolDone: { backgroundColor: color.positiveSoft },
  banner: { flexDirection: "row", gap: space.sm, padding: space.md, borderRadius: radius.md },
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: -space.xs },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderStrong },
  swap: { paddingTop: space.md, gap: 6 },
  swapTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  swapSide: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  swapSign: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  swapWhy: { marginLeft: 22 + space.md },
  thumbSmall: { width: 30 },
  thumb: { width: THUMB },
  cardRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingTop: space.md },
  dot: { width: 7, height: 7, borderRadius: 4 },
  rowPrice: { minWidth: 56, textAlign: "right" },
  refine: { flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingRight: 6, gap: space.sm },
  refineInput: { flex: 1, minHeight: 40, color: color.ink, fontFamily: font.medium, fontSize: 15 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: color.ink },
});
