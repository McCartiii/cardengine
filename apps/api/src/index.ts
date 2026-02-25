import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { prisma, dbReady } from "./db.js";
import { ingestScryfallBulk } from "./jobs/scryfallIngest.js";
import { withAdvisoryLock } from "./jobs/leaderLock.js";
import { registerLocalSceneRoutes } from "./routes/localScene.js";
import { registerTelemetryRoutes } from "./routes/telemetry.js";
import { registerDeckRoutes } from "./routes/decks.js";
import { fetchEdhrecCommander, sanitizeCommanderName } from "./services/edhrec.js";
import { requireAuth, extractUser, optionalAuth, type AuthUser } from "./middleware/auth.js";
import { suggestDecks, getRecommendations, getSwapSuggestions } from "./services/deckAdvisor.js";
import type { FastifyRequest, FastifyReply } from "fastify";
import { TtlCache } from "./lib/ttlCache.js";

interface ScryfallLivePrices {
  usd: string | null;
  usd_foil: string | null;
  usd_etched: string | null;
  eur: string | null;
  eur_foil: string | null;
  eur_etched: string | null;
  tix: string | null;
}

interface ScryfallLiveData {
  prices: ScryfallLivePrices;
  purchase_uris?: Record<string, string>;
  related_uris?: Record<string, string>;
}

// Cache Scryfall card API responses for 4 hours.
// Scryfall prices update ~once daily from TCGplayer, so 4h is fresh enough.
// 5000 entries * ~4KB each = ~20MB memory.
const scryfallCache = new TtlCache<ScryfallLiveData>({
  ttlMs: 4 * 60 * 60 * 1000,  // 4 hours
  maxSize: 5_000,
});

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: "1 minute",
  keyGenerator: (req) => {
    // Railway proxy sets X-Forwarded-For with the real client IP
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
    if (Array.isArray(forwarded)) return forwarded[0];
    return req.ip;
  },
});

// ── Health ──
app.get("/health", { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } }, async () => {
  let dbStatus = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "error";
  }
  return { ok: dbStatus === "ok", db: dbStatus, version: process.env.npm_package_version ?? "1.0.0" };
});

// ── Admin: stats ──
app.get("/admin/stats", { preHandler: [requireAdmin] }, async () => {
  const [users, cards, decks, collections, watchlist, notifications] = await Promise.all([
    prisma.user.count(),
    prisma.cardVariant.count(),
    prisma.deck.count(),
    prisma.collectionEvent.count(),
    prisma.watchlistEntry.count(),
    prisma.notification.count(),
  ]);
  return { users, cards, decks, collections, watchlist, notifications };
});

// ── Collection sync ──
app.post("/v1/collection/events", { preHandler: [requireAuth] }, async (req) => {
  const user = (req as FastifyRequest & { user: AuthUser }).user;
  const body = z
    .object({
      events: z.array(
        z.object({
          id: z.string(),
          at: z.string(),
          type: z.string(),
          variantId: z.string(),
          payload: z.record(z.unknown()).default({}),
        })
      ),
    })
    .parse(req.body);

  const created = await prisma.collectionEvent.createMany({
    data: body.events.map((e) => ({
      id: e.id,
      userId: user.sub,
      at: new Date(e.at),
      type: e.type,
      variantId: e.variantId,
      payload: e.payload as unknown as Parameters<typeof prisma.collectionEvent.create>[0]["data"]["payload"],
    })),
    skipDuplicates: true,
  });

  return { ok: true, inserted: created.count };
});

app.get("/v1/collection/:userId", { preHandler: [requireAuth] }, async (req, reply) => {
  const user = (req as FastifyRequest & { user: AuthUser }).user;
  const params = z.object({ userId: z.string() }).parse(req.params);

  if (params.userId !== user.sub) {
    reply.code(403).send({ error: "Forbidden" });
    return;
  }

  const query = z.object({ since: z.string().optional() }).parse(req.query);

  const where: Record<string, unknown> = { userId: params.userId };
  if (query.since) {
    where.at = { gte: new Date(query.since) };
  }

  const events = await prisma.collectionEvent.findMany({
    where,
    orderBy: { at: "asc" },
  });

  return {
    userId: params.userId,
    events: events.map((e) => ({
      id: e.id,
      at: e.at.toISOString(),
      type: e.type,
      variantId: e.variantId,
      payload: e.payload,
    })),
  };
});

