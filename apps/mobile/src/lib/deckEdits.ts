// Changes to a deck's card list: hand edits (counts, sections, adds) and AI
// suggestions, in the shape PUT /v1/decks/:id/cards takes.
import type { AgentCard, AgentSwap } from "./deckAgent";

export interface DeckEntry {
  cardName: string;
  variantId?: string;
  quantity: number;
  section: string;
}

interface Existing {
  cardName: string;
  variantId?: string | null;
  quantity: number;
  section: string;
}

type VariantOf = (name: string) => string | undefined;

const key = (name: string) => name.trim().toLowerCase();

export function toEntries(cards: Existing[]): DeckEntry[] {
  return cards.map((c) => ({ cardName: c.cardName, variantId: c.variantId ?? undefined, quantity: c.quantity, section: c.section }));
}

/** Adds `quantity` copies to the mainboard, stacking onto a matching entry. */
function addTo(entries: DeckEntry[], name: string, quantity: number, variantOf: VariantOf): DeckEntry[] {
  const i = entries.findIndex((e) => e.section === "mainboard" && key(e.cardName) === key(name));
  if (i >= 0) return entries.map((e, j) => (j === i ? { ...e, quantity: Math.min(99, e.quantity + quantity) } : e));
  return [...entries, { cardName: name, variantId: variantOf(name), quantity, section: "mainboard" }];
}

/** Takes one copy out of the mainboard (or wherever it is). */
function removeOne(entries: DeckEntry[], name: string): DeckEntry[] {
  let i = entries.findIndex((e) => e.section === "mainboard" && key(e.cardName) === key(name));
  if (i < 0) i = entries.findIndex((e) => key(e.cardName) === key(name));
  if (i < 0) return entries;
  const e = entries[i];
  return e.quantity > 1 ? entries.map((x, j) => (j === i ? { ...x, quantity: x.quantity - 1 } : x)) : entries.filter((_, j) => j !== i);
}

export function applySwaps(cards: Existing[], swaps: AgentSwap[], variantOf: VariantOf): DeckEntry[] {
  let entries = toEntries(cards);
  for (const s of swaps) {
    entries = removeOne(entries, s.cut.name);
    entries = addTo(entries, s.add.name, 1, variantOf);
  }
  return entries;
}

/** Pure additions (CARD lines in a change answer, or a chat's card list). */
export function addCards(cards: Existing[], add: Array<{ name: string; quantity: number }>, variantOf: VariantOf): DeckEntry[] {
  return add.reduce((entries, c) => addTo(entries, c.name, c.quantity, variantOf), toEntries(cards));
}

/** A built list replaces the main deck; the commander, companion and sideboard stay. */
export function applyBuild(cards: Existing[], built: AgentCard[], variantOf: VariantOf): DeckEntry[] {
  const kept = toEntries(cards).filter((e) => e.section !== "mainboard");
  return built.reduce((entries, c) => addTo(entries, c.name, c.quantity, variantOf), kept);
}

/** The "CARDS: … END_CARDS" block the chat assistant adds to card suggestions. */
export function parseCardBlock(text: string): Array<{ name: string; quantity: number }> {
  const m = text.match(/CARDS:\s*\n([\s\S]*?)END_CARDS/);
  if (!m) return [];
  return m[1]
    .split("\n")
    .map((l) => l.trim().match(/^(\d+)x?\s+(.+)$/))
    .flatMap((x) => (x ? [{ quantity: parseInt(x[1], 10), name: x[2].trim() }] : []));
}

/** The text to show, without the import block. */
export function withoutCardBlock(text: string): string {
  return text.replace(/\n*CARDS:\s*\n[\s\S]*?(END_CARDS|$)/, "").trimEnd();
}

// ── Hand edits ────────────────────────────────────────────────────────────────
// These keep each card's extra fields (art, price) so the screen can update
// before the save comes back.

export const MAX_COPIES = 99;

const COMMANDER_FORMATS = new Set(["commander", "brawl", "oathbreaker"]);

/** Formats with a command zone. */
export const hasCommandZone = (format: string) => COMMANDER_FORMATS.has(format);

const same = (c: Existing, name: string, section: string) => c.section === section && key(c.cardName) === key(name);

/** Copies of a card in one section. */
export function countOf(cards: Existing[], name: string, section: string): number {
  return cards.find((c) => same(c, name, section))?.quantity ?? 0;
}

/** Sets how many copies a section holds; 0 takes the card out. */
export function setCount<T extends Existing>(cards: T[], name: string, section: string, quantity: number): T[] {
  const q = Math.max(0, Math.min(MAX_COPIES, Math.round(quantity)));
  if (q === 0) return cards.filter((c) => !same(c, name, section));
  return cards.map((c) => (same(c, name, section) ? { ...c, quantity: q } : c));
}

/** Adds copies to a section, stacking onto copies already there. */
export function addCard<T extends Existing>(cards: T[], card: T): T[] {
  const i = cards.findIndex((c) => same(c, card.cardName, card.section));
  if (i < 0) return [...cards, { ...card, quantity: Math.min(MAX_COPIES, card.quantity) }];
  return cards.map((c, j) => (j === i ? { ...c, quantity: Math.min(MAX_COPIES, c.quantity + card.quantity) } : c));
}

/** Moves every copy of a card to another section, stacking onto copies already there. */
export function moveCard<T extends Existing>(cards: T[], name: string, from: string, to: string): T[] {
  const moving = cards.find((c) => same(c, name, from));
  if (!moving || from === to) return cards;
  return addCard(
    cards.filter((c) => c !== moving),
    { ...moving, section: to }
  );
}

/** The command zone's card names, in order: [commander, partner]. */
export function commandersOf(cards: Existing[]): string[] {
  return cards.filter((c) => c.section === "commander").map((c) => c.cardName);
}
