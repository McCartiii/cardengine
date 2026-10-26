// Scryfall lookups for the AI tools: search with Scryfall syntax, or one card
// by (fuzzy) name. Results are trimmed to what the model needs.
import { TtlCache } from "../lib/ttlCache.js";

export interface ScryfallCardSummary {
  name: string;
  manaCost: string | null;
  typeLine: string | null;
  oracleText: string | null;
  colorIdentity: string[];
  cmc: number | null;
  priceUsd: number | null;
  edhrecRank: number | null;
  legal: Record<string, string>;
}

const searchCache = new TtlCache<{ total: number; cards: ScryfallCardSummary[] }>({ ttlMs: 6 * 60 * 60 * 1000, maxSize: 2_000 });

const HEADERS = { Accept: "application/json", "User-Agent": "CardEngine/1.0" };
const LEGAL_FORMATS = ["commander", "standard", "pioneer", "modern", "legacy", "vintage", "pauper", "brawl", "oathbreaker"];

type RawCard = Record<string, unknown> & {
  card_faces?: Array<{ oracle_text?: string; mana_cost?: string }>;
  prices?: Record<string, string | null>;
  legalities?: Record<string, string>;
};

export function summarize(c: RawCard, oracleChars = 400): ScryfallCardSummary {
  const faces = c.card_faces ?? [];
  const oracle = (c.oracle_text as string | undefined) ?? faces.map((f) => f.oracle_text ?? "").join("\n//\n");
  const price = c.prices?.usd ?? c.prices?.usd_foil ?? null;
  return {
    name: c.name as string,
    manaCost: (c.mana_cost as string | undefined) ?? faces[0]?.mana_cost ?? null,
    typeLine: (c.type_line as string | undefined) ?? null,
    oracleText: oracle ? oracle.slice(0, oracleChars) : null,
    colorIdentity: (c.color_identity as string[] | undefined) ?? [],
    cmc: (c.cmc as number | undefined) ?? null,
    priceUsd: price != null ? Number(price) : null,
    edhrecRank: (c.edhrec_rank as number | undefined) ?? null,
    legal: Object.fromEntries(LEGAL_FORMATS.map((f) => [f, c.legalities?.[f] ?? "unknown"])),
  };
}

export async function scryfallSearch(query: string, limit = 12): Promise<{ total: number; cards: ScryfallCardSummary[] } | { error: string }> {
  const key = `${query}|${limit}`;
  const cached = searchCache.get(key);
  if (cached) return cached;
  try {
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=edhrec`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return { total: 0, cards: [] };
    if (!res.ok) return { error: `Scryfall search failed (${res.status})` };
    const data = (await res.json()) as { total_cards: number; data: RawCard[] };
    const out = { total: data.total_cards, cards: data.data.slice(0, limit).map((c) => summarize(c, 240)) };
    searchCache.set(key, out);
    return out;
  } catch {
    return { error: "Scryfall search failed" };
  }
}

export async function scryfallNamed(name: string): Promise<ScryfallCardSummary | { error: string }> {
  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { error: `No card found for "${name}"` };
    return summarize((await res.json()) as RawCard, 800);
  } catch {
    return { error: "Scryfall lookup failed" };
  }
}
