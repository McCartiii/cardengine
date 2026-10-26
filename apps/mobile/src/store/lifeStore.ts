// The life counter's state: the setup screen's choices and the game in
// progress, saved on the device so a game survives the app closing. Every
// change to the game can be undone.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as L from "../lib/lifeGame";
import { MAX_PLAYERS, MIN_PLAYERS, PLAYER_COLORS, defaultName } from "../lib/lifeConstants";

const HISTORY_LIMIT = 60;
/** Taps on the same thing this close together undo as one step. */
const COALESCE_MS = 1500;

export interface LifeSetup {
  startingLife: number;
  clockMinutes: number | null;
  players: L.NewPlayer[];
}

interface LifeState {
  setup: LifeSetup;
  game: L.LifeGame | null;
  history: L.LifeGame[];
  /** Bumps on undo, so panels can skip their hit and heal effects. */
  undoNonce: number;
  /** The winner overlay was closed for this game. */
  winnerDismissed: string | null;

  setStartingLife: (life: number) => void;
  setClock: (minutes: number | null) => void;
  setPlayerCount: (count: number) => void;
  renamePlayer: (index: number, name: string) => void;
  cycleColor: (index: number) => void;
  setPlayerArt: (index: number, art: L.PlayerArt | null) => void;

  start: () => void;
  rematch: () => void;
  endGame: () => void;

  life: (id: string, delta: number) => void;
  counter: (id: string, key: L.CounterKey, delta: number) => void;
  commanderDamage: (targetId: string, source: string, delta: number) => void;
  setPartner: (id: string, partner: boolean) => void;
  concede: (id: string, conceded: boolean) => void;
  setArt: (id: string, art: L.PlayerArt | null) => void;

  startTurns: (first: number) => void;
  passTurn: () => void;
  pause: () => void;
  resume: () => void;
  tickClock: () => void;

  undo: () => void;
  dismissWinner: () => void;
}

let lastEdit: { key: string; at: number } | null = null;

function defaultPlayers(count: number): L.NewPlayer[] {
  return Array.from({ length: count }, (_, i) => ({ name: defaultName(i), color: i % PLAYER_COLORS.length }));
}

