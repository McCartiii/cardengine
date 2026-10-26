// Look and options for the life counter.
import type { OutReason } from "./lifeGame";

export interface PlayerColor {
  name: string;
  /** Gradient stops, light to deep. */
  from: string;
  to: string;
  /** A bright tint for glows and accents on dark backgrounds. */
  glow: string;
}

export const PLAYER_COLORS: PlayerColor[] = [
  { name: "Violet", from: "#9B7BFF", to: "#5A2FD6", glow: "#C4B2FF" },
  { name: "Coral", from: "#FF8A7A", to: "#D3304F", glow: "#FFB3A8" },
  { name: "Ocean", from: "#4FC3FF", to: "#1F5FD8", glow: "#9EDCFF" },
  { name: "Jade", from: "#4BE0A4", to: "#0E8A63", glow: "#9DF2CF" },
  { name: "Gold", from: "#FFD25E", to: "#E0861B", glow: "#FFE7A3" },
  { name: "Orchid", from: "#FF8FD2", to: "#B5257F", glow: "#FFC2E6" },
  { name: "Teal", from: "#5EE6DE", to: "#12858F", glow: "#A6F3EE" },
  { name: "Slate", from: "#A3AEC7", to: "#3C4660", glow: "#D3D9E8" },
];

export const LIFE_OPTIONS = [20, 30, 40, 60] as const;
export const CLOCK_OPTIONS: ReadonlyArray<number | null> = [null, 10, 15, 20, 30];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/** Life at or under this shows the low-life heartbeat. */
export const DANGER_LIFE = 5;

export const LIFE_BG = "#0B0C10";

export const OUT_LABEL: Record<OutReason, string> = {
  life: "Out of life",
  poison: "Poisoned",
  commander: "Commander damage",
  time: "Out of time",
  conceded: "Conceded",
};

export const ELIMINATION_QUIPS = [
  "Skill issue",
  "Should've played blue",
  "That's rough, buddy",
  "Lands in front, please",
  "They had it",
  "Back to the command zone",
  "Maybe next pod",
  "You were the threat all along",
  "Mana screwed, probably",
  "The stack resolves. You don't.",
  "Should've mulliganed",
  "GG, go next",
] as const;

export function quipFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return ELIMINATION_QUIPS[Math.abs(h) % ELIMINATION_QUIPS.length];
}

export const COUNTER_INFO = {
  poison: { label: "Poison", icon: "skull", tint: "#B79BFF" },
  energy: { label: "Energy", icon: "flash", tint: "#FFC34D" },
  experience: { label: "Experience", icon: "star", tint: "#5CE0A0" },
  tax: { label: "Commander tax", icon: "repeat", tint: "#7CC8FF" },
} as const;

export function defaultName(i: number) {
  return `Player ${i + 1}`;
}
