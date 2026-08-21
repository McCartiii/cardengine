import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

const SCRYFALL_SEARCH =
  "https://api.scryfall.com/cards/search?q=" +
  encodeURIComponent("game:paper unique:prints -is:token -is:digital") +
  "&order=released&dir=desc";

export interface MarketCard {
  variantId: string;
  name: string;
  setId: string | null;
  collectorNumber: string | null;
  rarity: string | null;
  imageUri: string | null;
  priceUsd: number | null;
  bestUsd: number | null;
  bestMarket: string | null;
  prices: Array<{ market: string; kind: string; currency: string; amount: number }>;
  sparkline: number[];
  deltaPct: number | null;
  previousUsd: number | null;
}

export interface FeaturedChart {
  card: MarketCard;
  history: Array<{
    at: string;
    market: string;
    kind: string;
    currency: string;
    amount: number;
  }>;
}

interface HomePayload {
  generatedAt: string;
  movers: MarketCard[];
  newCards: MarketCard[];
  popular: MarketCard[];
  featured: FeaturedChart | null;
}

let cache: { at: number; data: HomePayload } | null = null;
const CACHE_MS = 10 * 60 * 1000;

function usdMarketPrices(
  rows: Array<{ variantId: string; market: string; kind: string; currency: string; amount: number }>
) {
  const map = new Map<string, MarketCard["prices"]>();
  for (const r of rows) {
    const arr = map.get(r.variantId) ?? [];
    arr.push({ market: r.market, kind: r.kind, currency: r.currency, amount: r.amount });
    map.set(r.variantId, arr);
  }
  return map;
}

function bestUsd(prices: MarketCard["prices"]): { amount: number; market: string } | null {
  const usd = prices.filter((p) => p.currency === "USD" && p.kind === "market" && p.amount > 0);
  if (usd.length === 0) {
    const anyUsd = prices.filter((p) => p.currency === "USD" && p.amount > 0);
    if (anyUsd.length === 0) return null;
    const min = anyUsd.reduce((a, b) => (a.amount < b.amount ? a : b));
    return { amount: min.amount, market: min.market };
  }
  const min = usd.reduce((a, b) => (a.amount < b.amount ? a : b));
  return { amount: min.amount, market: min.market };
}

async function hydrateCards(
  variantIds: string[],
  extras?: Map<string, { deltaPct: number | null; previousUsd: number | null; sparkline: number[] }>
): Promise<MarketCard[]> {
  if (variantIds.length === 0) return [];
  const [cards, prices] = await Promise.all([
    prisma.cardVariant.findMany({ where: { variantId: { in: variantIds } } }),
    prisma.priceCache.findMany({ where: { variantId: { in: variantIds } } }),
  ]);
  const priceMap = usdMarketPrices(prices);
  const byId = new Map(cards.map((c) => [c.variantId, c]));
  const out: MarketCard[] = [];
  for (const id of variantIds) {
    const c = byId.get(id);
    if (!c) continue;
    const p = priceMap.get(id) ?? [];
    const tcg = p.find((x) => x.market === "tcgplayer" && x.kind === "market" && x.currency === "USD");
    const best = bestUsd(p);
    const extra = extras?.get(id);
    out.push({
      variantId: c.variantId,
      name: c.name,
      setId: c.setId,
      collectorNumber: c.collectorNumber,
      rarity: c.rarity,
      imageUri: c.imageUri,
      priceUsd: tcg?.amount ?? best?.amount ?? null,
      bestUsd: best?.amount ?? null,
      bestMarket: best?.market ?? null,
      prices: p,
      sparkline: extra?.sparkline ?? [],
      deltaPct: extra?.deltaPct ?? null,
      previousUsd: extra?.previousUsd ?? null,
    });
  }
  return out;
}

async function fetchSparklines(variantIds: string[]): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  if (variantIds.length === 0) return map;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const points = await prisma.pricePoint.findMany({
    where: {
      variantId: { in: variantIds },
      market: "tcgplayer",
      kind: "market",
      currency: "USD",
      at: { gte: since },
    },
    orderBy: { at: "asc" },
    select: { variantId: true, amount: true },
  });
  for (const p of points) {
    const arr = map.get(p.variantId) ?? [];
    arr.push(p.amount);
    map.set(p.variantId, arr);
  }
  return map;
}