// ── Card detail ──
app.get("/v1/cards/:variantId", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
  const params = z.object({ variantId: z.string() }).parse(req.params);
  const query = z
    .object({
      historyDays: z.coerce.number().int().min(1).max(365).default(90),
    })
    .parse(req.query);

  const card = await prisma.cardVariant.findUnique({
    where: { variantId: params.variantId },
  });

  if (!card) {
    reply.code(404).send({ error: "Card not found" });
    return;
  }

  // Scryfall ID extracted from variantId (format: "scryfall:<uuid>" or "scryfall:<uuid>-foil")
  const scryfallId = params.variantId.replace(/^scryfall:/, "").replace(/-foil$/, "");
  const setCode = card.setId?.toLowerCase() ?? "";
  const collNum = card.collectorNumber ?? "";
  const encodedName = encodeURIComponent(card.name);

  // ── Fetch LIVE prices from Scryfall API for this exact card (cached 4h) ──
  let scryfallLive: ScryfallLiveData | null = scryfallCache.get(scryfallId) ?? null;
  if (!scryfallLive) {
    try {
      const scRes = await fetch(`https://api.scryfall.com/cards/${scryfallId}`, {
        headers: { "User-Agent": "CardEngine/1.0" },
      });
      if (scRes.ok) {
        scryfallLive = (await scRes.json()) as ScryfallLiveData;
        scryfallCache.set(scryfallId, scryfallLive);
      }
    } catch (err) {
      app.log.warn({ err }, "[card-detail] Scryfall fetch failed; no cached data available");
    }
  }

  // Build comprehensive store pricing with live data
  interface StorePricing {
    store: string;
    prices: Array<{ label: string; amount: number; currency: string }>;
    buyUrl: string | null;
  }

  const storePricing: StorePricing[] = [];

  // TCGplayer
  {
    const entries: StorePricing["prices"] = [];
    const usd = scryfallLive?.prices?.usd ? parseFloat(scryfallLive.prices.usd) : null;
    const usdFoil = scryfallLive?.prices?.usd_foil ? parseFloat(scryfallLive.prices.usd_foil) : null;
    const usdEtched = scryfallLive?.prices?.usd_etched ? parseFloat(scryfallLive.prices.usd_etched) : null;
    if (usd && usd > 0) entries.push({ label: "Normal", amount: usd, currency: "USD" });
    if (usdFoil && usdFoil > 0) entries.push({ label: "Foil", amount: usdFoil, currency: "USD" });
    if (usdEtched && usdEtched > 0) entries.push({ label: "Etched", amount: usdEtched, currency: "USD" });
    storePricing.push({
      store: "TCGplayer",
      prices: entries,
      buyUrl: scryfallLive?.purchase_uris?.tcgplayer ?? `https://www.tcgplayer.com/search/magic/product?q=${encodedName}&view=grid`,
    });
  }

  // Cardmarket
  {
    const entries: StorePricing["prices"] = [];
    const eur = scryfallLive?.prices?.eur ? parseFloat(scryfallLive.prices.eur) : null;
    const eurFoil = scryfallLive?.prices?.eur_foil ? parseFloat(scryfallLive.prices.eur_foil) : null;
    const eurEtched = scryfallLive?.prices?.eur_etched ? parseFloat(scryfallLive.prices.eur_etched) : null;
    if (eur && eur > 0) entries.push({ label: "Normal", amount: eur, currency: "EUR" });
    if (eurFoil && eurFoil > 0) entries.push({ label: "Foil", amount: eurFoil, currency: "EUR" });
    if (eurEtched && eurEtched > 0) entries.push({ label: "Etched", amount: eurEtched, currency: "EUR" });
    storePricing.push({
      store: "Cardmarket",
      prices: entries,
      buyUrl: scryfallLive?.purchase_uris?.cardmarket ?? `https://www.cardmarket.com/en/Magic/Products?idProduct=0&referrer=scryfall`,
    });
  }

  // Card Kingdom — use Scryfall's TCGplayer USD as a reference (CK prices are usually close)
  {
    storePricing.push({
      store: "Card Kingdom",
      prices: [], // No direct API; we show the link
      buyUrl: `https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D=${encodedName}`,
    });
  }

  // eBay
  {
    storePricing.push({
      store: "eBay",
      prices: [],
      buyUrl: `https://www.ebay.com/sch/i.html?_nkw=mtg+${encodedName.replace(/%20/g, "+")}&_sacat=38292`,
    });
  }

  // MTGGoldfish
  {
    storePricing.push({
      store: "MTGGoldfish",
      prices: [],
      buyUrl: `https://www.mtggoldfish.com/price/${setCode}/${card.name.replace(/[^a-zA-Z0-9 ]/g, "").replace(/ /g, "+")}`,
    });
  }

  // Cardhoarder (MTGO tix)
  {
    const entries: StorePricing["prices"] = [];
    const tix = scryfallLive?.prices?.tix ? parseFloat(scryfallLive.prices.tix) : null;
    if (tix && tix > 0) entries.push({ label: "MTGO", amount: tix, currency: "TIX" });
    if (entries.length > 0) {
      storePricing.push({
        store: "Cardhoarder",
        prices: entries,
        buyUrl: scryfallLive?.purchase_uris?.cardhoarder ?? null,
      });
    }
  }

  // ── Record today's live prices as PricePoints (builds real history over time) ──
  const livePriceEntries: Array<{ market: string; kind: string; currency: string; amount: number }> = [];
  if (scryfallLive?.prices) {
    const priceFields: Array<{ field: keyof ScryfallLivePrices; market: string; kind: string; currency: string }> = [
      { field: "usd", market: "tcgplayer", kind: "market", currency: "USD" },
      { field: "usd_foil", market: "tcgplayer", kind: "foil", currency: "USD" },
      { field: "usd_etched", market: "tcgplayer", kind: "etched", currency: "USD" },
      { field: "eur", market: "cardmarket", kind: "market", currency: "EUR" },
      { field: "eur_foil", market: "cardmarket", kind: "foil", currency: "EUR" },
      { field: "eur_etched", market: "cardmarket", kind: "etched", currency: "EUR" },
      { field: "tix", market: "mtgo", kind: "market", currency: "TIX" },
    ];
    for (const pf of priceFields) {
      const raw = scryfallLive.prices[pf.field];
      if (raw) {
        const amount = parseFloat(raw);
        if (!isNaN(amount) && amount > 0) {
          livePriceEntries.push({ market: pf.market, kind: pf.kind, currency: pf.currency, amount });
        }
      }
    }
  }

  // ── Fetch price history — query ALL markets ──
  const since = new Date(Date.now() - query.historyDays * 86_400_000);
  const priceHistory = await prisma.pricePoint.findMany({
    where: {
      variantId: params.variantId,
      at: { gte: since },
    },
    orderBy: { at: "asc" },
  });

  let combinedHistory = priceHistory.map((p) => ({
    at: p.at.toISOString(),
    market: p.market,
    kind: p.kind,
    currency: p.currency,
    amount: p.amount,
    variantId: p.variantId,
  }));

  // Add today's live prices if not already in history
  const now = new Date().toISOString();
  for (const lp of livePriceEntries) {
    const alreadyHas = combinedHistory.some(
      (h) => h.market === lp.market && h.kind === lp.kind && h.currency === lp.currency
        && Math.abs(new Date(h.at).getTime() - Date.now()) < 86_400_000
    );
    if (!alreadyHas) {
      combinedHistory.push({
        at: now,
        market: lp.market,
        kind: lp.kind,
        currency: lp.currency,
        amount: lp.amount,
        variantId: params.variantId,
      });
    }
  }

  // Sort combined history by time
  combinedHistory.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // ── Fetch other printings ──
  const otherPrintings = await prisma.cardVariant.findMany({
    where: {
      cardId: card.cardId,
      variantId: { not: params.variantId },
    },
    take: 20,
    orderBy: { setId: "asc" },
  });

  return {
    card: {
      variantId: card.variantId,
      cardId: card.cardId,
      printingId: card.printingId,
      name: card.name,
      setId: card.setId,
      collectorNumber: card.collectorNumber,
      oracleText: card.oracleText,
      typeLine: card.typeLine,
      colors: card.colors,
      colorIdentity: card.colorIdentity,
      cmc: card.cmc,
      manaCost: card.manaCost,
      rarity: card.rarity,
      imageUri: card.imageUri,
    },
    storePricing,
    priceHistory: combinedHistory,
    otherPrintings: otherPrintings.map((c) => ({
      variantId: c.variantId,
      name: c.name,
      setId: c.setId,
      collectorNumber: c.collectorNumber,
      rarity: c.rarity,
      imageUri: c.imageUri,
    })),
    scryfallUrl: `https://scryfall.com/card/${setCode}/${collNum}`,
  };
});

