# Life Counter Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the mobile life counter with separated player cards, chess clock timers, swipe-up counter drawers, animated life changes, and elimination effects — all matching the web's dark slate + teal design system.

**Architecture:** Zustand store holds all game state (players, timers, counters, phase). The tab screen (`life.tsx`) renders one of three screens based on game phase. `PlayerCard` is the core component — it handles tap zones, animations, and hosts the `CounterDrawer`. `react-native-reanimated` drives all animations on the UI thread. `react-native-gesture-handler` powers the swipe-up drawer.

**Tech Stack:** Expo (React Native), expo-router, zustand, react-native-reanimated, react-native-gesture-handler, expo-haptics

---

### Task 1: Install react-native-gesture-handler

**Files:**
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: Install the dependency**

```bash
cd apps/mobile && npx expo install react-native-gesture-handler
```

- [ ] **Step 2: Verify it installed**

```bash
node -e "require('react-native-gesture-handler/package.json').version" 
```

Expected: prints a version string like `2.x.x`

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/package.json apps/mobile/package-lock.json ../../package-lock.json
git commit -m "chore(mobile): install react-native-gesture-handler"
```

---

### Task 2: Create lifeConstants.ts

**Files:**
- Create: `apps/mobile/src/lib/lifeConstants.ts`

- [ ] **Step 1: Create the constants file**

```typescript
// apps/mobile/src/lib/lifeConstants.ts

// ── UI Colors (matching web design system) ──────────────────────────────────

export const LC = {
  bg:             "#0F1117",
  surface:        "#161B27",
  surfaceRaised:  "#1E2535",
  surfaceSunken:  "#0A0D13",
  surfaceOverlay: "rgba(22,27,39,0.92)",

  border:       "#1E2D3D",
  borderStrong: "#2D4059",

  textPrimary:   "#E2E8F0",
  textSecondary: "#94A3B8",
  textMuted:     "#475569",

  accent:      "#0D9488",
  accentHover: "#14B8A6",
  accentText:  "#2DD4BF",

  danger:  "#F43F5E",
  success: "#22C55E",
  warning: "#FB923C",
} as const;

// ── Player Colors ───────────────────────────────────────────────────────────

export interface PlayerColor {
  base: string;
  active: string;
}

export const PLAYER_COLORS: PlayerColor[] = [
  { base: "#0D9488", active: "#2DD4BF" },  // Teal
  { base: "#0EA5E9", active: "#38BDF8" },  // Sky
  { base: "#8B5CF6", active: "#A78BFA" },  // Purple
  { base: "#F59E0B", active: "#FBBF24" },  // Amber
  { base: "#F43F5E", active: "#FB7185" },  // Rose
  { base: "#10B981", active: "#34D399" },  // Emerald
];

// ── Starting Life Options ───────────────────────────────────────────────────

export const LIFE_OPTIONS = [20, 30, 40, 60] as const;
export type StartingLife = (typeof LIFE_OPTIONS)[number];

// ── Timer Options (minutes) ─────────────────────────────────────────────────

export const TIMER_OPTIONS = [15, 30, 60, 90] as const;
export type TimerMinutes = (typeof TIMER_OPTIONS)[number];

// ── Counter Definitions ─────────────────────────────────────────────────────

export interface CounterDef {
  key: string;
  label: string;
  color: string;
  max: number | null;       // null = unlimited
  eliminationAt: number | null; // null = no elimination
}

export const COUNTERS: CounterDef[] = [
  { key: "poison",     label: "PSN", color: "#A78BFA", max: null, eliminationAt: 10 },
  { key: "energy",     label: "NRG", color: "#FB923C", max: null, eliminationAt: null },
  { key: "commander",  label: "CMD", color: "#F43F5E", max: null, eliminationAt: 21 },
  { key: "experience", label: "EXP", color: "#22C55E", max: null, eliminationAt: null },
];

// ── Elimination Quips ───────────────────────────────────────────────────────

export const ELIMINATION_QUIPS = [
  "Skill issue",
  "Should've played blue",
  "That's rough, buddy",
  "Lands in front, please",
  "They had the nuts",
  "At least you have your health... oh wait",
  "First blood",
  "Back to the command zone",
  "Maybe next pod",
  "You were the threat all along",
  "Mana screwed, probably",
  "The stack resolves... you don't",
  "Press F",
  "You died as you lived -- tapped out",
  "Should've mulliganed",
] as const;

export function randomQuip(): string {
  return ELIMINATION_QUIPS[Math.floor(Math.random() * ELIMINATION_QUIPS.length)];
}

// ── Shadows (matching web) ──────────────────────────────────────────────────

export const SHADOWS = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 3,
  },
  elevated: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/lib/lifeConstants.ts
git commit -m "feat(mobile): add life counter design tokens and constants"
```

---

### Task 3: Rewrite lifeStore.ts

**Files:**
- Rewrite: `apps/mobile/src/store/lifeStore.ts`

- [ ] **Step 1: Write the new store**

```typescript
// apps/mobile/src/store/lifeStore.ts

import { create } from "zustand";
import {
  PLAYER_COLORS,
  type StartingLife,
  type TimerMinutes,
  type PlayerColor,
} from "../lib/lifeConstants";

// ── Types ────────────────────────────────────────────────────────────────────

export type GamePhase = "setup" | "playing" | "finished";

export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  life: number;
  poison: number;
  energy: number;
  experience: number;
  /** commander source id → damage taken from that commander */
  commanderDamage: Record<string, number>;
  timeRemainingMs: number;
  isEliminated: boolean;
}

export interface LifeState {
  // Setup
  startingLife: StartingLife;
  playerCount: number;
  timerMinutes: TimerMinutes | null; // null = no timer

  // Game
  phase: GamePhase;
  players: Player[];
  activePlayerIndex: number;
  isClockRunning: boolean;
  globalElapsedMs: number;

  // Setup actions
  setStartingLife: (life: StartingLife) => void;
  setPlayerCount: (count: number) => void;
  setTimerMinutes: (minutes: TimerMinutes | null) => void;