export const useLifeStore = create<LifeState>()(
  persist(
    (set, get) => {
      /** Applies a change to the game, recording an undo step. */
      const change = (fn: (g: L.LifeGame, now: number) => L.LifeGame, coalesceKey?: string) => {
        const { game, history } = get();
        if (!game) return;
        const now = Date.now();
        let next = L.fixActive(fn(game, now), now);
        // Nobody's clock runs once the game is won.
        if (L.winnerOf(next)) next = L.pauseClock(next, now);
        if (next === game) return;
        const merge = coalesceKey && lastEdit?.key === coalesceKey && now - lastEdit.at < COALESCE_MS;
        lastEdit = coalesceKey ? { key: coalesceKey, at: now } : null;
        set({ game: next, history: merge ? history : [...history, game].slice(-HISTORY_LIMIT) });
      };

      return {
        setup: { startingLife: 40, clockMinutes: null, players: defaultPlayers(4) },
        game: null,
        history: [],
        undoNonce: 0,
        winnerDismissed: null,

        setStartingLife: (startingLife) => set((s) => ({ setup: { ...s.setup, startingLife } })),
        setClock: (clockMinutes) => set((s) => ({ setup: { ...s.setup, clockMinutes } })),
        setPlayerCount: (count) =>
          set((s) => {
            const n = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, count));
            const players = s.setup.players.slice(0, n);
            for (let i = players.length; i < n; i++) {
              const used = new Set(players.map((p) => p.color));
              const color = PLAYER_COLORS.findIndex((_, c) => !used.has(c));
              players.push({ name: defaultName(i), color: color < 0 ? i % PLAYER_COLORS.length : color });
            }
            return { setup: { ...s.setup, players } };
          }),
        renamePlayer: (index, name) =>
          set((s) => ({ setup: { ...s.setup, players: s.setup.players.map((p, i) => (i === index ? { ...p, name: name.slice(0, 16) } : p)) } })),
        cycleColor: (index) =>
          set((s) => {
            const used = new Set(s.setup.players.filter((_, i) => i !== index).map((p) => p.color));
            let c = s.setup.players[index].color;
            do c = (c + 1) % PLAYER_COLORS.length;
            while (used.has(c) && used.size < PLAYER_COLORS.length);
            return { setup: { ...s.setup, players: s.setup.players.map((p, i) => (i === index ? { ...p, color: c } : p)) } };
          }),

        setPlayerArt: (index, art) =>
          set((s) => ({ setup: { ...s.setup, players: s.setup.players.map((p, i) => (i === index ? { ...p, art } : p)) } })),

        start: () => {
          const { setup } = get();
          lastEdit = null;
          set({
            game: L.newGame({
              players: setup.players.map((p, i) => ({ name: p.name.trim() || defaultName(i), color: p.color, art: p.art ?? null })),
              startingLife: setup.startingLife,
              clockMinutes: setup.clockMinutes,
              now: Date.now(),
            }),
            history: [],
            winnerDismissed: null,
          });
        },
        rematch: () => {
          const { game } = get();
          if (!game) return;
          lastEdit = null;
          set({ game: L.rematch(game, Date.now()), history: [], winnerDismissed: null });
        },
        endGame: () => set({ game: null, history: [], winnerDismissed: null }),

        life: (id, delta) => change((g) => L.adjustLife(g, id, delta), `life:${id}`),
        counter: (id, key, delta) => change((g) => L.adjustCounter(g, id, key, delta), `${key}:${id}`),
        commanderDamage: (targetId, source, delta) => change((g) => L.adjustCommanderDamage(g, targetId, source, delta), `cmd:${targetId}:${source}`),
        setPartner: (id, partner) => change((g) => L.setPartner(g, id, partner)),
        concede: (id, conceded) => change((g) => L.setConceded(g, id, conceded)),
        // A new picture also becomes that seat's picture for the next game.
        setArt: (id, art) => {
          change((g) => L.setArt(g, id, art));
          const index = get().game?.players.findIndex((p) => p.id === id) ?? -1;
          if (index >= 0 && index < get().setup.players.length) get().setPlayerArt(index, art);
        },

        startTurns: (first) => change((g, now) => L.startTurns(g, first, now)),
        passTurn: () => change((g, now) => L.passTurn(g, now)),
        // Pausing isn't a game change worth undoing.
        pause: () => set((s) => (s.game ? { game: L.pauseClock(s.game, Date.now()) } : {})),
        resume: () => set((s) => (s.game ? { game: L.resumeClock(s.game, Date.now()) } : {})),
        tickClock: () => change((g, now) => L.checkClock(g, now)),

        undo: () => {
          const { history, game } = get();
          if (!game || history.length === 0) return;
          const prev = history[history.length - 1];
          lastEdit = null;
          // Undo restores counters, not the clock: time already spent stays spent.
          const now = Date.now();
          const restored: L.LifeGame = {
            ...prev,
            players: prev.players.map((p, i) => ({ ...p, timeLeftMs: L.timeLeft(game, i, now) })),
            // The clock runs again if it was running at that point.
            runningSince: prev.runningSince != null ? now : null,
          };
          set((s) => ({ game: restored, history: history.slice(0, -1), undoNonce: s.undoNonce + 1, winnerDismissed: null }));
        },
        dismissWinner: () => set((s) => ({ winnerDismissed: s.game?.id ?? null })),
      };
    },
    {
      name: "life-counter",
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ setup: s.setup, game: s.game, history: s.history.slice(-20), winnerDismissed: s.winnerDismissed }),
      // A saved game comes back paused: time the app was closed doesn't count.
      merge: (persisted, current) => {
        const saved = persisted as Partial<LifeState>;
        return { ...current, ...saved, game: saved.game ? { ...saved.game, runningSince: null } : null };
      },
      // Games saved by the old counter don't carry over.
      migrate: () => ({ setup: { startingLife: 40, clockMinutes: null, players: defaultPlayers(4) }, game: null, history: [], winnerDismissed: null }),
    }
  )
);
