// Setting up a game: how many players and where they sit, names and colors,
// starting life and an optional turn clock.
import React from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { font } from "@/design/fonts";
import { CLOCK_OPTIONS, LIFE_BG, LIFE_OPTIONS, MAX_PLAYERS, MIN_PLAYERS, PLAYER_COLORS } from "@/lib/lifeConstants";
import { seatLayout, seatRotation } from "@/lib/lifeGame";
import { useLifeStore } from "@/store/lifeStore";
import { feel } from "@/components/life/feel";

export function SetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setup = useLifeStore((s) => s.setup);
  const { setStartingLife, setClock, setPlayerCount, renamePlayer, cycleColor, start } = useLifeStore.getState();
  const count = setup.players.length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.close} accessibilityRole="button" accessibilityLabel="Close life counter">
          <Ionicons name="close" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(350)} style={styles.hero}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.kicker}>LIFE COUNTER</Text>
              <Text style={styles.title}>New game</Text>
              <Text style={styles.subtitle}>Lay the phone in the middle of the table. Each panel turns to face its player.</Text>
            </View>
            <TablePreview players={setup.players} onTapSeat={(i) => { feel.tick(); cycleColor(i); }} />
          </Animated.View>

          <Section title="PLAYERS" delay={60}>
            <View style={styles.chips}>
              {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, k) => k + MIN_PLAYERS).map((n) => (
                <Choice key={n} label={`${n}`} on={count === n} round onPress={() => setPlayerCount(n)} />
              ))}
            </View>
            <Animated.View layout={LinearTransition} style={styles.names}>
              {setup.players.map((p, i) => {
                const c = PLAYER_COLORS[p.color];
                return (
                  <Animated.View key={i} entering={FadeInDown.duration(220)} layout={LinearTransition} style={styles.nameRow}>
                    <Pressable
                      onPress={() => {
                        feel.tick();
                        cycleColor(i);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Change ${p.name}'s color, now ${c.name}`}
                    >
                      <LinearGradient colors={[c.from, c.to]} style={styles.swatch}>
                        <Text style={styles.swatchText}>{i + 1}</Text>
                      </LinearGradient>
                    </Pressable>
                    <TextInput
                      value={p.name}
                      onChangeText={(t) => renamePlayer(i, t)}
                      style={styles.nameInput}
                      placeholder={`Player ${i + 1}`}
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      selectionColor={c.from}
                      maxLength={16}
                      returnKeyType="done"
                    />
                    <Ionicons name="pencil" size={14} color="rgba(255,255,255,0.25)" />
                  </Animated.View>
                );
              })}
            </Animated.View>
            <Text style={styles.hint}>Tap a color to change it. Turn order goes clockwise from player 1.</Text>
          </Section>

          <Section title="STARTING LIFE" delay={120}>
            <View style={styles.chips}>
              {LIFE_OPTIONS.map((n) => (
                <Choice key={n} label={`${n}`} sub={n === 40 ? "Commander" : n === 20 ? "Standard" : undefined} on={setup.startingLife === n} big onPress={() => setStartingLife(n)} />
              ))}
            </View>
          </Section>

          <Section title="TURN CLOCK" delay={180}>
            <View style={styles.chips}>
              {CLOCK_OPTIONS.map((m) => (
                <Choice key={String(m)} label={m == null ? "Off" : `${m}`} sub={m == null ? undefined : "min each"} on={setup.clockMinutes === m} big onPress={() => setClock(m)} />
              ))}
            </View>
            <Text style={styles.hint}>
              {setup.clockMinutes == null
                ? "No clock. You can still pass turns to track who's up."
                : `Each player gets ${setup.clockMinutes} minutes. It only runs on your turn, and you're out if it hits zero.`}
            </Text>
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          onPress={() => {
            feel.success();
            start();
          }}
          style={({ pressed }) => [styles.start, pressed && { transform: [{ scale: 0.98 }] }]}
          accessibilityRole="button"
        >
          <Ionicons name="play" size={18} color="#111" />
          <Text style={styles.startText}>Start game</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Section({ title, delay, children }: { title: string; delay: number; children: React.ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(350)} style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </Animated.View>
  );
}

function Choice({ label, sub, on, round, big, onPress }: { label: string; sub?: string; on: boolean; round?: boolean; big?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        feel.tick();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [styles.choice, round && styles.choiceRound, big && styles.choiceBig, on && styles.choiceOn, pressed && { transform: [{ scale: 0.95 }] }]}
    >
      <Text style={[styles.choiceText, big && { fontSize: 22 }, on && { color: "#111" }]}>{label}</Text>
      {sub && <Text style={[styles.choiceSub, on && { color: "rgba(0,0,0,0.55)" }]}>{sub}</Text>}
    </Pressable>
  );
}