  // Game actions
  startGame: () => void;
  adjustLife: (playerId: string, delta: number) => void;
  adjustPoison: (playerId: string, delta: number) => void;
  adjustEnergy: (playerId: string, delta: number) => void;
  adjustExperience: (playerId: string, delta: number) => void;
  adjustCommanderDamage: (targetId: string, sourceId: string, delta: number) => void;
  startClock: () => void;
  stopClock: () => void;
  passTurn: () => void;
  tick: (deltaMs: number) => void;
  resetGame: () => void;
  backToSetup: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePlayers(count: number, life: number, timerMs: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i + 1}`,
    color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    life,
    poison: 0,
    energy: 0,
    experience: 0,
    commanderDamage: {},
    timeRemainingMs: timerMs,
    isEliminated: false,
  }));
}

function checkEliminated(p: Player): boolean {
  if (p.life <= 0) return true;
  if (p.poison >= 10) return true;
  const maxCmd = Math.max(0, ...Object.values(p.commanderDamage));
  if (maxCmd >= 21) return true;
  return false;
}

function nextAliveIndex(players: Player[], currentIndex: number): number {
  const len = players.length;
  for (let i = 1; i <= len; i++) {
    const idx = (currentIndex + i) % len;
    if (!players[idx].isEliminated) return idx;
  }
  return -1;
}

function countAlive(players: Player[]): number {
  return players.filter((p) => !p.isEliminated).length;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useLifeStore = create<LifeState>((set, get) => ({
  // Setup defaults
  startingLife: 40,
  playerCount: 4,
  timerMinutes: 60,

  // Game defaults
  phase: "setup",
  players: [],
  activePlayerIndex: 0,
  isClockRunning: false,
  globalElapsedMs: 0,

  // ── Setup actions ──────────────────────────────────────────────────────

  setStartingLife: (life) => set({ startingLife: life }),
  setPlayerCount: (count) => set({ playerCount: Math.min(6, Math.max(2, count)) }),
  setTimerMinutes: (minutes) => set({ timerMinutes: minutes }),

  // ── Game actions ───────────────────────────────────────────────────────

  startGame: () => {
    const { startingLife, playerCount, timerMinutes } = get();
    const perPlayerMs = timerMinutes ? (timerMinutes * 60 * 1000) / playerCount : 0;
    set({
      phase: "playing",
      players: makePlayers(playerCount, startingLife, perPlayerMs),
      activePlayerIndex: 0,
      isClockRunning: false,
      globalElapsedMs: 0,
    });
  },

  adjustLife: (playerId, delta) =>
    set((s) => {
      const players = s.players.map((p) => {
        if (p.id !== playerId || p.isEliminated) return p;
        const updated = { ...p, life: p.life + delta };
        if (checkEliminated(updated)) updated.isEliminated = true;
        return updated;
      });
      const alive = countAlive(players);
      return {
        players,
        phase: alive <= 1 ? "finished" : s.phase,
        isClockRunning: alive <= 1 ? false : s.isClockRunning,
      };
    }),

  adjustPoison: (playerId, delta) =>
    set((s) => {
      const players = s.players.map((p) => {
        if (p.id !== playerId || p.isEliminated) return p;
        const updated = { ...p, poison: Math.max(0, p.poison + delta) };
        if (checkEliminated(updated)) updated.isEliminated = true;
        return updated;
      });
      const alive = countAlive(players);
      return {
        players,
        phase: alive <= 1 ? "finished" : s.phase,
        isClockRunning: alive <= 1 ? false : s.isClockRunning,
      };
    }),

  adjustEnergy: (playerId, delta) =>
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId && !p.isEliminated
          ? { ...p, energy: Math.max(0, p.energy + delta) }
          : p
      ),
    })),

  adjustExperience: (playerId, delta) =>
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId && !p.isEliminated
          ? { ...p, experience: Math.max(0, p.experience + delta) }
          : p
      ),
    })),

  adjustCommanderDamage: (targetId, sourceId, delta) =>
    set((s) => {
      const players = s.players.map((p) => {
        if (p.id !== targetId || p.isEliminated) return p;
        const prev = p.commanderDamage[sourceId] ?? 0;
        const next = Math.max(0, prev + delta);
        const actualDelta = next - prev;
        const updated = {
          ...p,
          life: p.life - actualDelta,
          commanderDamage: { ...p.commanderDamage, [sourceId]: next },
        };
        if (checkEliminated(updated)) updated.isEliminated = true;
        return updated;
      });
      const alive = countAlive(players);
      return {
        players,
        phase: alive <= 1 ? "finished" : s.phase,
        isClockRunning: alive <= 1 ? false : s.isClockRunning,
      };
    }),

  startClock: () => set({ isClockRunning: true }),
  stopClock: () => set({ isClockRunning: false }),

  passTurn: () =>
    set((s) => {
      const next = nextAliveIndex(s.players, s.activePlayerIndex);
      if (next === -1) return { phase: "finished", isClockRunning: false };
      return { activePlayerIndex: next, isClockRunning: false };
    }),

  tick: (deltaMs) =>
    set((s) => {
      if (s.phase !== "playing" || !s.isClockRunning || !s.timerMinutes) return {};
      const active = s.players[s.activePlayerIndex];
      if (!active || active.isEliminated) return {};

      const newTime = active.timeRemainingMs - deltaMs;
      let players = s.players.map((p, i) =>
        i === s.activePlayerIndex ? { ...p, timeRemainingMs: Math.max(0, newTime) } : p
      );

      let activeIndex = s.activePlayerIndex;
      let phase: GamePhase = s.phase;
      let clockRunning = s.isClockRunning;

      if (newTime <= 0) {
        players = players.map((p, i) =>
          i === s.activePlayerIndex ? { ...p, isEliminated: true, timeRemainingMs: 0 } : p
        );
        if (countAlive(players) <= 1) {
          phase = "finished";
          clockRunning = false;
        } else {
          const next = nextAliveIndex(players, s.activePlayerIndex);
          if (next === -1) {
            phase = "finished";
            clockRunning = false;
          } else {
            activeIndex = next;
            clockRunning = false; // manual start required
          }
        }
      }

      return {
        players,
        activePlayerIndex: activeIndex,
        phase,
        isClockRunning: clockRunning,
        globalElapsedMs: s.globalElapsedMs + deltaMs,
      };
    }),

  resetGame: () => {
    const { startingLife, playerCount, timerMinutes } = get();
    const perPlayerMs = timerMinutes ? (timerMinutes * 60 * 1000) / playerCount : 0;
    set({
      phase: "playing",
      players: makePlayers(playerCount, startingLife, perPlayerMs),
      activePlayerIndex: 0,
      isClockRunning: false,
      globalElapsedMs: 0,
    });
  },

  backToSetup: () => set({ phase: "setup", players: [], isClockRunning: false }),
}));

// ── Helpers for formatting ───────────────────────────────────────────────────

export function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/store/lifeStore.ts
git commit -m "feat(mobile): rewrite lifeStore with timers, counters, elimination"
```

---

### Task 4: Create SetupScreen.tsx

**Files:**
- Create: `apps/mobile/src/screens/life/SetupScreen.tsx`

- [ ] **Step 1: Create the setup screen**

```typescript
// apps/mobile/src/screens/life/SetupScreen.tsx

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useLifeStore } from "../../store/lifeStore";
import {
  LC,
  LIFE_OPTIONS,
  TIMER_OPTIONS,
  type StartingLife,
  type TimerMinutes,
} from "../../lib/lifeConstants";

function OptionCard({
  value,
  active,
  accentColor,
  onPress,
  children,
}: {
  value: string | number;
  active: boolean;
  accentColor: string;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.optionCard,
        active && {
          borderColor: `${accentColor}4D`, // 30% opacity
          shadowColor: accentColor,
          shadowOpacity: 0.08,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
          transform: [{ translateY: -2 }],
        },
      ]}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      activeOpacity={0.7}
    >
      {children ?? (
        <Text
          style={[
            styles.optionNum,
            active && { color: accentColor },
          ]}
        >
          {value}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export function SetupScreen() {
  const {
    startingLife,
    playerCount,
    timerMinutes,
    setStartingLife,
    setPlayerCount,
    setTimerMinutes,
    startGame,
  } = useLifeStore();

  // Shimmer animation for start button
  const shimmerX = useSharedValue(-1);
  React.useEffect(() => {
    shimmerX.value = withRepeat(
      withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, [shimmerX]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value * 200 }],
  }));

  const perPlayer =
    timerMinutes && playerCount > 0
      ? Math.floor(timerMinutes / playerCount)
      : null;

  return (
    <View style={styles.root}>
      {/* Ambient glow */}
      <View style={styles.ambientGlow} pointerEvents="none" />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>New Game</Text>
          <Text style={styles.subtitle}>Configure your battle</Text>
        </View>

        {/* Starting Life */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Starting Life</Text>
          <View style={styles.row}>
            {LIFE_OPTIONS.map((life) => (
              <OptionCard
                key={life}
                value={life}
                active={startingLife === life}
                accentColor={LC.accentText}
                onPress={() => setStartingLife(life as StartingLife)}
              />
            ))}
          </View>
        </View>

        {/* Players */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Players</Text>
          <View style={styles.row}>
            {[2, 3, 4, 5, 6].map((count) => (
              <OptionCard
                key={count}
                value={count}
                active={playerCount === count}
                accentColor="#38BDF8"
                onPress={() => setPlayerCount(count)}
              >
                <Text
                  style={[
                    styles.optionNum,
                    playerCount === count && { color: "#38BDF8" },
                  ]}
                >
                  {count}
                </Text>
                <View style={styles.dotRow}>
                  {Array.from({ length: count }, (_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        playerCount === count && {
                          backgroundColor: "rgba(56,189,248,0.5)",
                        },
                      ]}
                    />
                  ))}
                </View>
              </OptionCard>
            ))}
          </View>
        </View>

        {/* Game Clock */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Game Clock</Text>
          <View style={styles.row}>
            {TIMER_OPTIONS.map((mins) => (
              <OptionCard
                key={mins}
                value={mins}
                active={timerMinutes === mins}
                accentColor={LC.warning}
                onPress={() => setTimerMinutes(mins as TimerMinutes)}
              >
                <Text
                  style={[
                    styles.optionNum,
                    timerMinutes === mins && { color: "#FBBF24" },
                  ]}
                >
                  {mins}
                </Text>
                <Text
                  style={[
                    styles.optionSub,
                    timerMinutes === mins && { color: "rgba(251,191,36,0.4)" },
                  ]}
                >
                  min
                </Text>
              </OptionCard>
            ))}
          </View>
          <TouchableOpacity
            style={[
              styles.noTimerChip,
              timerMinutes === null && styles.noTimerChipActive,
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setTimerMinutes(null);
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.noTimerText,
                timerMinutes === null && styles.noTimerTextActive,
              ]}
            >
              No Timer
            </Text>
          </TouchableOpacity>
          {perPlayer !== null && (
            <View style={styles.timerSummary}>
              <Text style={styles.timerSummaryText}>
                <Text style={styles.timerHighlight}>{perPlayer} min</Text>
                {" per player · "}
                <Text style={styles.timerHighlight}>{timerMinutes} min</Text>
                {" total"}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Start button — pinned to bottom */}
      <View style={styles.startWrap}>
        <View style={styles.bottomGlow} pointerEvents="none" />
        <TouchableOpacity
          style={styles.startBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            startGame();
          }}
          activeOpacity={0.9}
        >
          <Animated.View style={[styles.shimmer, shimmerStyle]} />
          <Text style={styles.startText}>Start Game</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: LC.bg,
  },
  ambientGlow: {
    position: "absolute",
    top: -100,
    alignSelf: "center",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(13,148,136,0.06)",
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 36,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: LC.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 11,
    color: LC.textMuted,
    marginTop: 4,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  section: {
    marginBottom: 22,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: LC.textMuted,
    marginBottom: 10,
    paddingLeft: 2,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  optionCard: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(30,45,61,0.4)",
    backgroundColor: "rgba(255,255,255,0.015)",
  },
  optionNum: {
    fontSize: 24,
    fontWeight: "900",
    color: LC.textMuted,
    letterSpacing: -0.5,
  },
  optionSub: {
    fontSize: 8,
    fontWeight: "500",
    color: "rgba(71,85,105,0.4)",
    marginTop: 2,
  },
  dotRow: {
    flexDirection: "row",
    gap: 3,
    marginTop: 6,
    justifyContent: "center",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(30,45,61,0.6)",
  },
  noTimerChip: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(30,45,61,0.4)",
    backgroundColor: "rgba(255,255,255,0.015)",
    alignItems: "center",
  },
  noTimerChipActive: {
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  noTimerText: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(34,38,50,0.8)",
    letterSpacing: 0.5,
  },
  noTimerTextActive: {
    color: LC.textMuted,
  },
  timerSummary: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(251,146,60,0.04)",
    borderWidth: 1,
    borderColor: "rgba(251,146,60,0.08)",
    alignItems: "center",
  },
  timerSummaryText: {
    fontSize: 11,
    color: LC.textMuted,
    fontWeight: "500",
  },
  timerHighlight: {
    color: LC.warning,
    fontWeight: "800",
  },
  startWrap: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  bottomGlow: {
    position: "absolute",
    bottom: 0,
    left: "10%",
    right: "10%",
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(13,148,136,0.1)",
  },
  startBtn: {
    paddingVertical: 18,
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LC.accent,
  },
  shimmer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "60%",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  startText: {
    fontSize: 16,
    fontWeight: "800",
    color: "white",
    letterSpacing: 0.3,
  },
});
```

- [ ] **Step 2: Commit**

```bash
mkdir -p apps/mobile/src/screens/life
git add apps/mobile/src/screens/life/SetupScreen.tsx
git commit -m "feat(mobile): add life counter SetupScreen"
```

---

### Task 5: Create CenterStrip.tsx and CoinFlip.tsx

**Files:**
- Create: `apps/mobile/src/components/life/CenterStrip.tsx`
- Create: `apps/mobile/src/components/life/CoinFlip.tsx`

- [ ] **Step 1: Create CoinFlip component**

```typescript
// apps/mobile/src/components/life/CoinFlip.tsx

import React, { useEffect } from "react";
import { Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { LC } from "../../lib/lifeConstants";

interface Props {
  result: "HEADS" | "TAILS";
  onDismiss: () => void;
}

export function CoinFlip({ result, onDismiss }: Props) {
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
    opacity.value = withTiming(1, { duration: 150 });

    // Auto-dismiss after 2.5s
    const timeout = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 300 }, (finished) => {
        if (finished) runOnJS(onDismiss)();
      });
    }, 2500);

    return () => clearTimeout(timeout);
  }, [scale, opacity, onDismiss]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.container, animStyle]}>
      <Text style={styles.text}>{result}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: LC.surfaceRaised,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: LC.borderStrong,
  },
  text: {
    color: LC.textPrimary,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
    textAlign: "center",
  },
});
```

- [ ] **Step 2: Create CenterStrip component**

```typescript
// apps/mobile/src/components/life/CenterStrip.tsx

import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { useLifeStore, formatTime } from "../../store/lifeStore";
import { LC } from "../../lib/lifeConstants";
import { CoinFlip } from "./CoinFlip";

export function CenterStrip() {
  const { globalElapsedMs, isClockRunning, timerMinutes, resetGame, backToSetup } =
    useLifeStore();
  const [coinResult, setCoinResult] = useState<"HEADS" | "TAILS" | null>(null);

  const flipCoin = useCallback(() => {
    const result = Math.random() < 0.5 ? "HEADS" : "TAILS";
    setCoinResult(result);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const handleSettings = useCallback(() => {
    Alert.alert("End Game?", "Return to setup.", [
      { text: "Stay", style: "cancel" },
      { text: "End Game", style: "destructive", onPress: backToSetup },
    ]);
  }, [backToSetup]);

  const handleReset = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert("Reset Game?", "All life totals return to starting values.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => {
          resetGame();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        },
      },
    ]);
  }, [resetGame]);

  return (
    <View style={styles.strip}>
      <TouchableOpacity style={styles.btn} onPress={handleSettings} activeOpacity={0.7}>
        <Text style={styles.btnText}>Settings</Text>
      </TouchableOpacity>

      {coinResult ? (
        <CoinFlip result={coinResult} onDismiss={() => setCoinResult(null)} />
      ) : (
        <Text style={[styles.timer, isClockRunning && styles.timerActive]}>
          {timerMinutes ? formatTime(globalElapsedMs) : "--:--"}
        </Text>
      )}

      <View style={styles.rightBtns}>
        <TouchableOpacity style={styles.btn} onPress={flipCoin} activeOpacity={0.7}>
          <Text style={styles.btnText}>Flip</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={handleReset} activeOpacity={0.7}>
          <Text style={styles.btnText}>Reset</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    height: 44,
    backgroundColor: LC.surfaceSunken,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: LC.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: LC.surfaceRaised,
    borderWidth: 1,
    borderColor: LC.border,
  },
  btnText: {
    fontSize: 11,
    fontWeight: "700",
    color: LC.textMuted,
  },
  rightBtns: {
    flexDirection: "row",
    gap: 6,
  },
  timer: {
    fontFamily: "monospace",
    fontSize: 13,
    fontWeight: "700",
    color: LC.textMuted,
    letterSpacing: 0.5,
    fontVariant: ["tabular-nums"],
  },
  timerActive: {
    color: LC.success,
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/life/CoinFlip.tsx apps/mobile/src/components/life/CenterStrip.tsx
git commit -m "feat(mobile): add CenterStrip and CoinFlip components"
```

---

### Task 6: Create CounterDrawer.tsx

**Files:**
- Create: `apps/mobile/src/components/life/CounterDrawer.tsx`

- [ ] **Step 1: Create the counter drawer**

```typescript
// apps/mobile/src/components/life/CounterDrawer.tsx

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useLifeStore, type Player } from "../../store/lifeStore";
import { LC, COUNTERS } from "../../lib/lifeConstants";

interface Props {
  player: Player;
  visible: boolean;
  onClose: () => void;
}

export function CounterDrawer({ player, visible, onClose }: Props) {
  const {
    adjustPoison,
    adjustEnergy,
    adjustExperience,
    adjustCommanderDamage,
    players,
  } = useLifeStore();

  const translateY = useSharedValue(visible ? 0 : 300);

  React.useEffect(() => {
    translateY.value = visible
      ? withSpring(0, { damping: 18, stiffness: 180 })
      : withTiming(300, { duration: 200 });
  }, [visible, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const counterValues: Record<string, number> = {
    poison: player.poison,
    energy: player.energy,
    commander: Object.values(player.commanderDamage).reduce((a, b) => a + b, 0),
    experience: player.experience,
  };

  const adjustCounter = (key: string, delta: number) => {
    Haptics.selectionAsync();
    switch (key) {
      case "poison":
        adjustPoison(player.id, delta);
        break;
      case "energy":
        adjustEnergy(player.id, delta);
        break;
      case "experience":
        adjustExperience(player.id, delta);
        break;
      case "commander": {
        // For simplicity, apply to first non-self player.
        // A more complete UI would let the user pick the source.
        const source = players.find((p) => p.id !== player.id);
        if (source) adjustCommanderDamage(player.id, source.id, delta);
        break;
      }
    }
  };

  if (!visible) return null;

  return (
    <TouchableOpacity
      style={StyleSheet.absoluteFill}
      activeOpacity={1}
      onPress={onClose}
    >
      <Animated.View style={[styles.drawer, animStyle]}>
        <TouchableOpacity activeOpacity={1}>
          <View style={styles.handle} />
          <View style={styles.grid}>
            {COUNTERS.map((counter) => (
              <View key={counter.key} style={styles.tile}>
                <View style={[styles.iconWrap, { backgroundColor: `${counter.color}18` }]}>
                  <Text style={[styles.iconText, { color: counter.color }]}>
                    {counter.label}
                  </Text>
                </View>
                <View style={styles.tileInfo}>
                  <Text style={styles.tileLabel}>{counter.label}</Text>
                  <Text style={[styles.tileValue, { color: counter.color }]}>
                    {counterValues[counter.key] ?? 0}
                  </Text>
                </View>
                <View style={styles.tileControls}>
                  <TouchableOpacity
                    style={styles.counterBtn}
                    onPress={() => adjustCounter(counter.key, 1)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.counterBtnText}>+</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.counterBtn}
                    onPress={() => adjustCounter(counter.key, -1)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.counterBtnText}>-</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  drawer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: LC.surfaceOverlay,
    borderTopWidth: 1,
    borderColor: LC.borderStrong,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 14,
    paddingBottom: 18,
    paddingTop: 10,
  },
  handle: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tile: {
    width: "48%",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  tileInfo: {
    flex: 1,
  },
  tileLabel: {
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: LC.textMuted,
    marginBottom: 1,
  },
  tileValue: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  tileControls: {
    gap: 4,
  },
  counterBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  counterBtnText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
    fontWeight: "300",
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/life/CounterDrawer.tsx
git commit -m "feat(mobile): add CounterDrawer component"
```

---

### Task 7: Create PlayerCard.tsx

**Files:**
- Create: `apps/mobile/src/components/life/PlayerCard.tsx`

This is the core component with all animations. It replaces the old `PlayerPanel.tsx`.

- [ ] **Step 1: Create PlayerCard**

```typescript
// apps/mobile/src/components/life/PlayerCard.tsx

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  withDelay,
  Easing,
  runOnJS,
  interpolateColor,
  cancelAnimation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useLifeStore, formatTime, type Player } from "../../store/lifeStore";
import { LC, SHADOWS, randomQuip } from "../../lib/lifeConstants";
import { CounterDrawer } from "./CounterDrawer";

interface Props {
  player: Player;
  playerIndex: number;
  isActivePlayer: boolean;
  hasTimer: boolean;
  compact?: boolean;
}

export function PlayerCard({
  player,
  playerIndex,
  isActivePlayer,
  hasTimer,
  compact = false,
}: Props) {
  const { adjustLife, startClock, isClockRunning } = useLifeStore();
  const color = player.color;

  // ── Animation values ───────────────────────────────────────────────────
  const lifeScale = useSharedValue(1);
  const lifeColorProgress = useSharedValue(0); // 0=white, -1=red, 1=green
  const shakeX = useSharedValue(0);
  const shakeRotate = useSharedValue(0);
  const borderFlash = useSharedValue(0); // 0=normal, -1=red, 1=green
  const vignetteOpacity = useSharedValue(0);
  const dangerPulse = useSharedValue(0);

  // ── Delta floater ──────────────────────────────────────────────────────
  const [floatingDelta, setFloatingDelta] = useState<{ value: number; key: number } | null>(null);
  const floaterOpacity = useSharedValue(0);
  const floaterY = useSharedValue(0);
  const deltaAccum = useRef(0);
  const deltaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const floaterKey = useRef(0);

  // ── Counter drawer ─────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Elimination quip ───────────────────────────────────────────────────
  const [quip] = useState(() => randomQuip());

  // ── Danger pulse loop ──────────────────────────────────────────────────
  const isLow = player.life > 0 && player.life <= 5 && !player.isEliminated;

  useEffect(() => {
    if (isLow) {
      dangerPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 750, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(dangerPulse);
      dangerPulse.value = withTiming(0, { duration: 200 });
    }
  }, [isLow, dangerPulse]);

  // ── Non-zero counter dots ──────────────────────────────────────────────
  const counterDots: string[] = [];
  if (player.poison > 0) counterDots.push("#A78BFA");
  if (player.energy > 0) counterDots.push("#FB923C");
  const cmdTotal = Object.values(player.commanderDamage).reduce((a, b) => a + b, 0);
  if (cmdTotal > 0) counterDots.push("#F43F5E");
  if (player.experience > 0) counterDots.push("#22C55E");

  // ── Core tap handler ──────────────────────────────────────────────────
  const applyDelta = useCallback(
    (delta: number) => {
      if (player.isEliminated) return;
      adjustLife(player.id, delta);

      const isBig = Math.abs(delta) >= 5;
      const isDamage = delta < 0;
      Haptics.impactAsync(
        isBig ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light
      );

      // Number scale
      const target = isDamage ? (isBig ? 1.12 : 1) : isBig ? 1.08 : 1;
      if (target !== 1) {
        lifeScale.value = withSequence(
          withTiming(target, { duration: isBig ? 150 : 80 }),
          withSpring(1, { damping: isBig ? 10 : 14, stiffness: isBig ? 120 : 180 })
        );
      }

      // Color flash
      lifeColorProgress.value = isDamage ? -1 : 1;
      lifeColorProgress.value = withTiming(0, {
        duration: isBig ? 800 : 600,
        easing: Easing.out(Easing.cubic),
      });

      // Border flash
      borderFlash.value = isDamage ? -1 : 1;
      borderFlash.value = withTiming(0, { duration: 600 });

      // Shake (damage only)
      if (isDamage) {
        const magnitude = isBig ? 12 : 6;
        const rotateMag = isBig ? 1.5 : 0.5;
        shakeX.value = withSequence(
          withTiming(-magnitude, { duration: 50 }),
          withTiming(magnitude * 0.8, { duration: 50 }),
          withTiming(-magnitude * 0.6, { duration: 50 }),
          withTiming(magnitude * 0.4, { duration: 50 }),
          withTiming(-magnitude * 0.2, { duration: 50 }),
          withTiming(0, { duration: 50 })
        );
        shakeRotate.value = withSequence(
          withTiming(-rotateMag, { duration: 60 }),
          withTiming(rotateMag * 0.7, { duration: 60 }),
          withTiming(0, { duration: 80 })
        );
      }

      // Vignette (big damage only)
      if (isDamage && isBig) {
        vignetteOpacity.value = withSequence(
          withTiming(0.12, { duration: 150 }),
          withTiming(0, { duration: 650 })
        );
      }

      // Floating delta
      deltaAccum.current += delta;
      floaterKey.current += 1;
      setFloatingDelta({ value: deltaAccum.current, key: floaterKey.current });
      floaterOpacity.value = 1;
      floaterY.value = 0;

      if (deltaTimer.current) clearTimeout(deltaTimer.current);
      deltaTimer.current = setTimeout(() => {
        floaterOpacity.value = withTiming(0, { duration: 500 });
        floaterY.value = withTiming(-40, { duration: 500 }, (finished) => {
          if (finished) {
            runOnJS(setFloatingDelta)(null);
            deltaAccum.current = 0;
          }
        });
      }, 1200);
    },
    [
      player.id,
      player.isEliminated,
      adjustLife,
      lifeScale,
      lifeColorProgress,
      borderFlash,
      shakeX,
      shakeRotate,
      vignetteOpacity,
      floaterOpacity,
      floaterY,
    ]
  );

  // ── Hold-to-repeat ─────────────────────────────────────────────────────
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdSpeed = useRef(300);

  const startHold = useCallback(
    (delta: number) => {
      holdSpeed.current = 320;
      const fire = () => {
        applyDelta(delta);
        holdSpeed.current = Math.max(55, holdSpeed.current * 0.8);
        holdTimer.current = setTimeout(fire, holdSpeed.current);
      };
      holdTimer.current = setTimeout(fire, 400);
    },
    [applyDelta]
  );

  const stopHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  // ── Card tap to start clock ────────────────────────────────────────────
  const handleCardTap = useCallback(() => {
    if (isActivePlayer && hasTimer && !isClockRunning && !player.isEliminated) {
      startClock();
      Haptics.selectionAsync();
    }
  }, [isActivePlayer, hasTimer, isClockRunning, player.isEliminated, startClock]);

  // ── Animated styles ────────────────────────────────────────────────────
  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: shakeX.value },
      { rotate: `${shakeRotate.value}deg` },
    ],
    borderColor: interpolateColor(
      borderFlash.value,
      [-1, 0, 1],
      ["rgba(244,63,94,0.6)", LC.border, "rgba(34,197,94,0.5)"]
    ),
  }));

  const dangerBorderStyle = useAnimatedStyle(() => ({
    borderColor: isLow
      ? interpolateColor(
          dangerPulse.value,
          [0, 1],
          [LC.border, "rgba(244,63,94,0.25)"]
        )
      : undefined,
  }));

  const lifeTextStyle = useAnimatedStyle(() => ({
    transform: [{ scale: lifeScale.value }],
    color: interpolateColor(
      lifeColorProgress.value,
      [-1, 0, 1],
      [LC.danger, LC.textPrimary, LC.success]
    ),
  }));

  const vignetteStyle = useAnimatedStyle(() => ({
    opacity: vignetteOpacity.value,
  }));

  const floaterAnimStyle = useAnimatedStyle(() => ({
    opacity: floaterOpacity.value,
    transform: [{ translateY: floaterY.value }],
  }));

  const dangerEdgeStyle = useAnimatedStyle(() => ({
    backgroundColor: isLow
      ? interpolateColor(dangerPulse.value, [0, 1], [color.base, LC.danger])
      : color.base,
    shadowColor: isLow
      ? interpolateColor(dangerPulse.value, [0, 1], [color.base, LC.danger])
      : color.base,
  }));

  // ── Sizes ──────────────────────────────────────────────────────────────
  const lifeSize = compact ? 56 : 88;

  return (
    <Animated.View
      style={[
        styles.card,
        SHADOWS.card,
        cardAnimStyle,
        isLow && dangerBorderStyle,
      ]}
    >
      {/* Edge glow */}
      <Animated.View style={[styles.edgeGlow, dangerEdgeStyle]} />

      {/* Red vignette (big damage) */}
      <Animated.View
        style={[styles.vignette, vignetteStyle]}
        pointerEvents="none"
      />

      {/* Timer badge */}
      {hasTimer && (
        <View
          style={[
            styles.timerBadge,
            isActivePlayer && isClockRunning && styles.timerBadgeActive,
          ]}
        >
          <Text
            style={[
              styles.timerText,
              isActivePlayer && isClockRunning && styles.timerTextActive,
            ]}
          >
            {formatTime(player.timeRemainingMs)}
          </Text>
        </View>
      )}

      {/* Tap to start clock hint */}
      {isActivePlayer && hasTimer && !isClockRunning && !player.isEliminated && (
        <TouchableOpacity
          style={styles.tapToStart}
          onPress={handleCardTap}
          activeOpacity={0.8}
        >
          <Text style={styles.tapToStartText}>Tap to start</Text>
        </TouchableOpacity>
      )}

      {/* Center content */}
      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.playerName, { color: `${color.active}99` }]}>
          {player.name}
        </Text>
        <Animated.Text
          style={[
            styles.lifeTotal,
            { fontSize: lifeSize, lineHeight: lifeSize },
            lifeTextStyle,
          ]}
        >
          {player.life}
        </Animated.Text>
        <Text style={styles.lifeLabel}>life</Text>
      </View>

      {/* Floating delta */}
      {floatingDelta && (
        <Animated.Text
          style={[
            styles.floater,
            floaterAnimStyle,
            {
              color: floatingDelta.value >= 0 ? LC.success : LC.danger,
              fontSize: Math.abs(floatingDelta.value) >= 5 ? 36 : 28,
            },
          ]}
          pointerEvents="none"
        >
          {floatingDelta.value > 0 ? `+${floatingDelta.value}` : `${floatingDelta.value}`}
        </Animated.Text>
      )}

      {/* Non-zero counter dots */}
      {counterDots.length > 0 && !drawerOpen && (
        <View style={styles.counterDots}>
          {counterDots.map((dotColor, i) => (
            <View
              key={i}
              style={[styles.counterDot, { backgroundColor: dotColor }]}
            />
          ))}
        </View>
      )}

      {/* Tap zones */}
      {!player.isEliminated && (
        <>
          <TouchableOpacity
            style={[styles.tapZone, styles.tapZoneLeft]}
            onPress={() => applyDelta(-1)}
            onLongPress={() => startHold(-1)}
            onPressOut={stopHold}
            delayLongPress={350}
            activeOpacity={1}
          >
            <View style={styles.tapZoneInner}>
              <Text style={[styles.tapGlyph, compact && { fontSize: 28 }]}>-</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tapZone, styles.tapZoneRight]}
            onPress={() => applyDelta(1)}
            onLongPress={() => startHold(1)}
            onPressOut={stopHold}
            delayLongPress={350}
            activeOpacity={1}
          >
            <View style={styles.tapZoneInner}>
              <Text style={[styles.tapGlyph, compact && { fontSize: 28 }]}>+</Text>
            </View>
          </TouchableOpacity>
        </>
      )}

      {/* Swipe-up pill */}
      {!player.isEliminated && (
        <TouchableOpacity
          style={styles.pillWrap}
          onPress={() => setDrawerOpen(true)}
          activeOpacity={0.6}
        >
          <View style={styles.pill} />
        </TouchableOpacity>
      )}

      {/* Eliminated overlay */}
      {player.isEliminated && (
        <View style={styles.eliminatedOverlay}>
          <Text style={styles.eliminatedX}>X</Text>
          <Text style={styles.eliminatedText}>ELIMINATED</Text>
          <Text style={[styles.eliminatedName, { color: `${color.active}80` }]}>
            {player.name}
          </Text>
          <Text style={styles.eliminatedQuip}>{quip}</Text>
        </View>
      )}

      {/* Counter drawer */}
      <CounterDrawer
        player={player}
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: LC.surface,
    borderWidth: 1,
    borderColor: LC.border,
    overflow: "hidden",
    position: "relative",
  },
  edgeGlow: {
    position: "absolute",
    top: 0,
    left: "20%",
    right: "20%",
    height: 2,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 2,
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 8,
    borderColor: "rgba(244,63,94,0.3)",
    backgroundColor: "transparent",
  },
  timerBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    zIndex: 5,
  },
  timerBadgeActive: {
    backgroundColor: "rgba(34,197,94,0.08)",
    borderColor: "rgba(34,197,94,0.2)",
  },
  timerText: {
    fontFamily: "monospace",
    fontSize: 11,
    fontWeight: "700",
    color: LC.textMuted,
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.5,
  },
  timerTextActive: {
    color: LC.success,
  },
  tapToStart: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(34,197,94,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.2)",
    zIndex: 5,
  },
  tapToStartText: {
    fontSize: 9,
    fontWeight: "700",
    color: LC.success,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playerName: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  lifeTotal: {
    fontWeight: "900",
    letterSpacing: -4,
    color: LC.textPrimary,
  },
  lifeLabel: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: LC.textMuted,
    marginTop: 4,
  },
  floater: {
    position: "absolute",
    top: "25%",
    alignSelf: "center",
    fontWeight: "800",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  counterDots: {
    position: "absolute",
    bottom: 22,
    alignSelf: "center",
    flexDirection: "row",
    gap: 5,
  },
  counterDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  tapZone: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "40%",
    justifyContent: "center",
  },
  tapZoneLeft: { left: 0 },
  tapZoneRight: { right: 0 },
  tapZoneInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  tapGlyph: {
    fontSize: 36,
    fontWeight: "200",
    color: "rgba(255,255,255,0.08)",
  },
  pillWrap: {
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    paddingVertical: 4,
    paddingHorizontal: 20,
  },
  pill: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  eliminatedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,13,19,0.85)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    zIndex: 20,
    gap: 4,
  },
  eliminatedX: {
    fontSize: 64,
    fontWeight: "900",
    color: LC.danger,
    letterSpacing: -2,
  },
  eliminatedText: {
    fontSize: 13,
    fontWeight: "800",
    color: LC.danger,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  eliminatedName: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  eliminatedQuip: {
    fontSize: 11,
    fontWeight: "500",
    color: LC.textSecondary,
    marginTop: 8,
    fontStyle: "italic",
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/life/PlayerCard.tsx
git commit -m "feat(mobile): add PlayerCard with animations, timer, counters"
```

---

### Task 8: Create GameScreen.tsx and GameOverScreen.tsx

**Files:**
- Create: `apps/mobile/src/screens/life/GameScreen.tsx`
- Create: `apps/mobile/src/screens/life/GameOverScreen.tsx`

- [ ] **Step 1: Create GameOverScreen**

```typescript
// apps/mobile/src/screens/life/GameOverScreen.tsx

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useLifeStore } from "../../store/lifeStore";
import { LC } from "../../lib/lifeConstants";

export function GameOverScreen() {
  const { players, resetGame, backToSetup } = useLifeStore();
  const winner = players.find((p) => !p.isEliminated);

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        {winner ? (
          <>
            <Text style={[styles.winnerName, { color: winner.color.active }]}>
              {winner.name}
            </Text>
            <Text style={styles.winsText}>Wins!</Text>
          </>
        ) : (
          <Text style={styles.winsText}>Draw!</Text>
        )}

        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.newGameBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              resetGame();
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.newGameText}>Play Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.setupBtn}
            onPress={() => {
              Haptics.selectionAsync();
              backToSetup();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.setupBtnText}>New Setup</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: LC.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  card: {
    backgroundColor: LC.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: LC.border,
    padding: 48,
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
  },
  winnerName: {
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1,
    marginBottom: 4,
  },
  winsText: {
    fontSize: 24,
    fontWeight: "800",
    color: LC.textPrimary,
    letterSpacing: -0.5,
  },
  buttons: {
    marginTop: 32,
    gap: 10,
    width: "100%",
  },
  newGameBtn: {
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: LC.accent,
    alignItems: "center",
  },
  newGameText: {
    fontSize: 15,
    fontWeight: "800",
    color: "white",
  },
  setupBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: LC.surfaceRaised,
    borderWidth: 1,
    borderColor: LC.border,
    alignItems: "center",
  },
  setupBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: LC.textSecondary,
  },
});
```

- [ ] **Step 2: Create GameScreen with adaptive layouts**

```typescript
// apps/mobile/src/screens/life/GameScreen.tsx

import React, { useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { useLifeStore } from "../../store/lifeStore";
import { LC } from "../../lib/lifeConstants";
import { PlayerCard } from "../../components/life/PlayerCard";
import { CenterStrip } from "../../components/life/CenterStrip";

export function GameScreen() {
  const { players, activePlayerIndex, timerMinutes, phase, isClockRunning, tick } =
    useLifeStore();
  const hasTimer = timerMinutes !== null;

  // Timer tick loop
  const lastTick = useRef(Date.now());
  useEffect(() => {
    if (phase !== "playing" || !isClockRunning || !hasTimer) return;
    const id = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTick.current;
      lastTick.current = now;
      tick(delta);
    }, 100);
    lastTick.current = Date.now();
    return () => clearInterval(id);
  }, [phase, isClockRunning, hasTimer, tick]);

  const count = players.length;

  // Split players into top (rotated) and bottom rows
  const topCount = count <= 2 ? 1 : count <= 4 ? 2 : 3;
  const topPlayers = players.slice(0, topCount);
  const bottomPlayers = players.slice(topCount);

  const renderCard = (player: typeof players[0], index: number, compact: boolean) => (
    <PlayerCard
      key={player.id}
      player={player}
      playerIndex={index}
      isActivePlayer={index === activePlayerIndex}
      hasTimer={hasTimer}
      compact={compact}
    />
  );

  const isCompact = count >= 3;

  return (
    <View style={styles.root}>
      {/* Top row — rotated 180° */}
      <View
        style={[
          styles.row,
          styles.rowTop,
          { transform: [{ rotate: "180deg" }] },
        ]}
      >
        {topPlayers.map((p, i) => renderCard(p, i, isCompact))}
      </View>

      {/* Center controls */}
      <CenterStrip />

      {/* Bottom row */}
      <View style={[styles.row, styles.rowBottom]}>
        {bottomPlayers.map((p, i) =>
          renderCard(p, topCount + i, isCompact)
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: LC.bg,
    padding: 6,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
  },
  rowTop: {
    marginBottom: 0,
  },
  rowBottom: {
    marginTop: 0,
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/life/GameScreen.tsx apps/mobile/src/screens/life/GameOverScreen.tsx
git commit -m "feat(mobile): add GameScreen with adaptive layouts and GameOverScreen"
```

---

### Task 9: Rewire life.tsx tab screen

**Files:**
- Modify: `apps/mobile/app/(tabs)/life.tsx`

- [ ] **Step 1: Replace the tab screen**

Replace the entire contents of `apps/mobile/app/(tabs)/life.tsx` with:

```typescript
// apps/mobile/app/(tabs)/life.tsx

import React from "react";
import { StatusBar } from "expo-status-bar";
import { useLifeStore } from "@/store/lifeStore";
import { SetupScreen } from "@/screens/life/SetupScreen";
import { GameScreen } from "@/screens/life/GameScreen";
import { GameOverScreen } from "@/screens/life/GameOverScreen";

export default function LifeScreen() {
  const phase = useLifeStore((s) => s.phase);

  return (
    <>
      <StatusBar hidden />
      {phase === "setup" && <SetupScreen />}
      {phase === "playing" && <GameScreen />}
      {phase === "finished" && <GameOverScreen />}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/\(tabs\)/life.tsx
git commit -m "feat(mobile): rewire life tab to new screen components"
```

---

### Task 10: Clean up old life components

**Files:**
- Delete: `apps/mobile/src/components/life/FormatPicker.tsx`
- Delete: `apps/mobile/src/components/life/CommanderDamageSheet.tsx`
- Keep: `apps/mobile/src/components/life/PlayerPanel.tsx` (delete after confirming nothing else imports it)

- [ ] **Step 1: Check for remaining imports of old components**

```bash
grep -r "FormatPicker\|CommanderDamageSheet\|PlayerPanel" apps/mobile/src apps/mobile/app --include="*.tsx" --include="*.ts" -l
```

Expected: only the old files themselves and possibly the old `life.tsx` (already replaced).

- [ ] **Step 2: Delete old components**

```bash
rm apps/mobile/src/components/life/FormatPicker.tsx
rm apps/mobile/src/components/life/CommanderDamageSheet.tsx
rm apps/mobile/src/components/life/PlayerPanel.tsx
```

- [ ] **Step 3: Commit**

```bash
git add -u apps/mobile/src/components/life/
git commit -m "chore(mobile): remove old life counter components"
```

---

### Task 11: Smoke test on device/simulator

- [ ] **Step 1: Start the dev server**

```bash
cd apps/mobile && npx expo start
```

- [ ] **Step 2: Verify setup screen**
- Open the Life tab
- Confirm: "New Game" title, Starting Life (20/30/40/60), Players (2-6), Game Clock (15/30/60/90 + No Timer), Start Game button
- Tap different options — confirm active states highlight correctly
- Confirm no emojis anywhere

- [ ] **Step 3: Verify playing screen**
- Start a 2-player game with 60 min timer
- Confirm: two separated cards, center strip, timer badges
- Tap +/- zones — confirm life changes with animations (shake, color flash, floating delta)
- Tap a card to start clock — confirm timer ticks
- Check hold-to-repeat works on +/-

- [ ] **Step 4: Verify counter drawer**
- Tap the pill at bottom of a player card
- Confirm: drawer slides up with PSN, NRG, CMD, EXP counters
- Adjust counters — confirm values update
- Close drawer — confirm counter dots appear for non-zero values

- [ ] **Step 5: Verify elimination**
- Reduce a player to 0 life
- Confirm: eliminated overlay with X, "ELIMINATED" text, funny quip, player name
- Confirm: game ends when only 1 player remains
- Confirm: Game Over screen shows winner name in their color

- [ ] **Step 6: Verify multi-player layouts**
- Start games with 3, 4, 5, 6 players
- Confirm: top row is rotated 180°, bottom row is normal
- Confirm: cards scale down (compact mode) appropriately

- [ ] **Step 7: Commit any fixes found during testing**

```bash
git add -A && git commit -m "fix(mobile): polish life counter from smoke testing"
```
