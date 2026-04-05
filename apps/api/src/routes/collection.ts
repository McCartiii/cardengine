import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, type AuthUser } from "../middleware/auth.js";

export function registerCollectionRoutes(app: FastifyInstance) {
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
        payload: e.payload as unknown as Parameters<
          typeof prisma.collectionEvent.create
        >[0]["data"]["payload"],
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
    if (query.since) where.at = { gte: new Date(query.since) };

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

    const events = await prisma.collectionEvent.findMany({
      where: { userId: user.sub },
      select: { variantId: true, payload: true, type: true, at: true },
      orderBy: { at: "asc" },
    });

    const qtys = new Map<string, number>();
    const firstAdded = new Map<string, Date>();
    for (const e of events) {
      const payload = e.payload as { qty?: number; quantity?: number };
      const delta =
        e.type === "add"
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

    const variants = await prisma.cardVariant.findMany({
      where: {
        variantId: { in: variantIds },
        ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
      },
    });

    const prices = await prisma.priceCache.findMany({
      where: {
        variantId: { in: variantIds },
        market: query.market,
        kind: query.kind,
        currency: query.currency,
      },
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

    cards.sort((a, b) => {
      switch (query.sort) {
        case "name":
          return a.name.localeCompare(b.name);
        case "qty":
          return b.quantity - a.quantity;
        case "added":
          return (b.addedAt ?? "").localeCompare(a.addedAt ?? "");
        case "value":
        default:
          return (b.lineValue ?? 0) - (a.lineValue ?? 0);
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

    const prices =
      variantIds.length > 0
        ? await prisma.priceCache.findMany({
            where: {
              variantId: { in: variantIds },
              market: query.market,
              kind: query.kind,
              currency: query.currency,
            },
          })
        : [];
    const priceMap = new Map(prices.map((p) => [p.variantId, p.amount]));

    let totalValue = 0;
    const breakdown = owned.map(([variantId, qty]) => {
      const price = priceMap.get(variantId) ?? 0;
      totalValue += price * qty;
      return { variantId, qty, price, lineValue: price * qty };
    });

    breakdown.sort((a, b) => b.lineValue - a.lineValue);

    return {
      totalValue: Math.round(totalValue * 100) / 100,
      currency: query.currency,
      cardCount: owned.length,
      breakdown: breakdown.slice(0, 100),
    };
  });

  // ── Batch price lookup ──
  app.post("/v1/prices/batch", async (req) => {
    const body = z
      .object({
        variantIds: z.array(z.string()).min(1).max(500),
        market: z.string().default("tcgplayer"),
      })
      .parse(req.body);

    const prices = await prisma.priceCache.findMany({
      where: { variantId: { in: body.variantIds }, market: body.market },
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

  // ── Prices by market ──
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

    const cached = await prisma.priceCache.findMany({
      where: { market: params.market, variantId: { in: query.variantIds } },
    });
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

  // ── Price history ──
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
      where: { variantId: params.variantId, market: query.market, at: { gte: since } },
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
}
