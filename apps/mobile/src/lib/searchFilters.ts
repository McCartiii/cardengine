// What the search filter sheet holds, and how it becomes API parameters and
// the removable chips under the search field.
import type { SearchFilters } from "./api";

export const COLOR_OPTIONS = [
  { code: "W", name: "White" },
  { code: "U", name: "Blue" },
  { code: "B", name: "Black" },
  { code: "R", name: "Red" },
  { code: "G", name: "Green" },
  { code: "C", name: "Colorless" },
] as const;

export const TYPE_OPTIONS = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land", "Battle"] as const;

export const RARITY_OPTIONS = [
  { value: "common", label: "Common" },
  { value: "uncommon", label: "Uncommon" },
  { value: "rare", label: "Rare" },
  { value: "mythic", label: "Mythic" },
] as const;

/** Price ranges in the display currency. */
export const PRICE_OPTIONS = [
  { key: "any", min: undefined, max: undefined },
  { key: "under1", min: undefined, max: 1 },
  { key: "1-10", min: 1, max: 10 },
  { key: "10-50", min: 10, max: 50 },
  { key: "50+", min: 50, max: undefined },
] as const;
export type PriceKey = (typeof PRICE_OPTIONS)[number]["key"];

export const SORT_OPTIONS = [
  { value: "name-asc", label: "A–Z" },
  { value: "price-desc", label: "Priciest" },
  { value: "price-asc", label: "Cheapest" },
  { value: "popular", label: "Popular" },
] as const;
export type SortKey = (typeof SORT_OPTIONS)[number]["value"];

export interface FilterState {
  colors: string[];
  type: string | null;
  rarity: string[];
  price: PriceKey;
  sort: SortKey;
}

export const NO_FILTERS: FilterState = { colors: [], type: null, rarity: [], price: "any", sort: "name-asc" };

export function priceLabel(key: PriceKey, symbol: string): string {
  const p = PRICE_OPTIONS.find((o) => o.key === key)!;
  if (p.min == null && p.max == null) return "Any price";
  if (p.min == null) return `Under ${symbol}${p.max}`;
  if (p.max == null) return `${symbol}${p.min}+`;
  return `${symbol}${p.min}–${symbol}${p.max}`;
}

/** Filters that narrow results (sort doesn't count). */
export function activeCount(f: FilterState): number {
  return f.colors.length + (f.type ? 1 : 0) + f.rarity.length + (f.price !== "any" ? 1 : 0);
}

export function toApiFilters(f: FilterState, toUsd: (n: number) => number): SearchFilters {
  const p = PRICE_OPTIONS.find((o) => o.key === f.price)!;
  return {
    colors: f.colors.length ? f.colors.join("") : undefined,
    type: f.type?.toLowerCase() ?? undefined,
    rarity: f.rarity.length ? f.rarity : undefined,
    // Round so "under €1" doesn't become 1.0869565…
    minPrice: p.min != null ? Math.round(toUsd(p.min) * 100) / 100 : undefined,
    maxPrice: p.max != null ? Math.round(toUsd(p.max) * 100) / 100 : undefined,
    sort: f.sort,
  };
}

export interface FilterChip {
  key: string;
  label: string;
  remove: (f: FilterState) => FilterState;
}

export function filterChips(f: FilterState, symbol: string): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const c of f.colors) {
    chips.push({ key: `c-${c}`, label: COLOR_OPTIONS.find((o) => o.code === c)?.name ?? c, remove: (s) => ({ ...s, colors: s.colors.filter((x) => x !== c) }) });
  }
  if (f.type) chips.push({ key: "type", label: f.type, remove: (s) => ({ ...s, type: null }) });
  for (const r of f.rarity) {
    chips.push({ key: `r-${r}`, label: RARITY_OPTIONS.find((o) => o.value === r)?.label ?? r, remove: (s) => ({ ...s, rarity: s.rarity.filter((x) => x !== r) }) });
  }
  if (f.price !== "any") chips.push({ key: "price", label: priceLabel(f.price, symbol), remove: (s) => ({ ...s, price: "any" }) });
  if (f.sort !== "name-asc") {
    chips.push({ key: "sort", label: SORT_OPTIONS.find((o) => o.value === f.sort)!.label, remove: (s) => ({ ...s, sort: "name-asc" }) });
  }
  return chips;
}