async function topMovers(): Promise<MarketCard[]> {
  type Row = {
    variantId: string;
    current: number;
    previous: number;
    delta_pct: number;
  };
  const rows = await prisma.$queryRaw<Row[]>`
    WITH recent AS (
      SELECT "variantId", amount, at
      FROM "PricePoint"
      WHERE market = 'tcgplayer' AND kind = 'market' AND currency = 'USD'
        AND at >= NOW() - INTERVAL '14 days'
    ),
    latest AS (
      SELECT DISTINCT ON ("variantId") "variantId", amount AS current, at
      FROM recent
      ORDER BY "variantId", at DESC
    ),
    oldest AS (
      SELECT DISTINCT ON ("variantId") "variantId", amount AS previous, at
      FROM recent
      ORDER BY "variantId", at ASC
    )
    SELECT l."variantId", l.current, o.previous,
           ((l.current - o.previous) / NULLIF(o.previous, 0)) * 100 AS delta_pct
    FROM latest l
    JOIN oldest o ON o."variantId" = l."variantId"
    WHERE l.at > o.at
      AND o.previous >= 1
      AND l.current >= 1
      AND ABS((l.current - o.previous) / NULLIF(o.previous, 0)) >= 0.02
    ORDER BY ABS((l.current - o.previous) / NULLIF(o.previous, 0)) DESC
    LIMIT 16
  `;
  const extras = new Map<string, { deltaPct: number | null; previousUsd: number | null; sparkline: number[] }>();
  const ids = rows.map((r) => r.variantId);
  const sparks = await fetchSparklines(ids);
  for (const r of rows) {
    extras.set(r.variantId, {
      deltaPct: Number(r.delta_pct),
      previousUsd: Number(r.previous),
      sparkline: sparks.get(r.variantId) ?? [],
    });
  }
  return hydrateCards(ids, extras);
}

async function newPrintings(): Promise<MarketCard[]> {
  try {
    const res = await fetch(SCRYFALL_SEARCH, {
      headers: { "User-Agent": "CardEngine/1.0" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { data?: Array<{ id: string }> };
    const ids = (json.data ?? [])
      .slice(0, 40)
      .flatMap((c) => [`scryfall:${c.id}`, `scryfall:${c.id}-foil`]);
    const seen = new Set<string>();
    const cards = (await hydrateCards(ids)).filter((c) => {
      const key = `${c.name}::${c.setId ?? ""}`;
      if (seen.has(key) || !c.imageUri) return false;
      seen.add(key);
      return true;
    });
    const sparks = await fetchSparklines(cards.map((c) => c.variantId));
    return cards
      .map((c) => ({ ...c, sparkline: sparks.get(c.variantId) ?? c.sparkline }))
      .slice(0, 12);
  } catch {
    const recent = await prisma.cardVariant.findMany({
      where: { game: "mtg", rarity: { in: ["mythic", "rare"] } },
      orderBy: { updatedAt: "desc" },
      take: 24,
      select: { variantId: true },
    });
    const cards = await hydrateCards(recent.map((c) => c.variantId));
    return cards.filter((c) => c.imageUri).slice(0, 12);
  }
}

async function popularCards(): Promise<MarketCard[]> {
  const counts = await prisma.collectionEvent.groupBy({
    by: ["variantId"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 24,
  });
  let ids = counts.map((c) => c.variantId);
  if (ids.length < 8) {
    const fallback = await prisma.$queryRaw<Array<{ variantId: string }>>`
      SELECT p."variantId"
      FROM "PriceCache" p
      JOIN "CardVariant" c ON c."variantId" = p."variantId"
      WHERE p.market = 'tcgplayer' AND p.kind = 'market' AND p.currency = 'USD'
        AND p.amount >= 5 AND p.amount <= 400
        AND c.rarity IN ('mythic', 'rare')
        AND c."image_uri" IS NOT NULL
      ORDER BY p.amount DESC
      LIMIT 16
    `;
    const extra = fallback.map((r) => r.variantId).filter((id) => !ids.includes(id));
    ids = [...ids, ...extra].slice(0, 16);
  }
  const cards = await hydrateCards(ids.slice(0, 16));
  const sparks = await fetchSparklines(cards.map((c) => c.variantId));
  return cards
    .filter((c) => c.imageUri)
    .map((c) => ({ ...c, sparkline: sparks.get(c.variantId) ?? c.sparkline }))
    .slice(0, 12);
}

async function featuredChart(cards: MarketCard[]): Promise<FeaturedChart | null> {
  const pick =
    cards.find((c) => c.sparkline.length >= 2 && (c.bestUsd ?? 0) >= 2) ??
    cards.find((c) => (c.bestUsd ?? 0) >= 5) ??
    cards[0];
  if (!pick) return null;
  const since = new Date(Date.now() - 90 * 86_400_000);
  const history = await prisma.pricePoint.findMany({
    where: { variantId: pick.variantId, at: { gte: since } },
    orderBy: { at: "asc" },
  });
  return {
    card: pick,
    history: history.map((p) => ({
      at: p.at.toISOString(),
      market: p.market,
      kind: p.kind,
      currency: p.currency,
      amount: p.amount,
    })),
  };
}

async function buildHome(): Promise<HomePayload> {
  const [movers, fresh, popular] = await Promise.all([
    topMovers().catch((err) => {
      console.warn("[market] movers failed", err);
      return [] as MarketCard[];
    }),
    newPrintings().catch((err) => {
      console.warn("[market] new cards failed", err);
      return [] as MarketCard[];
    }),
    popularCards().catch((err) => {
      console.warn("[market] popular failed", err);
      return [] as MarketCard[];
    }),
  ]);
  const featured = await featuredChart([...movers, ...popular, ...fresh]);
  return {
    generatedAt: new Date().toISOString(),
    movers,
    newCards: fresh,
    popular,
    featured,
  };
}

export function registerMarketRoutes(app: FastifyInstance) {
  app.get("/v1/market/home", async () => {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
    const data = await buildHome();
    cache = { at: Date.now(), data };
    return data;
  });
}
