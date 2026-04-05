import { create } from "zustand";

export type Format =
  | "standard"
  | "commander"
  | "brawl"
  | "twoheaded"
  | "oathbreaker";

export const FORMAT_CONFIG: Record<
  Format,
  { label: string; life: number; description: string }
> = {
  standard:    { label: "Standard",         life: 20, description: "20 life · 2–4 players" },
  commander:   { label: "Commander",        life: 40, description: "40 life · commander damage" },
  brawl:       { label: "Brawl",            life: 25, description: "25 life · commander damage" },
  twoheaded:   { label: "Two-Headed Giant", life: 30, description: "30 life · team play" },
  oathbreaker: { label: "Oathbreaker",      life: 20, description: "20 life · 4 players" },
};

export const PLAYER_COLORS = [
  "#7c3aed", // purple
  "#1d4ed8", // blue
  "#15803d", // green
  "#b45309", // amber
] as const;

export interface Player {
  id: string;
  name: string;
  life: number;
  /** commander id → damage received from that commander */
  commanderDamage: Record<string, number>;
  isDead: boolean;
}

interface LifeState {
  format: Format;
  playerCount: 2 | 3 | 4;
  players: Player[];
  gameStarted: boolean;

  startGame: (format: Format, playerCount: 2 | 3 | 4) => void;
  changeLife: (playerId: string, delta: number) => void;
  changeCommanderDamage: (
    targetId: string,
    sourceId: string,
    delta: number
  ) => void;
  resetGame: () => void;
  backToSetup: () => void;
}

function makePlayers(count: number, life: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i + 1}`,
    life,
    commanderDamage: {},
    isDead: false,
  }));
}

export const useLifeStore = create<LifeState>((set, get) => ({
  format: "standard",
  playerCount: 2,
  players: makePlayers(2, 20),
  gameStarted: false,

  startGame(format, playerCount) {
    set({
      format,
      playerCount,
      players: makePlayers(playerCount, FORMAT_CONFIG[format].life),
      gameStarted: true,
    });
  },

  changeLife(playerId, delta) {
    set((s) => ({
      players: s.players.map((p) => {
        if (p.id !== playerId) return p;
        const life = p.life + delta;
        return { ...p, life, isDead: life <= 0 };
      }),
    }));
  },

  changeCommanderDamage(targetId, sourceId, delta) {
    set((s) => ({
      players: s.players.map((p) => {
        if (p.id !== targetId) return p;
        const prev = p.commanderDamage[sourceId] ?? 0;
        const next = Math.max(0, prev + delta);
        const actualDelta = next - prev;
        const life = p.life - actualDelta;
        return {
          ...p,
          life,
          commanderDamage: { ...p.commanderDamage, [sourceId]: next },
          isDead: life <= 0 || next >= 21,
        };
      }),
    }));
  },

  resetGame() {
    const { format, playerCount } = get();
    set({ players: makePlayers(playerCount, FORMAT_CONFIG[format].life) });
  },

  backToSetup() {
    set({ gameStarted: false });
  },
}));
