import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { scryfallCache } from "../lib/scryfallCache.js";
import type { ScryfallLiveData, ScryfallLivePrices } from "../types/scryfall.js";

export function registerCardRoutes(app: FastifyInstance) {
  // ── Card detail ──
  app.get(
    "/v1/cards/:variantId",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const params = z.object({ variantId: z.string() }).parse(req.params);
      const query = z
        .object({ historyDays: z.coerce.number().int().min(1).max(365).default(90) })
        .parse(req.query);

      const card = await prisma.cardVariant.findUnique({ where: { variantId: params.variantId } });
      if (!card) {
        reply.code(404).send({ error: "Card not found" });
        return;
      }

      const scryfallId = params.variantId.replace(/^scryfall:/, "").replace(/-foil$/, "");
      const setCode = card.setId?.toLowerCase() ?? "";
      const collNum = card.collectorNumber ?? "";
      const encodedName = encodeURIComponent(card.name);

      // Fetch LIVE prices from Scryfall API for this exact card (cached 4h)
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
          buyUrl:
            scryfallLive?.purchase_uris?.tcgplayer ??
            `https://www.tcgplayer.com/search/magic/product?q=${encodedName}&view=grid`,
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
          buyUrl:
            scryfallLive?.purchase_uris?.cardmarket ??
            `https://www.cardmarket.com/en/Magic/Products?idProduct=0&referrer=scryfall`,
        });
      }

      // Card Kingdom
      storePricing.push({
        store: "Card Kingdom",
        prices: [],
        buyUrl: `https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D=${encodedName}`,
      });

      // eBay
      storePricing.push({
        store: "eBay",
        prices: [],
        buyUrl: `https://www.ebay.com/sch/i.html?_nkw=mtg+${encodedName.replace(/%20/g, "+")}&_sacat=38292`,
      });

      // MTGGoldfish
      storePricing.push({
        store: "MTGGoldfish",
        prices: [],
        buyUrl: `https://www.mtggoldfish.com/price/${setCode}/${card.name.replace(/[^a-zA-Z0-9 ]/g, "").replace(/ /g, "+")}`,
      });

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

      // Record today's live prices as PricePoints (builds real history over time)
      const livePriceEntries: Array<{ market: string; kind: string; currency: string; amount: number }> = [];
      if (scryfallLive?.prices) {
        const priceFields: Array<{
          field: keyof ScryfallLivePrices;
          market: string;
          kind: string;
          currency: string;
        }> = [
          { field: "usd",         market: "tcgplayer",  kind: "market",  currency: "USD" },
          { field: "usd_foil",    market: "tcgplayer",  kind: "foil",    currency: "USD" },
          { field: "usd_etched",  market: "tcgplayer",  kind: "etched",  currency: "USD" },
          { field: "eur",         market: "cardmarket", kind: "market",  currency: "EUR" },
          { field: "eur_foil",    market: "cardmarket", kind: "foil",    currency: "EUR" },
          { field: "eur_etched",  market: "cardmarket", kind: "etched",  currency: "EUR" },
          { field: "tix",         market: "mtgo",       kind: "market",  currency: "TIX" },
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

      const since = new Date(Date.now() - query.historyDays * 86_400_000);
      const priceHistory = await prisma.pricePoint.findMany({
        where: { variantId: params.variantId, at: { gte: since } },
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
          (h) =>
            h.market === lp.market &&
            h.kind === lp.kind &&
            h.currency === lp.currency &&
            Math.abs(new Date(h.at).getTime() - Date.now()) < 86_400_000
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
      combinedHistory.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

      const otherPrintings = await prisma.cardVariant.findMany({
        where: { cardId: card.cardId, variantId: { not: params.variantId } },
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
    }
  );

  // ── Search ──
  app.get(
    "/v1/search",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
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

      const isPriceSort = query.sort === "price-asc" || query.sort === "price-desc";
      const isPopularSort = query.sort === "popular";

      let orderBy: Record<string, string> = { name: "asc" };
      if (query.sort === "name-asc") orderBy = { name: "asc" };
      else if (query.sort === "name-desc") orderBy = { name: "desc" };
      else if (query.sort === "rarity") orderBy = { name: "asc" };

      const fetchLimit =
        isPriceSort || isPopularSort || query.sort === "rarity"
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

      const variantIds = cards.map((c) => c.variantId);
      const prices =
        variantIds.length > 0
          ? await prisma.priceCache.findMany({ where: { variantId: { in: variantIds } } })
          : [];

      const priceMap = new Map<
        string,
        Array<{ market: string; kind: string; currency: string; amount: number }>
      >();
      for (const p of prices) {
        const arr = priceMap.get(p.variantId) ?? [];
        arr.push({ market: p.market, kind: p.kind, currency: p.currency, amount: p.amount });
        priceMap.set(p.variantId, arr);
      }

      let popularityMap = new Map<string, number>();
      if (isPopularSort && variantIds.length > 0) {
        const counts = await prisma.collectionEvent.groupBy({
          by: ["variantId"],
          where: { variantId: { in: variantIds } },
          _count: { id: true },
        });
        for (const c of counts) popularityMap.set(c.variantId, c._count.id);
      }

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

      const rarityRank: Record<string, number> = {
        mythic: 0, rare: 1, uncommon: 2, common: 3, special: 4, bonus: 5,
      };

      let sorted = [...cards];
      if (isPriceSort) {
        sorted.sort((a, b) => {
          const pa = bestUsdPrice(a.variantId);
          const pb = bestUsdPrice(b.variantId);
          return query.sort === "price-asc" ? pa - pb : pb - pa;
        });
      } else if (isPopularSort) {
        sorted.sort((a, b) => {
          const pa = bestUsdPrice(a.variantId);
          const pb = bestUsdPrice(b.variantId);
          const hasPriceA = pa > 0 ? 1 : 0;
          const hasPriceB = pb > 0 ? 1 : 0;
          if (hasPriceB !== hasPriceA) return hasPriceB - hasPriceA;
          const countA = popularityMap.get(a.variantId) ?? 0;
          const countB = popularityMap.get(b.variantId) ?? 0;
          if (countB !== countA) return countB - countA;
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

      const paginated = sorted.slice(query.offset, query.offset + query.limit);

      return {
        query: query.q,
        sort: query.sort,
        total: paginated.length,
        cards: paginated.map((c) => {
          const cardPrices = priceMap.get(c.variantId) ?? [];
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
            priceUsd: usdMarket?.amount ?? null,
            priceEur: eurMarket?.amount ?? null,
            prices: cardPrices.map((p) => ({
              market: p.market,
              kind: p.kind,
              currency: p.currency,
              amount: p.amount,
            })),
          };
        }),
      };
    }
  );

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

    function levenshtein(a: string, b: string): number {
      const la = a.length,
        lb = b.length;
      if (la === 0) return lb;
      if (lb === 0) return la;
      const dp: number[][] = Array.from({ length: la + 1 }, (_, i) =>
        Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
      );
      for (let i = 1; i <= la; i++) {
        for (let j = 1; j <= lb; j++) {
          dp[i][j] =
            a[i - 1] === b[j - 1]
              ? dp[i - 1][j - 1]
              : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
      return dp[la][lb];
    }

    const nameNorm = body.name
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .trim();

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
        const prices = await prisma.priceCache.findMany({ where: { variantId: exact.variantId } });
        return {
          candidates: [
            {
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
            },
          ],
        };
      }
    }

    let candidates = await prisma.cardVariant.findMany({
      where: {
        game: "mtg",
        name: {
          contains:
            nameNorm.length > 3 ? nameNorm.slice(0, Math.min(nameNorm.length, 30)) : nameNorm,
          mode: "insensitive",
        },
      },
      take: 100,
    });

    if (candidates.length === 0) {
      const words = nameNorm.split(/\s+/).filter((w) => w.length >= 3);
      for (const word of words) {
        const partial = await prisma.cardVariant.findMany({
          where: { game: "mtg", name: { contains: word, mode: "insensitive" } },
          take: 50,
        });
        candidates.push(...partial);
      }
      const seen = new Set<string>();
      candidates = candidates.filter((c) => {
        if (seen.has(c.variantId)) return false;
        seen.add(c.variantId);
        return true;
      });
    }

    if (candidates.length === 0 && nameNorm.length >= 4) {
      candidates = await prisma.cardVariant.findMany({
        where: { game: "mtg", name: { startsWith: nameNorm.slice(0, 4), mode: "insensitive" } },
        take: 50,
      });
    }

    const scored = candidates.map((c) => {
      const cName = c.name.toLowerCase().replace(/[^a-z0-9 ]/g, "");
      let score = 0;
      let matchType = "fuzzy";

      if (cName === nameNorm) {
        score = 80;
        matchType = "exact_name";
      } else if (cName.startsWith(nameNorm) || nameNorm.startsWith(cName)) {
        score = 70;
        matchType = "prefix";
      } else {
        const dist = levenshtein(nameNorm, cName);
        const maxLen = Math.max(nameNorm.length, cName.length);
        const similarity = 1 - dist / maxLen;
        score = Math.round(similarity * 60);
        matchType = "fuzzy";
      }

      if (body.setCode && c.setId?.toLowerCase() === body.setCode.toLowerCase()) {
        score += 10;
        if (body.collectorNumber && c.collectorNumber === body.collectorNumber) {
          score += 10;
          matchType = "set_collector";
        }
      }

      if (body.manaCost && c.manaCost) {
        const normMana = (s: string) => s.replace(/[{}]/g, "").toUpperCase();
        if (normMana(c.manaCost) === normMana(body.manaCost)) score += 5;
      }

      if (c.variantId.endsWith("-foil")) score -= 2;

      return { ...c, score, matchType };
    });

    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const seen = new Set<string>();
    const deduped = scored.filter((c) => {
      if (seen.has(c.cardId)) return false;
      seen.add(c.cardId);
      return true;
    });

    const top = deduped.slice(0, body.limit);

    const variantIds = top.map((c) => c.variantId);
    const prices =
      variantIds.length > 0
        ? await prisma.priceCache.findMany({ where: { variantId: { in: variantIds } } })
        : [];
    const priceMap = new Map<
      string,
      Array<{ market: string; kind: string; currency: string; amount: number }>
    >();
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
      .object({ lines: z.array(z.string()) })
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

    const lineRegex = /^(\d+)[x]?\s+(.+?)(?:\s+\((\w+)\)\s*(\S+))?$/i;
    const sectionRegex = /^(?:\/\/\s*)?(?:sideboard|side)\s*$/i;
    const commanderRegex = /^(?:\/\/\s*)?(?:commander|companion)\s*$/i;

    for (const rawLine of body.lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//")) {
        if (sectionRegex.test(line.replace(/^\/\/\s*/, ""))) currentBoard = "side";
        else if (commanderRegex.test(line.replace(/^\/\/\s*/, ""))) currentBoard = "commander";
        continue;
      }
      if (sectionRegex.test(line)) { currentBoard = "side"; continue; }
      if (commanderRegex.test(line)) { currentBoard = "commander"; continue; }

      const match = line.match(lineRegex);
      const quantity = match ? parseInt(match[1], 10) : 1;
      const cardName = match ? match[2].trim() : line.trim();

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

    const uniqueNames = [...new Set(results.map((r) => r.name.toLowerCase()))];
    const candidates = await prisma.cardVariant.findMany({
      where: { game: "mtg", name: { in: uniqueNames, mode: "insensitive" } },
    });

    const nameMap = new Map<string, typeof candidates>();
    for (const c of candidates) {
      const key = c.name.toLowerCase();
      const arr = nameMap.get(key) ?? [];
      arr.push(c);
      nameMap.set(key, arr);
    }

    const allCandidateIds = candidates.map((c) => c.variantId);
    const candidatePrices =
      allCandidateIds.length > 0
        ? await prisma.priceCache.findMany({
            where: {
              variantId: { in: allCandidateIds },
              market: "tcgplayer",
              kind: "market",
            },
          })
        : [];
    const priceMap = new Map<string, number>();
    for (const p of candidatePrices) priceMap.set(p.variantId, p.amount);

    for (const r of results) {
      const cands = nameMap.get(r.name.toLowerCase());
      if (!cands || cands.length === 0) continue;

      let best = cands[0];
      for (const c of cands) {
        if (
          r.line.includes(`(${c.setId?.toUpperCase()})`) &&
          c.collectorNumber &&
          r.line.includes(c.collectorNumber)
        ) {
          best = c;
          break;
        }
      }
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

  // ── Bundles — cursor-paginated with delta sync ──
  app.get("/v1/bundles/:game", async (req) => {
    const params = z.object({ game: z.string() }).parse(req.params);
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(5000).default(2000),
        since: z.string().optional(),
      })
      .parse(req.query);

    const where: Record<string, unknown> = { game: params.game };
    if (query.since) where.updatedAt = { gte: new Date(query.since) };
    if (query.cursor) where.variantId = { gt: query.cursor };

    const cards = await prisma.cardVariant.findMany({
      where,
      orderBy: { variantId: "asc" },
      take: query.limit + 1,
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

  // ── Bundle total count (for progress UI) ──
  app.get("/v1/bundles/:game/count", async (req) => {
    const params = z.object({ game: z.string() }).parse(req.params);
    const count = await prisma.cardVariant.count({ where: { game: params.game } });
    return { game: params.game, count };
  });
}
