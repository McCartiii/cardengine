// What the deck AI needs to know about a card to check its own picks: does it
// exist, what colors it counts as, what it costs, what it does, and whether
// it's legal. Names and prices come from our catalog; format legality comes
// from Scryfall (we don't store ban lists) and is cached for a day.
import { prisma } from "../db.js";
import { TtlCache } from "../lib/ttlCache.js";
import { normalizeCardName } from "../lib/cardName.js";

export { normalizeCardName };

export interface CardFact {
  /** The catalog's spelling of the name. */
  name: string;
  variantId: string;
  imageUri: string | null;
  typeLine: string | null;
  manaCost: string | null;
  oracleText: string | null;
  cmc: number | null;
  colorIdentity: string[];
  /** Cheapest non-foil market price across printings. */
  priceUsd: number | null;
  /** Scryfall legalities ("legal", "banned", "not_legal", "restricted"), when known. */
  legalities: Record<string, string> | null;
}

const legalityCache = new TtlCache<Record<string, string>>({ ttlMs: 24 * 60 * 60 * 1000, maxSize: 30_000 });

/** The name to look a card up by: front face of a double-faced card. */
const frontFace = (name: string) => name.split(" // ")[0];

async function fetchLegalities(names: string[]): Promise<void> {
  const missing = names.filter((n) => !legalityCache.get(normalizeCardName(n)));
  for (let i = 0; i < missing.length; i += 75) {
    const batch = missing.slice(i, i + 75);
    try {
      const res = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "CardEngine/1.0" },
        body: JSON.stringify({ identifiers: batch.map((name) => ({ name: frontFace(name) })) }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { data?: Array<{ name: string; legalities?: Record<string, string> }> };
      for (const card of json.data ?? []) {
        if (!card.legalities) continue;
        legalityCache.set(normalizeCardName(card.name), card.legalities);
        legalityCache.set(normalizeCardName(frontFace(card.name)), card.legalities);
      }
    } catch {
      // Legality is best effort: without it we still check names, colors and price.
      return;
    }
  }
}

/**
 * Looks up each name (case and accent insensitive; front faces of
 * double-faced cards match too). Unknown names are absent from the map.
 */
export async function lookupCardFacts(names: string[]): Promise<Map<string, CardFact>> {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const out = new Map<string, CardFact>();
  if (wanted.length === 0) return out;

  const variants = await prisma.cardVariant.findMany({
    where: {
      game: "mtg",
      NOT: { variantId: { endsWith: "-foil" } },
      OR: [
        { name: { in: wanted, mode: "insensitive" } },
        ...wanted.map((n) => ({ name: { startsWith: `${frontFace(n)} // `, mode: "insensitive" as const } })),
      ],
    },
    select: {
      variantId: true,
      name: true,
      imageUri: true,
      typeLine: true,
      manaCost: true,
      oracleText: true,
      cmc: true,
      colorIdentity: true,
    },
  });

  const prices = variants.length
    ? await prisma.priceCache.findMany({
        where: { variantId: { in: variants.map((v) => v.variantId) }, market: "tcgplayer", kind: "market", currency: "USD" },
        select: { variantId: true, amount: true },
      })
    : [];
  const priceOf = new Map(prices.map((p) => [p.variantId, p.amount]));

  // One fact per card name: the cheapest priced printing, keeping its image.
  const byName = new Map<string, CardFact>();
  for (const v of variants) {
    const key = normalizeCardName(v.name);
    const price = priceOf.get(v.variantId) ?? null;
    const current = byName.get(key);
    const cheaper = price != null && (current?.priceUsd == null || price < current.priceUsd);
    if (!current || cheaper) {
      byName.set(key, {
        name: v.name,
        variantId: v.variantId,
        imageUri: v.imageUri ?? current?.imageUri ?? null,
        typeLine: v.typeLine,
        manaCost: v.manaCost,
        oracleText: v.oracleText,
        cmc: v.cmc,
        colorIdentity: Array.isArray(v.colorIdentity) ? (v.colorIdentity as string[]) : [],
        priceUsd: price,
        legalities: null,
      });
    }
  }
  // Front faces resolve to the whole card.
  for (const fact of [...byName.values()]) {
    if (fact.name.includes(" // ")) {
      const front = normalizeCardName(frontFace(fact.name));
      if (!byName.has(front)) byName.set(front, fact);
    }
  }

  await fetchLegalities([...new Set([...byName.values()].map((f) => f.name))]);
  for (const name of wanted) {
    const fact = byName.get(normalizeCardName(name));
    if (!fact) continue;
    out.set(normalizeCardName(name), {
      ...fact,
      legalities: legalityCache.get(normalizeCardName(fact.name)) ?? legalityCache.get(normalizeCardName(frontFace(fact.name))) ?? null,
    });
  }
  return out;
}
