import { create } from "zustand";
import {
  PLAYER_COLORS,
  type StartingLife,
  type TimerMinutes,
  type PlayerColor,
} from "../lib/lifeConstants";

export type GamePhase = "setup" | "playing" | "finished";

export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  life: number;
  poison: number;
  energy: number;
  experience: number;
  commanderDamage: Record<string, number>;
  timeRemainingMs: number;
  isEliminated: boolean;
}

export interface LifeState {
  startingLife: StartingLife;
  playerCount: number;
  timerMinutes: TimerMinutes | null;

  phase: GamePhase;
  players: Player[];
  activePlayerIndex: number;
  isClockRunning: boolean;
  globalElapsedMs: number;

  setStartingLife: (life: StartingLife) => void;
  setPlayerCount: (count: number) => void;
  setTimerMinutes: (minutes: TimerMinutes | null) => void;

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

export const useLifeStore = create<LifeState>((set, get) => ({
  startingLife: 40,
  playerCount: 4,
  timerMinutes: 60,

  phase: "setup",
  players: [],
  activePlayerIndex: 0,
  isClockRunning: false,
  globalElapsedMs: 0,

  setStartingLife: (life) => set({ startingLife: life }),
  setPlayerCount: (count) => set({ playerCount: Math.min(6, Math.max(2, count)) }),
  setTimerMinutes: (minutes) => set({ timerMinutes: minutes }),

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
            clockRunning = false;
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

export function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
