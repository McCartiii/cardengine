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
  max: number | null;
  eliminationAt: number | null;
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