/** A small phone showing where each player sits. */
function TablePreview({ players, onTapSeat }: { players: Array<{ name: string; color: number }>; onTapSeat: (i: number) => void }) {
  const layout = seatLayout(players.length);
  const block = (i: number) => {
    const c = PLAYER_COLORS[players[i].color];
    const r = seatRotation(layout, i);
    return (
      <Pressable key={i} onPress={() => onTapSeat(i)} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`Seat ${i + 1}`}>
        <LinearGradient colors={[c.from, c.to]} style={styles.previewSeat}>
          <Text style={[styles.previewNum, { transform: [{ rotate: `${r}deg` }] }]}>{i + 1}</Text>
        </LinearGradient>
      </Pressable>
    );
  };
  const sides = layout.left.length > 0;
  return (
    <View style={styles.preview}>
      {layout.top != null && <View style={styles.previewRow}>{block(layout.top)}</View>}
      {sides && (
        <View style={[styles.previewRow, { flex: layout.bottom != null ? (layout.left.length > 1 ? 2.6 : 1.7) : 1 }]}>
          <View style={styles.previewCol}>{layout.left.map(block)}</View>
          <View style={styles.previewCol}>{layout.right.map(block)}</View>
        </View>
      )}
      {layout.bottom != null && <View style={styles.previewRow}>{block(layout.bottom)}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: LIFE_BG },
  topBar: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 8 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)" },
  body: { paddingHorizontal: 20, paddingBottom: 40, gap: 26 },
  hero: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 6 },
  kicker: { fontFamily: font.bold, fontSize: 11, letterSpacing: 1.2, color: "#B79BFF" },
  title: { fontFamily: font.heavy, fontSize: 34, letterSpacing: -1, color: "#FFFFFF" },
  subtitle: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, color: "rgba(255,255,255,0.55)" },
  preview: { width: 92, height: 160, padding: 5, gap: 4, borderRadius: 20, backgroundColor: "#1A1B22", borderWidth: 2, borderColor: "#2A2C36" },
  previewRow: { flex: 1, flexDirection: "row", gap: 4 },
  previewCol: { flex: 1, gap: 4 },
  previewSeat: { flex: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  previewNum: { fontFamily: font.heavy, fontSize: 13, color: "#FFFFFF" },
  section: { gap: 12 },
  sectionTitle: { fontFamily: font.bold, fontSize: 11, letterSpacing: 1, color: "rgba(255,255,255,0.45)" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { minWidth: 56, height: 46, paddingHorizontal: 14, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  choiceRound: { width: 52, height: 52, minWidth: 0, borderRadius: 26, paddingHorizontal: 0 },
  choiceBig: { flexGrow: 1, flexBasis: 60, height: 64, borderRadius: 18 },
  choiceOn: { backgroundColor: "#FFFFFF" },
  choiceText: { fontFamily: font.heavy, fontSize: 18, color: "#FFFFFF", fontVariant: ["tabular-nums"] },
  choiceSub: { fontFamily: font.semibold, fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 1 },
  names: { gap: 8 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 12, height: 56, paddingLeft: 8, paddingRight: 16, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)" },
  swatch: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  swatchText: { fontFamily: font.heavy, fontSize: 15, color: "#FFFFFF" },
  nameInput: { flex: 1, height: 44, fontFamily: font.bold, fontSize: 16, color: "#FFFFFF" },
  hint: { fontFamily: font.medium, fontSize: 12, lineHeight: 17, color: "rgba(255,255,255,0.4)" },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: LIFE_BG },
  start: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 58, borderRadius: 29, backgroundColor: "#FFFFFF" },
  startText: { fontFamily: font.heavy, fontSize: 18, color: "#111" },
});
