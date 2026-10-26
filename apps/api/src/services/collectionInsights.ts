// Summaries of a player's collection for the AI assistant: what they own,
// what it's worth, what's moving, and searches over it. Pure functions over
// the holdings from loadCollectionHoldings.
import type { CollectionHolding } from "./collectionHoldings.js";

type Holding = Pick<
  CollectionHolding,
  "name" | "setId" | "finish" | "rarity" | "typeLine" | "manaCost" | "colorIdentity" | "quantity" | "priceUsd" | "changePct"
>;

const round2 = (n: number) => Math.round(n * 100) / 100;

function row(h: Holding) {
  const change = h.changePct != null && h.priceUsd != null ? h.priceUsd - h.priceUsd / (1 + h.changePct / 100) : null;
  return {
    name: h.name,
    set: h.setId?.toUpperCase() ?? null,
    finish: h.finish,
    quantity: h.quantity,
    priceUsd: h.priceUsd,
    value: h.priceUsd != null ? round2(h.priceUsd * h.quantity) : null,
    change7dPct: h.changePct != null ? round2(h.changePct) : null,
    change7dUsd: change != null ? round2(change) : null,
    type: h.typeLine,
  };
}

const identityOf = (h: Holding) => (Array.isArray(h.colorIdentity) ? (h.colorIdentity as string[]) : []);

export function collectionOverview(holdings: Holding[]) {
  const totalValue = holdings.reduce((s, h) => s + (h.priceUsd ?? 0) * h.quantity, 0);
  const totalCards = holdings.reduce((s, h) => s + h.quantity, 0);
  const byValue = [...holdings].sort((a, b) => (b.priceUsd ?? 0) * b.quantity - (a.priceUsd ?? 0) * a.quantity);
  const moving = holdings.filter((h) => h.changePct != null && h.priceUsd != null && h.priceUsd >= 0.5);
  const gainers = [...moving].sort((a, b) => b.changePct! - a.changePct!).filter((h) => h.changePct! > 0);
  const losers = [...moving].sort((a, b) => a.changePct! - b.changePct!).filter((h) => h.changePct! < 0);

  const colors: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, colorless: 0 };
  const types: Record<string, number> = {};
  for (const h of holdings) {
    const id = identityOf(h);
    if (id.length === 0) colors.colorless += h.quantity;
    for (const c of id) colors[c] = (colors[c] ?? 0) + h.quantity;
    const main = (h.typeLine ?? "").split("—")[0];
    for (const t of ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land", "Battle"]) {
      if (main.includes(t)) types[t] = (types[t] ?? 0) + h.quantity;
    }
  }

  const commanders = byValue
    .filter((h) => /Legendary/.test(h.typeLine ?? "") && /Creature/.test(h.typeLine ?? ""))
    .slice(0, 25)
    .map((h) => ({ name: h.name, colorIdentity: identityOf(h).join("") || "C", priceUsd: h.priceUsd }));

  return {
    totalCards,
    uniqueCards: new Set(holdings.map((h) => h.name)).size,
    totalValueUsd: round2(totalValue),
    mostValuable: byValue.slice(0, 15).map(row),
    biggestGainers7d: gainers.slice(0, 10).map(row),
    biggestLosers7d: losers.slice(0, 10).map(row),
    cardsByColorIdentity: colors,
    cardsByType: types,
    possibleCommanders: commanders,
  };
}

export interface CollectionSearch {
  name?: string;
  type?: string;
  /** Cards whose color identity fits within these colors, e.g. "BG". */
  withinColors?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: "value" | "price" | "gain" | "loss" | "name";
  limit?: number;
}

export function searchCollection(holdings: Holding[], q: CollectionSearch) {
  const within = q.withinColors ? new Set(q.withinColors.toUpperCase().replace(/[^WUBRG]/g, "").split("")) : null;
  const matches = holdings.filter((h) => {
    if (q.name && !h.name.toLowerCase().includes(q.name.toLowerCase())) return false;
    if (q.type && !(h.typeLine ?? "").toLowerCase().includes(q.type.toLowerCase())) return false;
    if (within && !identityOf(h).every((c) => within.has(c))) return false;
    if (q.minPrice != null && (h.priceUsd ?? 0) < q.minPrice) return false;
    if (q.maxPrice != null && (h.priceUsd ?? Infinity) > q.maxPrice) return false;
    return true;
  });
  const key: Record<NonNullable<CollectionSearch["sort"]>, (h: Holding) => number | string> = {
    value: (h) => -((h.priceUsd ?? 0) * h.quantity),
    price: (h) => -(h.priceUsd ?? 0),
    gain: (h) => -(h.changePct ?? -Infinity),
    loss: (h) => h.changePct ?? Infinity,
    name: (h) => h.name,
  };
  const by = key[q.sort ?? "value"];
  matches.sort((a, b) => {
    const x = by(a);
    const y = by(b);
    return typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
  });
  const limit = Math.min(Math.max(q.limit ?? 40, 1), 150);
  return { matches: matches.length, cards: matches.slice(0, limit).map(row) };
}