// ── Search ──
app.get("/v1/search", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req) => {
  const query = z
    .object({
      q: z.string().min(1),
      game: z.string().default("mtg"),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
      sort: z
        .enum(["name-asc", "name-desc", "price-asc", "price-desc", "popular", "rarity"])
        .default("name-asc"),
    })
    .parse(req.query);

  // Determine the Prisma orderBy based on sort — for price sorts we fetch more and sort in-memory
  const isPriceSort = query.sort === "price-asc" || query.sort === "price-desc";
  const isPopularSort = query.sort === "popular";

  let orderBy: Record<string, string> = { name: "asc" };
  if (query.sort === "name-asc") orderBy = { name: "asc" };
  else if (query.sort === "name-desc") orderBy = { name: "desc" };
  else if (query.sort === "rarity") orderBy = { name: "asc" }; // we'll re-sort in memory by rarity rank

  // For price/popular sorts, fetch a larger window so we can sort properly
  const fetchLimit = isPriceSort || isPopularSort || query.sort === "rarity"
    ? Math.min(query.limit * 3, 300)
    : query.limit;

  const cards = await prisma.cardVariant.findMany({
    where: {
      game: query.game,
      name: { contains: query.q, mode: "insensitive" },
    },
    take: fetchLimit + query.offset,
    skip: 0,
    orderBy,
  });

  // Batch-fetch ALL prices for all returned cards
  const variantIds = cards.map((c) => c.variantId);
  const prices = variantIds.length > 0
    ? await prisma.priceCache.findMany({
        where: { variantId: { in: variantIds } },
      })
    : [];

  // Build a map: variantId → array of price entries
  const priceMap = new Map<string, Array<{ market: string; kind: string; currency: string; amount: number }>>();
  for (const p of prices) {
    const arr = priceMap.get(p.variantId) ?? [];
    arr.push({ market: p.market, kind: p.kind, currency: p.currency, amount: p.amount });
    priceMap.set(p.variantId, arr);
  }

  // For popular sort, count collection events per card
  let popularityMap = new Map<string, number>();
  if (isPopularSort && variantIds.length > 0) {
    const counts = await prisma.collectionEvent.groupBy({
      by: ["variantId"],
      where: { variantId: { in: variantIds } },
      _count: { id: true },
    });
    for (const c of counts) {
      popularityMap.set(c.variantId, c._count.id);
    }
  }

  // Helper to get the best USD price for a card
  function bestUsdPrice(vId: string): number {
    const cardPrices = priceMap.get(vId) ?? [];
    const usd = cardPrices.find((p) => p.currency === "USD" && p.kind === "market");
    if (usd) return usd.amount;
    const anyUsd = cardPrices.find((p) => p.currency === "USD");
    if (anyUsd) return anyUsd.amount;
    const anyEur = cardPrices.find((p) => p.currency === "EUR" && p.kind === "market");
    if (anyEur) return anyEur.amount;
    return 0;
  }

  // Rarity rank for sorting
  const rarityRank: Record<string, number> = {
    mythic: 0,
    rare: 1,
    uncommon: 2,
    common: 3,
    special: 4,
    bonus: 5,
  };

  // Sort the results
  let sorted = [...cards];
  if (isPriceSort) {
    sorted.sort((a, b) => {
      const pa = bestUsdPrice(a.variantId);
      const pb = bestUsdPrice(b.variantId);
      return query.sort === "price-asc" ? pa - pb : pb - pa;
    });
  } else if (isPopularSort) {
    // Sort by: has prices first, then by collection event count, then by rarity, then name
    sorted.sort((a, b) => {
      const pa = bestUsdPrice(a.variantId);
      const pb = bestUsdPrice(b.variantId);
      // Cards with prices are "more popular" (proxy)
      const hasPriceA = pa > 0 ? 1 : 0;
      const hasPriceB = pb > 0 ? 1 : 0;
      if (hasPriceB !== hasPriceA) return hasPriceB - hasPriceA;
      // Then by collection events
      const countA = popularityMap.get(a.variantId) ?? 0;
      const countB = popularityMap.get(b.variantId) ?? 0;
      if (countB !== countA) return countB - countA;
      // Then by price descending (expensive = popular proxy)
      if (pb !== pa) return pb - pa;
      return a.name.localeCompare(b.name);
    });
  } else if (query.sort === "rarity") {
    sorted.sort((a, b) => {
      const ra = rarityRank[a.rarity?.toLowerCase() ?? "common"] ?? 99;
      const rb = rarityRank[b.rarity?.toLowerCase() ?? "common"] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
  }

  // Apply pagination after sort
  const paginated = sorted.slice(query.offset, query.offset + query.limit);

  return {
    query: query.q,
    sort: query.sort,
    total: paginated.length,
    cards: paginated.map((c) => {
      const cardPrices = priceMap.get(c.variantId) ?? [];

      // Convenience top-level fields (best non-foil price per currency)
      const usdMarket = cardPrices.find((p) => p.currency === "USD" && p.kind === "market");
      const eurMarket = cardPrices.find((p) => p.currency === "EUR" && p.kind === "market");

      return {
        variantId: c.variantId,
        cardId: c.cardId,
        printingId: c.printingId,
        name: c.name,
        setId: c.setId,
        collectorNumber: c.collectorNumber,
        oracleText: c.oracleText,
        typeLine: c.typeLine,
        colors: c.colors,
        colorIdentity: c.colorIdentity,
        cmc: c.cmc,
        manaCost: c.manaCost,
        rarity: c.rarity,
        imageUri: c.imageUri,
        // Backward-compat flat fields
        priceUsd: usdMarket?.amount ?? null,
        priceEur: eurMarket?.amount ?? null,
        // Full prices array with all sources/types
        prices: cardPrices.map((p) => ({
          market: p.market,
          kind: p.kind,
          currency: p.currency,
          amount: p.amount,
        })),
      };
    }),
  };
});

// ── Scan: identify card from OCR fields ──
app.post("/v1/scan/identify", async (req) => {
  const body = z
    .object({
      name: z.string().min(1),
      setCode: z.string().optional(),
      collectorNumber: z.string().optional(),
      manaCost: z.string().optional(),
      limit: z.number().int().min(1).max(20).default(5),
    })
    .parse(req.body);

  // Levenshtein distance for fuzzy matching
  function levenshtein(a: string, b: string): number {
    const la = a.length, lb = b.length;
    if (la === 0) return lb;
    if (lb === 0) return la;
    const dp: number[][] = Array.from({ length: la + 1 }, (_, i) =>
      Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= la; i++) {
      for (let j = 1; j <= lb; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[la][lb];
  }

  const nameNorm = body.name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

  // If we have exact set+collector, try direct lookup first
  if (body.setCode && body.collectorNumber) {
    const exact = await prisma.cardVariant.findFirst({
      where: {
        setId: { equals: body.setCode.toLowerCase(), mode: "insensitive" },
        collectorNumber: body.collectorNumber,
        game: "mtg",
      },
    });
    if (exact) {
      const prices = await prisma.priceCache.findMany({
        where: { variantId: exact.variantId },
      });
      return {
        candidates: [{
          variantId: exact.variantId,
          cardId: exact.cardId,
          name: exact.name,
          setId: exact.setId,
          collectorNumber: exact.collectorNumber,
          imageUri: exact.imageUri,
          manaCost: exact.manaCost,
          typeLine: exact.typeLine,
          rarity: exact.rarity,
          score: 100,
          matchType: "exact_set_collector",
          prices: prices.map((p) => ({
            market: p.market,
            kind: p.kind,
            currency: p.currency,
            amount: p.amount,
          })),
        }],
      };
    }
  }

  // Search by name - try multiple strategies for OCR-fuzzy input
  let candidates = await prisma.cardVariant.findMany({
    where: {
      game: "mtg",
      name: { contains: nameNorm.length > 3 ? nameNorm.slice(0, Math.min(nameNorm.length, 30)) : nameNorm, mode: "insensitive" },
    },
    take: 100,
  });

  // If no results, try each word individually (handles OCR typos in multi-word names)
  if (candidates.length === 0) {
    const words = nameNorm.split(/\s+/).filter((w) => w.length >= 3);
    for (const word of words) {
      const partial = await prisma.cardVariant.findMany({
        where: { game: "mtg", name: { contains: word, mode: "insensitive" } },
        take: 50,
      });
      candidates.push(...partial);
    }
    // Deduplicate
    const seen = new Set<string>();
    candidates = candidates.filter((c) => {
      if (seen.has(c.variantId)) return false;
      seen.add(c.variantId);
      return true;
    });
  }

  // If still no results, try a short prefix (first 4 chars)
  if (candidates.length === 0 && nameNorm.length >= 4) {
    candidates = await prisma.cardVariant.findMany({
      where: { game: "mtg", name: { startsWith: nameNorm.slice(0, 4), mode: "insensitive" } },
      take: 50,
    });
  }

  // Score each candidate
  const scored = candidates.map((c) => {
    const cName = c.name.toLowerCase().replace(/[^a-z0-9 ]/g, "");
    let score = 0;
    let matchType = "fuzzy";

    // Exact name match
    if (cName === nameNorm) {
      score = 80;
      matchType = "exact_name";
    } else if (cName.startsWith(nameNorm) || nameNorm.startsWith(cName)) {
      score = 70;
      matchType = "prefix";
    } else {
      // Fuzzy: Levenshtein-based score
      const dist = levenshtein(nameNorm, cName);
      const maxLen = Math.max(nameNorm.length, cName.length);
      const similarity = 1 - dist / maxLen;
      score = Math.round(similarity * 60);
      matchType = "fuzzy";
    }

    // Set code bonus
    if (body.setCode && c.setId?.toLowerCase() === body.setCode.toLowerCase()) {
      score += 10;
      if (body.collectorNumber && c.collectorNumber === body.collectorNumber) {
        score += 10;
        matchType = "set_collector";
      }
    }

    // Mana cost confirmation bonus
    if (body.manaCost && c.manaCost) {
      const normMana = (s: string) => s.replace(/[{}]/g, "").toUpperCase();
      if (normMana(c.manaCost) === normMana(body.manaCost)) {
        score += 5;
      }
    }

    // Prefer non-foil variants
    if (c.variantId.endsWith("-foil")) score -= 2;

    return { ...c, score, matchType };
  });

  // Sort by score descending, then name
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  // Deduplicate by cardId (keep highest scored variant per card)
  const seen = new Set<string>();
  const deduped = scored.filter((c) => {
    if (seen.has(c.cardId)) return false;
    seen.add(c.cardId);
    return true;
  });

  const top = deduped.slice(0, body.limit);

  // Batch-fetch prices
  const variantIds = top.map((c) => c.variantId);
  const prices = variantIds.length > 0
    ? await prisma.priceCache.findMany({ where: { variantId: { in: variantIds } } })
    : [];
  const priceMap = new Map<string, Array<{ market: string; kind: string; currency: string; amount: number }>>();
  for (const p of prices) {
    const arr = priceMap.get(p.variantId) ?? [];
    arr.push({ market: p.market, kind: p.kind, currency: p.currency, amount: p.amount });
    priceMap.set(p.variantId, arr);
  }

  return {
    candidates: top.map((c) => ({
      variantId: c.variantId,
      cardId: c.cardId,
      name: c.name,
      setId: c.setId,
      collectorNumber: c.collectorNumber,
      imageUri: c.imageUri,
      manaCost: c.manaCost,
      typeLine: c.typeLine,
      rarity: c.rarity,
      score: c.score,
      matchType: c.matchType,
      prices: priceMap.get(c.variantId) ?? [],
    })),
  };
});

// ── Deck import: resolve card names to variant IDs ──
app.post("/v1/deck/import", async (req) => {
  const body = z
    .object({
      // Each entry: "4 Lightning Bolt" or "1 Sol Ring (CMR) 472"
      lines: z.array(z.string()),
    })
    .parse(req.body);

  interface ResolvedCard {
    line: string;
    quantity: number;
    name: string;
    board: "main" | "side" | "commander";
    resolved: boolean;
    variantId: string | null;
    cardId: string | null;
    imageUri: string | null;
    manaCost: string | null;
    typeLine: string | null;
    priceUsd: number | null;
    setId: string | null;
    collectorNumber: string | null;
  }

  const results: ResolvedCard[] = [];
  let currentBoard: "main" | "side" | "commander" = "main";

  // Standard decklist regex: optional qty, card name, optional (SET) collector#
  const lineRegex = /^(\d+)[x]?\s+(.+?)(?:\s+\((\w+)\)\s*(\S+))?$/i;
  // Section headers
  const sectionRegex = /^(?:\/\/\s*)?(?:sideboard|side)\s*$/i;
  const commanderRegex = /^(?:\/\/\s*)?(?:commander|companion)\s*$/i;

  for (const rawLine of body.lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//")) {
      // Check for section markers
      if (sectionRegex.test(line.replace(/^\/\/\s*/, ""))) {
        currentBoard = "side";
      } else if (commanderRegex.test(line.replace(/^\/\/\s*/, ""))) {
        currentBoard = "commander";
      }
      continue;
    }
    // Check section markers as standalone lines
    if (sectionRegex.test(line)) {
      currentBoard = "side";
      continue;
    }
    if (commanderRegex.test(line)) {
      currentBoard = "commander";
      continue;
    }

    const match = line.match(lineRegex);
    const quantity = match ? parseInt(match[1], 10) : 1;
    const cardName = match ? match[2].trim() : line.trim();
    const setHint = match?.[3]?.toLowerCase();
    const collNumHint = match?.[4];

    results.push({
      line,
      quantity,
      name: cardName,
      board: currentBoard,
      resolved: false,
      variantId: null,
      cardId: null,
      imageUri: null,
      manaCost: null,
      typeLine: null,
      priceUsd: null,
      setId: null,
      collectorNumber: null,
    });
  }

  // Batch resolve card names
  const uniqueNames = [...new Set(results.map((r) => r.name.toLowerCase()))];

  // Find all matching cards for these names
  const candidates = await prisma.cardVariant.findMany({
    where: {
      game: "mtg",
      name: { in: uniqueNames, mode: "insensitive" },
    },
  });

  // Build name → candidates map
  const nameMap = new Map<string, typeof candidates>();
  for (const c of candidates) {
    const key = c.name.toLowerCase();
    const arr = nameMap.get(key) ?? [];
    arr.push(c);
    nameMap.set(key, arr);
  }

  // Fetch prices for all candidates
  const allCandidateIds = candidates.map((c) => c.variantId);
  const candidatePrices = allCandidateIds.length > 0
    ? await prisma.priceCache.findMany({
        where: { variantId: { in: allCandidateIds }, market: "tcgplayer", kind: "market" },
      })
    : [];
  const priceMap = new Map<string, number>();
  for (const p of candidatePrices) {
    priceMap.set(p.variantId, p.amount);
  }

  // Resolve each card
  for (const r of results) {
    const cands = nameMap.get(r.name.toLowerCase());
    if (!cands || cands.length === 0) continue;

    // Prefer exact set+collector match, then any from that set, then cheapest non-foil
    let best = cands[0];
    for (const c of cands) {
      if (r.line.includes(`(${c.setId?.toUpperCase()})`) && c.collectorNumber && r.line.includes(c.collectorNumber)) {
        best = c;
        break;
      }
    }
    // If no exact match, prefer non-foil variants with prices
    if (best.variantId.endsWith("-foil")) {
      const nonFoil = cands.find((c) => !c.variantId.endsWith("-foil") && priceMap.has(c.variantId));
      if (nonFoil) best = nonFoil;
    }

    r.resolved = true;
    r.variantId = best.variantId;
    r.cardId = best.cardId;
    r.imageUri = best.imageUri;
    r.manaCost = best.manaCost;
    r.typeLine = best.typeLine;
    r.setId = best.setId;
    r.collectorNumber = best.collectorNumber;
    r.priceUsd = priceMap.get(best.variantId) ?? null;
  }

  const resolvedCount = results.filter((r) => r.resolved).length;

  return {
    total: results.length,
    resolved: resolvedCount,
    unresolved: results.length - resolvedCount,
    cards: results,
  };
});

// ── Deck advisor: suggest decks from collection ──
app.post("/v1/deck/suggest", { preHandler: [requireAuth] }, async (req) => {
  const user = (req as FastifyRequest & { user: AuthUser }).user;
  const suggestions = await suggestDecks(user.sub);
  return { suggestions };
});

// ── Deck advisor: card recommendations ──
app.post("/v1/deck/recs", { preHandler: [optionalAuth] }, async (req) => {
  const user = (req as FastifyRequest & { user?: AuthUser }).user;
  const body = z
    .object({
      commanderName: z.string().min(1),
      currentCards: z.array(z.string()).default([]),
      budget: z.number().positive().optional(),
    })
    .parse(req.body);

  const recs = await getRecommendations({
    commanderName: body.commanderName,
    currentCards: body.currentCards,
    userId: user?.sub,
    budget: body.budget,
  });

  return { recommendations: recs };
});

// ── Deck advisor: swap suggestions ──
app.post("/v1/deck/swaps", { preHandler: [optionalAuth] }, async (req) => {
  const user = (req as FastifyRequest & { user?: AuthUser }).user;
  const body = z
    .object({
      commanderName: z.string().min(1),
      currentCards: z.array(z.string()).default([]),
      budget: z.number().positive().optional(),
    })
    .parse(req.body);

  const swaps = await getSwapSuggestions({
    commanderName: body.commanderName,
    currentCards: body.currentCards,
    userId: user?.sub,
    budget: body.budget,
  });

  return { swaps };
});

// ── EDHRec: standalone commander lookup ──
app.get("/v1/edhrec/commander/:name", async (req, reply) => {
  const { name } = z.object({ name: z.string().min(1) }).parse(req.params);
  const data = await fetchEdhrecCommander(name);
  if (!data) return reply.code(404).send({ error: "Commander not found on EDHREC" });
  return {
    commander: name,
    sanitized: sanitizeCommanderName(name),
    num_decks: data.num_decks_avg,
    avg_price: data.avg_price,
    themes: data.themes,
    similar: data.similar,
    recommendations: data.cardlists.map((c) => ({
      name: c.name,
      synergy: c.synergy,
      inclusion: Math.round(c.inclusion * 100),
      primary_type: c.primary_type,
      cmc: c.cmc,
      color_identity: c.color_identity,
      image: c.image_uris?.[0]?.normal ?? null,
      price_usd: c.prices?.usd?.price ?? null,
    })),
  };
});

// ── AI deck advice (Claude) ──
app.post("/v1/ai/deck-advice", { preHandler: [requireAuth], config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return reply.code(503).send({ error: "AI advice not configured" });

  const body = z
    .object({
      deckId: z.string().optional(),
      commander: z.string().optional(),
      cards: z.array(z.object({ name: z.string(), quantity: z.number().default(1), section: z.string().default("mainboard") })).optional(),
      question: z.string().max(500).default("What are the main weaknesses and top 5 improvements for this deck?"),
    })
    .parse(req.body);

  if (!body.deckId && (!body.cards || body.cards.length === 0)) {
    return reply.code(400).send({ error: "Provide deckId or cards[]" });
  }

  let cards = body.cards ?? [];
  let commander = body.commander ?? null;
  let deckName = "Unnamed deck";

  if (body.deckId) {
    const user = (req as FastifyRequest & { user: AuthUser }).user;
    const deck = await prisma.deck.findUnique({
      where: { id: body.deckId },
      include: { cards: true },
    });
    if (!deck) return reply.code(404).send({ error: "Deck not found" });
    if (deck.userId !== user.sub) return reply.code(403).send({ error: "Forbidden" });
    cards = deck.cards.map((c) => ({ name: c.cardName, quantity: c.quantity, section: c.section }));
    commander = deck.commander ?? deck.cards.find((c) => c.section === "commander")?.cardName ?? null;
    deckName = deck.name;
  }

  const deckList = cards
    .map((c) => `${c.quantity}x ${c.name}${c.section !== "mainboard" ? ` [${c.section}]` : ""}`)
    .join("\n");

  const prompt = [
    `You are an expert Magic: The Gathering deck advisor.`,
    commander ? `Commander: ${commander}` : "",
    `Deck: ${deckName}`,
    `\nDecklist:\n${deckList}`,
    `\nUser question: ${body.question}`,
    `\nProvide concise, actionable advice. Focus on synergies, weaknesses, budget-friendly improvements, and specific card recommendations. Format with clear sections.`,
  ].filter(Boolean).join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    app.log.error({ status: res.status }, "[ai/deck-advice] Anthropic API error");
    return reply.code(502).send({ error: "AI service error" });
  }

  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  const text = data.content.find((b) => b.type === "text")?.text ?? "";
  return { advice: text };
});

// ── Collection cards (enriched) ──
app.get("/v1/collection/cards", { preHandler: [requireAuth] }, async (req) => {
  const user = (req as FastifyRequest & { user: AuthUser }).user;
  const query = z
    .object({
      q: z.string().optional(),
      market: z.string().default("tcgplayer"),
      kind: z.string().default("normal"),
      currency: z.string().default("USD"),
      sort: z.enum(["name", "value", "qty", "added"]).default("value"),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(60),
    })
    .parse(req.query);

  // Compute net quantities from events
  const events = await prisma.collectionEvent.findMany({
    where: { userId: user.sub },
    select: { variantId: true, payload: true, type: true, at: true },
    orderBy: { at: "asc" },
  });

  const qtys = new Map<string, number>();
  const firstAdded = new Map<string, Date>();
  for (const e of events) {
    const payload = e.payload as { qty?: number; quantity?: number };
    const delta = e.type === "add"
      ? (payload.qty ?? payload.quantity ?? 1)
      : -(payload.qty ?? payload.quantity ?? 1);
    qtys.set(e.variantId, (qtys.get(e.variantId) ?? 0) + delta);
    if (!firstAdded.has(e.variantId)) firstAdded.set(e.variantId, e.at);
  }

  const owned = [...qtys.entries()].filter(([, q]) => q > 0);
  const variantIds = owned.map(([id]) => id);

  if (variantIds.length === 0) {
    return { cards: [], totalCards: 0, totalValue: 0, page: query.page, hasMore: false };
  }

  // Fetch card details
  const variants = await prisma.cardVariant.findMany({
    where: {
      variantId: { in: variantIds },
      ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
    },
  });

  // Fetch prices
  const prices = await prisma.priceCache.findMany({
    where: { variantId: { in: variantIds }, market: query.market, kind: query.kind, currency: query.currency },
  });
  const priceMap = new Map(prices.map((p) => [p.variantId, p.amount]));

  const cards = variants.map((v) => {
    const qty = qtys.get(v.variantId) ?? 0;
    const price = priceMap.get(v.variantId) ?? null;
    return {
      variantId: v.variantId,
      name: v.name,
      imageUri: v.imageUri,
      setId: v.setId,
      collectorNumber: v.collectorNumber,
      rarity: v.rarity,
      typeLine: v.typeLine,
      manaCost: v.manaCost,
      colors: v.colors,
      quantity: qty,
      priceUsd: price,
      lineValue: price != null ? price * qty : null,
      addedAt: firstAdded.get(v.variantId)?.toISOString() ?? null,
    };
  });

  // Sort
  cards.sort((a, b) => {
    switch (query.sort) {
      case "name": return a.name.localeCompare(b.name);
      case "qty": return b.quantity - a.quantity;
      case "added": return (b.addedAt ?? "").localeCompare(a.addedAt ?? "");
      case "value":
      default: return (b.lineValue ?? 0) - (a.lineValue ?? 0);
    }
  });

  const totalValue = cards.reduce((s, c) => s + (c.lineValue ?? 0), 0);
  const start = (query.page - 1) * query.limit;
  const page = cards.slice(start, start + query.limit);

  return {
    cards: page,
    totalCards: cards.length,
    totalValue: Math.round(totalValue * 100) / 100,
    page: query.page,
    hasMore: start + query.limit < cards.length,
  };
});

// ── Collection portfolio value ──
app.get("/v1/collection/value", { preHandler: [requireAuth] }, async (req) => {
  const user = (req as FastifyRequest & { user: AuthUser }).user;
  const query = z
    .object({
      market: z.string().default("tcgplayer"),
      kind: z.string().default("normal"),
      currency: z.string().default("USD"),
    })
    .parse(req.query);

  // Get all unique variantIds the user owns (net qty > 0)
  const events = await prisma.collectionEvent.findMany({
    where: { userId: user.sub },
    select: { variantId: true, payload: true, type: true },
  });

  const qtys = new Map<string, number>();
  for (const e of events) {
    const payload = e.payload as { qty?: number };
    const delta = e.type === "add" ? (payload.qty ?? 1) : -(payload.qty ?? 1);
    qtys.set(e.variantId, (qtys.get(e.variantId) ?? 0) + delta);
  }

  const owned = [...qtys.entries()].filter(([, q]) => q > 0);
  const variantIds = owned.map(([id]) => id);

  const prices = variantIds.length > 0
    ? await prisma.priceCache.findMany({
        where: { variantId: { in: variantIds }, market: query.market, kind: query.kind, currency: query.currency },
      })
    : [];
  const priceMap = new Map(prices.map((p) => [p.variantId, p.amount]));

  let totalValue = 0;
  const breakdown = owned.map(([variantId, qty]) => {
    const price = priceMap.get(variantId) ?? 0;
    totalValue += price * qty;
    return { variantId, qty, price, lineValue: price * qty };
  });

  // Sort by value descending
  breakdown.sort((a, b) => b.lineValue - a.lineValue);

  return {
    totalValue: Math.round(totalValue * 100) / 100,
    currency: query.currency,
    cardCount: owned.length,
    breakdown: breakdown.slice(0, 100), // top 100 by value
  };
});

// ── Bundles (Phase 2) — cursor-paginated with delta sync ──
app.get("/v1/bundles/:game", async (req) => {
  const params = z.object({ game: z.string() }).parse(req.params);
  const query = z
    .object({
      cursor: z.string().optional(), // last variantId from previous page
      limit: z.coerce.number().int().min(1).max(5000).default(2000),
      since: z.string().optional(), // ISO timestamp for delta sync
    })
    .parse(req.query);

  const where: Record<string, unknown> = { game: params.game };

  // Delta sync: only return cards updated after this timestamp
  if (query.since) {
    where.updatedAt = { gte: new Date(query.since) };
  }

  // Cursor pagination: return cards after this variantId
  if (query.cursor) {
    where.variantId = { gt: query.cursor };
  }

  const cards = await prisma.cardVariant.findMany({
    where,
    orderBy: { variantId: "asc" },
    take: query.limit + 1, // fetch one extra to detect if there's a next page
  });

  const hasMore = cards.length > query.limit;
  const items = hasMore ? cards.slice(0, query.limit) : cards;
  const nextCursor = hasMore ? items[items.length - 1]!.variantId : null;

  return {
    game: params.game,
    count: items.length,
    hasMore,
    nextCursor,
    items: items.map((c) => ({
      variantId: c.variantId,
      cardId: c.cardId,
      name: c.name,
      setId: c.setId,
      collectorNumber: c.collectorNumber,
      colors: c.colors,
      colorIdentity: c.colorIdentity,
      cmc: c.cmc,
      rarity: c.rarity,
      imageUri: c.imageUri,
      oracleText: c.oracleText,
      typeLine: c.typeLine,
      manaCost: c.manaCost,
    })),
  };
});

// ── Batch price lookup (POST for large lists) ──
app.post("/v1/prices/batch", async (req) => {
  const body = z
    .object({
      variantIds: z.array(z.string()).min(1).max(500),
      market: z.string().default("tcgplayer"),
    })
    .parse(req.body);

  const prices = await prisma.priceCache.findMany({
    where: {
      variantId: { in: body.variantIds },
      market: body.market,
    },
  });

  const priceMap: Record<string, { amount: number; currency: string; updatedAt: string }> = {};
  for (const p of prices) {
    priceMap[p.variantId] = {
      amount: p.amount,
      currency: p.currency,
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  return { market: body.market, prices: priceMap };
});

// ── Bundle total count (for progress UI) ──
app.get("/v1/bundles/:game/count", async (req) => {
  const params = z.object({ game: z.string() }).parse(req.params);
  const count = await prisma.cardVariant.count({ where: { game: params.game } });
  return { game: params.game, count };
});

// ── Prices ──
app.get("/v1/prices/:market", async (req, reply) => {
  const params = z.object({ market: z.string() }).parse(req.params);
  const query = z
    .object({
      variantIds: z
        .string()
        .optional()
        .transform((v) => (v ? v.split(",").filter(Boolean) : [])),
    })
    .parse(req.query);

  if (query.variantIds.length === 0) {
    reply.code(400).send({ error: "variantIds query param is required" });
    return;
  }

  const where: Record<string, unknown> = {
    market: params.market,
    variantId: { in: query.variantIds },
  };

  const cached = await prisma.priceCache.findMany({ where });
  return {
    market: params.market,
    at: new Date().toISOString(),
    points: cached.map((c) => ({
      variantId: c.variantId,
      kind: c.kind,
      value: { amount: c.amount, currency: c.currency },
      updatedAt: c.updatedAt.toISOString(),
    })),
  };
});

// ── Price history (Phase 3) ──
app.get("/v1/prices/history/:variantId", async (req) => {
  const params = z.object({ variantId: z.string() }).parse(req.params);
  const query = z
    .object({
      market: z.string().default("tcgplayer"),
      days: z.coerce.number().int().min(1).max(365).default(30),
    })
    .parse(req.query);

  const since = new Date(Date.now() - query.days * 86_400_000);
  const points = await prisma.pricePoint.findMany({
    where: {
      variantId: params.variantId,
      market: query.market,
      at: { gte: since },
    },
    orderBy: { at: "asc" },
  });

  return {
    variantId: params.variantId,
    market: query.market,
    points: points.map((p) => ({
      at: p.at.toISOString(),
      kind: p.kind,
      value: { amount: p.amount, currency: p.currency },
    })),
  };
});

// ── Watchlist ──
app.post("/v1/watchlist", { preHandler: [requireAuth] }, async (req) => {
  const user = (req as FastifyRequest & { user: AuthUser }).user;
  const body = z
    .object({
      variantId: z.string(),
      market: z.string(),
      kind: z.string().default("market"),
      currency: z.string().default("USD"),
      thresholdAmount: z.number(),
      direction: z.enum(["above", "below"]),
    })
    .parse(req.body);

  const entry = await prisma.watchlistEntry.create({
    data: { userId: user.sub, ...body },
  });
  return { ok: true, entry };
});

app.get("/v1/watchlist", { preHandler: [requireAuth] }, async (req) => {
  const user = (req as FastifyRequest & { user: AuthUser }).user;
  const entries = await prisma.watchlistEntry.findMany({
    where: { userId: user.sub },
    orderBy: { createdAt: "desc" },
  });

  // Attach current cached price to each entry
  const variantIds = [...new Set(entries.map((e) => e.variantId))];
  const prices = variantIds.length > 0
    ? await prisma.priceCache.findMany({
        where: { variantId: { in: variantIds } },
      })
    : [];
  const priceIndex = new Map(prices.map((p) => [`${p.variantId}:${p.market}:${p.kind}:${p.currency}`, p.amount]));

  // Attach card names
  const variants = variantIds.length > 0
    ? await prisma.cardVariant.findMany({
        where: { variantId: { in: variantIds } },
        select: { variantId: true, name: true, imageUri: true },
      })
    : [];
  const variantMap = new Map(variants.map((v) => [v.variantId, v]));

  return {
    entries: entries.map((e) => ({
      ...e,
      currentPrice: priceIndex.get(`${e.variantId}:${e.market}:${e.kind}:${e.currency}`) ?? null,
      cardName: variantMap.get(e.variantId)?.name ?? e.variantId,
      imageUri: variantMap.get(e.variantId)?.imageUri ?? null,
    })),
  };
});

app.delete("/v1/watchlist/:id", { preHandler: [requireAuth] }, async (req, reply) => {
  const user = (req as FastifyRequest & { user: AuthUser }).user;
  const { id } = z.object({ id: z.string() }).parse(req.params);
  const entry = await prisma.watchlistEntry.findUnique({ where: { id } });
  if (!entry) return reply.code(404).send({ error: "Not found" });
  if (entry.userId !== user.sub) return reply.code(403).send({ error: "Forbidden" });
  await prisma.watchlistEntry.delete({ where: { id } });
  return { ok: true };
});

app.patch("/v1/watchlist/:id", { preHandler: [requireAuth] }, async (req, reply) => {
  const user = (req as FastifyRequest & { user: AuthUser }).user;
  const { id } = z.object({ id: z.string() }).parse(req.params);
  const body = z.object({ enabled: z.boolean() }).parse(req.body);
  const entry = await prisma.watchlistEntry.findUnique({ where: { id } });
  if (!entry) return reply.code(404).send({ error: "Not found" });
  if (entry.userId !== user.sub) return reply.code(403).send({ error: "Forbidden" });
  await prisma.watchlistEntry.update({ where: { id }, data: body });
  return { ok: true };
});

// ── Dev seed ──
app.post("/dev/seed", async (req, reply) => {
  if (process.env.NODE_ENV === "production") {
    reply.code(404).send({ error: "Not Found" });
    return;
  }
  const user = await prisma.user.upsert({
    where: { id: "dev-user" },
    update: {},
    create: { id: "dev-user" },
  });

  await prisma.cardVariant.upsert({
    where: { variantId: "variant-abc" },
    update: {
      name: "Sample Card",
      game: "mtg",
      cardId: "card-abc",
      printingId: "printing-abc",
    },
    create: {
      variantId: "variant-abc",
      game: "mtg",
      cardId: "card-abc",
      printingId: "printing-abc",
      name: "Sample Card",
      setId: "TST",
      collectorNumber: "001",
    },
  });

  await prisma.priceCache.upsert({
    where: {
      market_variantId_kind_currency: {
        market: "tcgplayer",
        variantId: "variant-abc",
        kind: "market",
        currency: "USD",
      },
    },
    update: { amount: 3.5 },
    create: {
      market: "tcgplayer",
      variantId: "variant-abc",
      kind: "market",
      currency: "USD",
      amount: 3.5,
    },
  });

  return { ok: true, userId: user.id };
});

// ── Register route modules ──
registerLocalSceneRoutes(app);
registerTelemetryRoutes(app);
registerDeckRoutes(app);

// ── Admin guard ──
const ADMIN_IDS = (process.env.ADMIN_USER_IDS ?? "").split(",").filter(Boolean);

async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const user = await extractUser(req);
  if (!user) {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }
  if (!ADMIN_IDS.includes(user.sub)) {
    reply.code(403).send({ error: "Forbidden: admin access required" });
    return;
  }
  (req as FastifyRequest & { user: AuthUser }).user = user;
}

// ── Admin: Scryfall ingest ──
app.post("/admin/ingest/scryfall", { preHandler: [requireAdmin], config: { rateLimit: { max: 2, timeWindow: "1 minute" } } }, async (req) => {
  const body = z
    .object({ maxCards: z.number().optional() })
    .default({})
    .parse(req.body ?? {});
  const result = await ingestScryfallBulk({ maxCards: body.maxCards });
  return { ok: true, ...result };
});

// ── Admin ──
app.post("/admin/users/:id/ban", { preHandler: [requireAdmin] }, async (req) => {
  const { id } = z.object({ id: z.string() }).parse(req.params);
  await prisma.user.update({ where: { id }, data: { banned: true } });
  return { ok: true, userId: id };
});

// ── Daily pricing refresh job (Phase 3) ──
const DAILY_MS = 24 * 60 * 60 * 1000;
let priceRefreshTimer: ReturnType<typeof setInterval> | null = null;

async function runDailyPriceRefresh() {
  const ran = await withAdvisoryLock("priceRefresh", async () => {
    console.log("[price-refresh] Starting daily price refresh...");
    await ingestScryfallBulk();
    console.log("[price-refresh] Daily price refresh complete.");
  }).catch((err) => {
    console.error("[price-refresh] Error:", err);
    return false;
  });
  if (!ran) {
    console.log("[price-refresh] Another instance is handling this cycle.");
  }
}

// Start daily refresh timer
if (process.env.ENABLE_PRICE_REFRESH !== "false") {
  priceRefreshTimer = setInterval(runDailyPriceRefresh, DAILY_MS);
  console.log("[price-refresh] Scheduled daily price refresh (with leader lock).");
}

// ── Expo push notification helper ──

interface ExpoPushMessage {
  to: string | string[];
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
}

async function sendExpoPushNotifications(messages: ExpoPushMessage[]) {
  if (messages.length === 0) return;
  // Expo push API accepts batches of up to 100
  const BATCH = 100;
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        app.log.warn(`[expo-push] HTTP ${res.status}: ${await res.text()}`);
      }
    } catch (err) {
      app.log.warn({ err }, "[expo-push] Failed to send batch");
    }
  }
}

