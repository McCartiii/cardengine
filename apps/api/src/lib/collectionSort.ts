// Sorting for the collection: by value, price, price change, type, rarity,
// date added, name or quantity, in either direction.

export const COLLECTION_SORTS = ["value", "price", "change", "type", "rarity", "added", "name", "qty"] as const;
export type CollectionSort = (typeof COLLECTION_SORTS)[number];
export type SortDirection = "asc" | "desc";

export interface SortableCard {
  name: string;
  typeLine: string | null;
  rarity: string | null;
  quantity: number;
  priceUsd: number | null;
  lineValue: number | null;
  changePct: number | null;
  addedAt: string | null;
}

// A card's main type, in deck-list order. Earlier entries win, so an
// "Artifact Creature" sorts with creatures.
const TYPE_ORDER = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land"];
const RARITY_ORDER = ["special", "bonus", "mythic", "rare", "uncommon", "common"];

export function typeRank(typeLine: string | null): number {
  const front = (typeLine ?? "").split(/—|\/\//)[0];
  const i = TYPE_ORDER.findIndex((t) => front.includes(t));
  return i === -1 ? TYPE_ORDER.length : i;
}

function rarityRank(rarity: string | null): number {
  const i = RARITY_ORDER.indexOf((rarity ?? "").toLowerCase());
  return i === -1 ? RARITY_ORDER.length : i;
}

/** The direction each sort uses unless the caller asks for the other one. */
export const DEFAULT_DIRECTION: Record<CollectionSort, SortDirection> = {
  value: "desc",
  price: "desc",
  change: "desc",
  type: "asc",
  rarity: "asc",
  added: "desc",
  name: "asc",
  qty: "desc",
};

/**
 * Sorts cards in place. Cards missing the sorted field (no price, no price
 * history) always go last, whichever the direction; ties fall back to name.
 */
export function sortCollection<T extends SortableCard>(cards: T[], sort: CollectionSort, dir: SortDirection = DEFAULT_DIRECTION[sort]): T[] {
  const sign = dir === "asc" ? 1 : -1;
  const key = (c: T): number | string | null => {
    switch (sort) {
      case "value":
        return c.lineValue;
      case "price":
        return c.priceUsd;
      case "change":
        return c.changePct;
      case "type":
        return typeRank(c.typeLine);
      case "rarity":
        return rarityRank(c.rarity);
      case "added":
        return c.addedAt;
      case "qty":
        return c.quantity;
      case "name":
        return c.name.toLowerCase();
    }
  };
  return cards.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka == null || kb == null) {
      if (ka == null && kb == null) return a.name.localeCompare(b.name);
      return ka == null ? 1 : -1;
    }
    const cmp = typeof ka === "string" ? ka.localeCompare(kb as string) : ka - (kb as number);
    return cmp !== 0 ? cmp * sign : a.name.localeCompare(b.name);
  });
}

/**
 * Percent change from the oldest to the newest of a card's recent prices,
 * or null without at least two prices on different days.
 */
export function changeFromPoints(points: Array<{ at: Date; amount: number }>): number | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.at.getTime() - b.at.getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (last.at.getTime() - first.at.getTime() < 12 * 3600_000 || first.amount <= 0) return null;
  return ((last.amount - first.amount) / first.amount) * 100;
}
