// Magic flavor for the app's copy: life counter callouts, banners and
// knockout lines, plus greetings and status lines elsewhere. All lines are
// ours; add or swap freely.
import type { OutReason } from "./lifeGame";

const recent = new Map<string, number>();

/** A random line from a list, never the same one twice in a row. */
export function pick(key: string, lines: readonly string[]): string {
  if (lines.length === 1) return lines[0];
  const last = recent.get(key);
  let i = Math.floor(Math.random() * lines.length);
  if (i === last) i = (i + 1) % lines.length;
  recent.set(key, i);
  return lines[i];
}

/** The same line every time for a seed (so a knocked-out panel doesn't flicker between quips). */
export function stable(seed: string, lines: readonly string[]): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return lines[Math.abs(h) % lines.length];
}

// ── Life counter ──────────────────────────────────────────────────────────────

export const INTRO_BADGES = ["GAME ON", "SHUFFLE UP", "GLHF", "LET'S DUEL", "CAST AWAY", "DRAW SEVEN"] as const;

export const FIRST_BANNERS = ["YOU'RE ON THE PLAY", "YOU GO FIRST", "FIRST TO THE STACK", "LEAD THE CHARGE"] as const;

export const TURN_BANNERS = ["YOUR TURN", "UNTAP, UPKEEP, DRAW", "YOUR MOVE, PLANESWALKER", "THE STACK IS YOURS", "MAIN PHASE, BABY"] as const;

const KNOCKOUT: Record<OutReason, readonly string[]> = {
  life: [
    "Skill issue",
    "Should've played blue",
    "Lands in front, please",
    "Mana screwed, probably",
    "The stack resolves. You don't.",
    "Should've mulliganed",
    "Back to the command zone",
    "You were the threat all along",
    "GG, go next",
    "Tapped out at the worst time",
  ],
  poison: ["Infected", "Ten counters, zero chill", "Death by a thousand pricks", "Phyrexia sends its regards", "Should've packed artifact hate"],
  commander: ["Twenty-one and done", "Struck down by a legend", "The general got you", "Voltron'd", "Commander tax paid in full"],
  time: ["Tanked too long", "The clock is undefeated", "Out of time, out of luck", "Analysis paralysis"],
  conceded: ["Scooped", "Graceful exit", "Living to shuffle another day", "Hands in the air"],
};

export function knockoutLine(seed: string, reason: OutReason): string {
  return stable(seed, KNOCKOUT[reason]);
}

/** A shout for a big swing in one change, or null for small ones. */
export function damageCallout(delta: number): string | null {
  if (delta <= -20) return pick("dmg-huge", ["ONE-SHOT!", "FLATTENED!", "THAT'S LETHAL-ISH"]);
  if (delta <= -10) return pick("dmg-big", ["OBLITERATED!", "CRITICAL HIT!", "OUCH!"]);
  if (delta === -7) return "LAVA AXE'D!";
  if (delta === -3) return "BOLTED!";
  if (delta <= -5) return pick("dmg-mid", ["SMACKED!", "TRAMPLED!", "RIGHT IN THE FACE"]);
  return null;
}

export function healCallout(delta: number): string | null {
  if (delta >= 10) return pick("heal-big", ["GAINED A FORTUNE", "SOUL SISTERED!", "HEALTHY AGAIN"]);
  if (delta >= 5) return pick("heal-mid", ["LIFELINKED!", "TOP UP!", "SECOND WIND"]);
  return null;
}

export const LOW_LIFE_LINES = ["Topdeck time", "One Shock away", "Find an answer", "Chump block o'clock", "Pray to the top of your library"] as const;

export function winLine(opts: { winnerLife: number; startingLife: number; lastOut: OutReason | null; turn: number }): string {
  if (opts.winnerLife >= opts.startingLife) return "Perfect game. Not a scratch.";
  switch (opts.lastOut) {
    case "commander":
      return "Commander victory";
    case "poison":
      return "Poison victory";
    case "time":
      return "Won on the clock";
    case "conceded":
      return "They scooped. A win's a win.";
    default:
      return opts.turn > 0 && opts.turn <= 6 ? "Speedrun victory" : "Last planeswalker standing";
  }
}

export function coinLine(heads: boolean): string {
  return pick("coin", [
    `Krark's thumb says ${heads ? "HEADS" : "TAILS"}`,
    `${heads ? "Heads" : "Tails"}. The coin has spoken.`,
    `${heads ? "Heads" : "Tails"}! Ask Mana Clash how that feels.`,
  ]);
}

export function dieLine(value: number, sides: number): string {
  if (sides === 20 && value === 20) return "NAT 20!";
  if (sides === 20 && value === 1) return "Natural 1. Oof.";
  return `Rolled ${value} on a d${sides}`;
}

// ── Around the app ────────────────────────────────────────────────────────────

export function greeting(hour: number): string {
  const time = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return pick("greeting", [`${time},`, `${time},`, "Welcome back,", "Untap, upkeep,", "Ready to draw,"]);
}

export const GREETING_NAMES = ["planeswalker", "collector", "summoner", "mage"] as const;

export const EMPTY_DECKS = ["No decks yet. Every legend starts with a land.", "Your first deck is waiting in the library.", "No decks yet. Time to brew."] as const;

export const AI_THINKING = ["Consulting the archives…", "Shuffling ideas…", "Tutoring for upgrades…", "Checking the ban list…", "Reading the oracle…"] as const;