// ── Watchlist check job (Phase 3) ──
async function checkWatchlistAlerts() {
  try {
    const entries = await prisma.watchlistEntry.findMany({
      where: { enabled: true },
    });

    const uniqueVariantIds = [...new Set(entries.map((e) => e.variantId))];
    const allPrices = await prisma.priceCache.findMany({
      where: { variantId: { in: uniqueVariantIds } },
    });
    const priceIndex = new Map<string, typeof allPrices[0]>();
    for (const p of allPrices) {
      priceIndex.set(`${p.variantId}:${p.market}:${p.kind}:${p.currency}`, p);
    }

    // Collect card names for nicer notification copy
    const variants = uniqueVariantIds.length > 0
      ? await prisma.cardVariant.findMany({
          where: { variantId: { in: uniqueVariantIds } },
          select: { variantId: true, name: true },
        })
      : [];
    const nameIndex = new Map(variants.map((v) => [v.variantId, v.name]));

    const pushMessages: ExpoPushMessage[] = [];

    for (const entry of entries) {
      const cache = priceIndex.get(`${entry.variantId}:${entry.market}:${entry.kind}:${entry.currency}`);
      if (!cache) continue;

      const triggered =
        entry.direction === "above"
          ? cache.amount >= entry.thresholdAmount
          : cache.amount <= entry.thresholdAmount;

      if (!triggered) continue;

      const cardName = nameIndex.get(entry.variantId) ?? entry.variantId;
      const dirLabel = entry.direction === "above" ? "⬆ Above" : "⬇ Below";
      const notifTitle = `${dirLabel} $${entry.thresholdAmount} — ${cardName}`;
      const notifBody = `Now $${cache.amount.toFixed(2)} on ${cache.market} (${cache.kind})`;

      await prisma.$transaction([
        prisma.notification.create({
          data: {
            userId: entry.userId,
            type: "price_alert",
            title: notifTitle,
            body: notifBody,
            data: {
              variantId: entry.variantId,
              market: entry.market,
              currentPrice: cache.amount,
              threshold: entry.thresholdAmount,
              direction: entry.direction,
            },
          },
        }),
        prisma.watchlistEntry.update({
          where: { id: entry.id },
          data: { enabled: false },
        }),
      ]);

      // Collect Expo push tokens for this user
      const tokens = await prisma.pushToken.findMany({
        where: { userId: entry.userId },
        select: { token: true },
      });
      for (const { token } of tokens) {
        if (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[")) {
          pushMessages.push({
            to: token,
            title: notifTitle,
            body: notifBody,
            sound: "default",
            data: { variantId: entry.variantId, screen: "card" },
          });
        }
      }
    }

    await sendExpoPushNotifications(pushMessages);
  } catch (err) {
    console.error("[watchlist-check] Error:", err);
  }
}

// Check watchlist every hour
if (process.env.ENABLE_WATCHLIST_CHECK !== "false") {
  setInterval(async () => {
    const ran = await withAdvisoryLock("watchlistCheck", async () => {
      await checkWatchlistAlerts();
    }).catch((err) => {
      console.error("[watchlist-check] Lock/job error:", err);
      return false;
    });
    if (!ran) {
      console.log("[watchlist-check] Another instance is handling this cycle.");
    }
  }, 60 * 60 * 1000);
}

// ── Push tokens ──

app.post("/v1/push-token", { preHandler: [requireAuth] }, async (req) => {
  const user = (req as FastifyRequest & { user: AuthUser }).user;
  const { token, platform } = z
    .object({
      token: z.string().min(1),
      platform: z.enum(["ios", "android", "web"]),
    })
    .parse(req.body);

  await prisma.pushToken.upsert({
    where: { token },
    update: { userId: user.sub, updatedAt: new Date() },
    create: { userId: user.sub, token, platform },
  });
  return { ok: true };
});

app.delete("/v1/push-token", { preHandler: [requireAuth] }, async (req) => {
  const { token } = z.object({ token: z.string() }).parse(req.body);
  await prisma.pushToken.deleteMany({ where: { token } });
  return { ok: true };
});

// ── In-app notifications ──

app.get("/v1/notifications", { preHandler: [requireAuth] }, async (req) => {
  const user = (req as FastifyRequest & { user: AuthUser }).user;
  const notes = await prisma.notification.findMany({
    where: { userId: user.sub },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return { notifications: notes };
});

app.patch("/v1/notifications/read-all", { preHandler: [requireAuth] }, async (req) => {
  const user = (req as FastifyRequest & { user: AuthUser }).user;
  await prisma.notification.updateMany({
    where: { userId: user.sub, read: false },
    data: { read: true },
  });
  return { ok: true };
});

// ── Profile (Phase 4) ──
app.get("/v1/profile", { preHandler: [requireAuth] }, async (req, reply) => {
  const user = (req as FastifyRequest & { user: AuthUser }).user;
  const profile = await prisma.user.findUnique({ where: { id: user.sub } });
  if (!profile) {
    reply.code(404).send({ error: "Not found" });
    return;
  }
  return {
    id: profile.id,
    displayName: profile.displayName,
    dateOfBirth: profile.dateOfBirth?.toISOString() ?? null,
    minorSafe: profile.minorSafe,
    avatarUrl: profile.avatarUrl,
    createdAt: profile.createdAt.toISOString(),
  };
});

app.put("/v1/profile", { preHandler: [requireAuth] }, async (req) => {
  const user = (req as FastifyRequest & { user: AuthUser }).user;
  const body = z
    .object({
      displayName: z.string().max(50).nullable().optional(),
      dateOfBirth: z.string().nullable().optional(),
      minorSafe: z.boolean().optional(),
      avatarUrl: z.string().url().nullable().optional(),
    })
    .parse(req.body);

  const data: Record<string, unknown> = {};
  if (body.displayName !== undefined) data.displayName = body.displayName;
  if (body.dateOfBirth !== undefined)
    data.dateOfBirth = body.dateOfBirth ? new Date(body.dateOfBirth) : null;
  if (body.minorSafe !== undefined) data.minorSafe = body.minorSafe;
  if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl;

  // Auto-detect minor status from DOB
  if (body.dateOfBirth) {
    const dob = new Date(body.dateOfBirth);
    const age = Math.floor(
      (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    );
    if (age < 18) data.minorSafe = true;
  }

  const profile = await prisma.user.update({
    where: { id: user.sub },
    data: data as Parameters<typeof prisma.user.update>[0]["data"],
  });
  return {
    ok: true,
    id: profile.id,
    displayName: profile.displayName,
    dateOfBirth: profile.dateOfBirth?.toISOString() ?? null,
    minorSafe: profile.minorSafe,
    avatarUrl: profile.avatarUrl,
  };
});

// ── Geocoding (Phase 4) — free via Nominatim ──
app.get("/v1/geocode", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => {
  const query = z
    .object({
      q: z.string().min(1),
      limit: z.coerce.number().int().min(1).max(10).default(5),
    })
    .parse(req.query);

  try {
    const params = new URLSearchParams({
      q: query.q,
      format: "json",
      limit: String(query.limit),
      addressdetails: "1",
    });
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: {
          "User-Agent": "CardEngine/1.0 (contact@cardengine.app)",
        },
      }
    );
    if (!res.ok) return { results: [] };
    const data = await res.json();
    return {
      results: (data as Array<Record<string, unknown>>).map((r) => ({
        displayName: r.display_name,
        lat: parseFloat(r.lat as string),
        lng: parseFloat(r.lon as string),
        type: r.type,
      })),
    };
  } catch {
    return { results: [] };
  }
});

// ── Start server ──
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";
await dbReady;
await app.listen({ port, host });

// ── Auto-ingest on first boot if DB is empty ──
if (process.env.AUTO_INGEST_ON_EMPTY !== "false") {
  const cardCount = await prisma.cardVariant.count();
  if (cardCount === 0) {
    console.log("[startup] No cards found -- attempting initial Scryfall ingest...");
    withAdvisoryLock("priceRefresh", async () => {
      const r = await ingestScryfallBulk();
      console.log(`[startup] Initial ingest complete: ${r.cardsProcessed} cards, ${r.pricesUpdated} prices`);
    }).catch((err) => {
      console.error("[startup] Initial ingest failed:", err);
    });
  }
}
