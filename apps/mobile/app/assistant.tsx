// Ask AI: a chat about the player's binder, or about one deck when opened
// from a deck. Answers stream in; card suggestions for a deck can be added
// with one tap.
import React, { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { color, elevation, hairline, radius, space } from "@/design/tokens";
import { font } from "@/design/fonts";
import { importDeckText } from "@/lib/api";
import { postSse } from "@/lib/sse";
import { parseCardBlock, withoutCardBlock } from "@/lib/deckEdits";
import { AI_THINKING, pick } from "@/lib/flavor";
import { Button, Markdown, Text, tap } from "@/ui";

interface Message {
  role: "user" | "assistant";
  content: string;
  /** For an assistant message: what it's doing while the answer streams. */
  activity?: string | null;
  error?: boolean;
}

const BINDER_PROMPTS = [
  "What can I build from my binder?",
  "Which cards should I sell or trade?",
  "What's moving in price this week?",
  "What are my most valuable cards?",
];

const DECK_PROMPTS = [
  "What are this deck's biggest weaknesses?",
  "How does this deck win, and is it fast enough?",
  "Suggest 5 budget upgrades under $5",
  "What combos or synergies am I missing?",
];

const ACTIVITY: Record<string, string> = {
  search_cards: "Searching cards…",
  get_card: "Reading the card…",
  edhrec_commander: "Checking EDHREC…",
  collection_overview: "Looking through your binder…",
  search_collection: "Looking through your binder…",
  commanders_i_can_build: "Finding commanders you can build…",
  get_deck: "Reading your deck…",
};

export default function AssistantScreen() {
  const { deckId, deckName, prompt } = useLocalSearchParams<{ deckId?: string; deckName?: string; prompt?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const abort = useRef<AbortController | null>(null);

  const prompts = deckId ? DECK_PROMPTS : BINDER_PROMPTS;

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (prompt) void send(prompt);
    // Only for the prompt the screen was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateLast = (patch: (m: Message) => Message) =>
    setMessages((prev) => [...prev.slice(0, -1), patch(prev[prev.length - 1])]);

  const send = async (text = input) => {
    const question = text.trim();
    if (!question || busy) return;
    tap();
    setInput("");
    setBusy(true);
    const history = [...messages.filter((m) => !m.error && m.content.trim()), { role: "user" as const, content: question }];
    setMessages([...messages, { role: "user", content: question }, { role: "assistant", content: "", activity: pick("ai", AI_THINKING) }]);
    abort.current = new AbortController();
    try {
      await postSse(
        "/v1/ai/chat",
        { messages: history.map(({ role, content }) => ({ role, content })), deckId },
        (e) => {
          if (e.type === "text") updateLast((m) => ({ ...m, content: m.content + (e.text as string), activity: null }));
          else if (e.type === "tool_start") updateLast((m) => ({ ...m, activity: ACTIVITY[e.tool as string] ?? "Working…" }));
          else if (e.type === "error") updateLast((m) => ({ ...m, content: m.content || (e.message as string), error: !m.content, activity: null }));
        },
        abort.current.signal
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") updateLast((m) => ({ ...m, content: (err as Error).message, error: true, activity: null }));
    } finally {
      updateLast((m) => ({ ...m, activity: null }));
      setBusy(false);
    }
  };

  const addToDeck = async (index: number, cards: Array<{ name: string; quantity: number }>) => {
    if (!deckId) return;
    try {
      const r = await importDeckText(deckId, cards.map((c) => `${c.quantity} ${c.name}`).join("\n"), false);
      setAdded((prev) => new Set(prev).add(index));
      Alert.alert("Added to deck", `${r.imported} cards added to ${deckName ?? "your deck"}.`);
    } catch (e) {
      Alert.alert("Couldn't add cards", (e as Error).message);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={color.ink} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text variant="headline">Ask AI</Text>
          <Text variant="caption" color={color.textSecondary} numberOfLines={1}>
            {deckId ? `About ${deckName ?? "this deck"}` : "About your binder and any card"}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            abort.current?.abort();
            setMessages([]);
            setAdded(new Set());
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="New chat"
          style={[styles.back, !messages.length && { opacity: 0 }]}
          disabled={!messages.length}
        >
          <Ionicons name="create-outline" size={20} color={color.ink} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 ? (
            <Animated.View entering={FadeIn.duration(250)} style={styles.empty}>
              <View style={styles.orb}>
                <Ionicons name="sparkles" size={26} color="#FFFFFF" />
              </View>
              <Text variant="section" align="center">
                {deckId ? "Ask about this deck" : "Ask about your cards"}
              </Text>
              <Text variant="body" color={color.textSecondary} align="center" style={{ maxWidth: 300 }}>
                {deckId
                  ? "Strategy, weaknesses, upgrades, combos. It reads your list and live prices."
                  : "What to build, what to sell, what's moving. It reads your binder and live prices."}
              </Text>
              <View style={styles.prompts}>
                {prompts.map((p, i) => (
                  <Animated.View key={p} entering={FadeInDown.delay(80 + i * 50).duration(260)}>
                    <Pressable onPress={() => send(p)} style={({ pressed }) => [styles.prompt, pressed && { opacity: 0.7 }]}>
                      <Text variant="bodyStrong" style={{ flex: 1 }}>
                        {p}
                      </Text>
                      <Ionicons name="arrow-forward" size={16} color={color.textTertiary} />
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            </Animated.View>
          ) : (
            messages.map((m, i) =>
              m.role === "user" ? (
                <Animated.View key={i} entering={FadeInUp.duration(200)} style={styles.userBubble}>
                  <Text variant="body" color="#FFFFFF">
                    {m.content}
                  </Text>
                </Animated.View>
              ) : (
                <AssistantMessage key={i} message={m} deckId={deckId} added={added.has(i)} onAdd={(cards) => addToDeck(i, cards)} />
              )
            )
          )}
        </ScrollView>

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
          <View style={styles.field}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder={deckId ? "Ask about this deck…" : "Ask about your cards…"}
              placeholderTextColor={color.textTertiary}
              selectionColor={color.accent}
              multiline
              onSubmitEditing={() => send()}
              blurOnSubmit
              returnKeyType="send"
            />
            <Pressable
              onPress={() => (busy ? abort.current?.abort() : send())}
              disabled={!busy && !input.trim()}
              accessibilityRole="button"
              accessibilityLabel={busy ? "Stop" : "Send"}
              style={[styles.send, !busy && !input.trim() && { opacity: 0.35 }]}
            >
              <Ionicons name={busy ? "stop" : "arrow-up"} size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function AssistantMessage({
  message,
  deckId,
  added,
  onAdd,
}: {
  message: Message;
  deckId?: string;
  added: boolean;
  onAdd: (cards: Array<{ name: string; quantity: number }>) => void;
}) {
  const cards = deckId && !message.activity ? parseCardBlock(message.content) : [];
  const text = withoutCardBlock(message.content);
  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.answer}>
      <View style={[styles.avatar, message.error && { backgroundColor: color.negative }]}>
        <Ionicons name={message.error ? "alert" : "sparkles"} size={13} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, gap: space.md, paddingTop: 2 }}>
        {text ? <Markdown text={text} tint={message.error ? color.negative : color.text} /> : null}
        {message.activity && (
          <View style={styles.activity}>
            <View style={styles.pulse} />
            <Text variant="callout" color={color.textSecondary}>
              {message.activity}
            </Text>
          </View>
        )}
        {cards.length > 0 && (
          <View style={styles.addCard}>
            <Text variant="callout" color={color.textSecondary}>
              {cards.length} suggested {cards.length === 1 ? "card" : "cards"}
            </Text>
            <Button
              label={added ? "Added to deck" : `Add ${cards.length} to deck`}
              icon={added ? "checkmark" : "add"}
              variant={added ? "secondary" : "primary"}
              disabled={added}
              onPress={() => onAdd(cards)}
            />
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.sm },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: color.surface, ...hairline },
  thread: { padding: space.lg, gap: space.lg, flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, paddingVertical: space.xl },
  orb: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.accent,
    shadowColor: color.accent,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  prompts: { alignSelf: "stretch", gap: space.sm, marginTop: space.md },
  prompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    ...hairline,
    ...elevation.card,
  },
  userBubble: { alignSelf: "flex-end", maxWidth: "84%", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderBottomRightRadius: 6, backgroundColor: color.ink },
  answer: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  avatar: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: color.accent, marginTop: 1 },
  activity: { flexDirection: "row", alignItems: "center", gap: 8 },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent, opacity: 0.7 },
  addCard: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: color.surface, ...hairline },
  composer: { paddingHorizontal: space.md, paddingTop: space.sm, backgroundColor: color.bg },
  field: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    paddingLeft: space.lg,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 24,
    backgroundColor: color.surface,
    ...hairline,
    ...elevation.card,
  },
  input: { flex: 1, maxHeight: 120, minHeight: 36, paddingTop: 8, paddingBottom: 8, color: color.ink, fontFamily: font.medium, fontSize: 15 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: color.ink },
});
