// Turns AI suggestions into a deck's new card list, in the shape
// PUT /v1/decks/:id/cards takes.
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

function toEntries(cards: Existing[]): DeckEntry[] {
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
