import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, type AuthUser } from "../middleware/auth.js";

export function registerWatchlistRoutes(app: FastifyInstance) {
  // ── Watchlist CRUD ──
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

    const variantIds = [...new Set(entries.map((e) => e.variantId))];
    const prices =
      variantIds.length > 0
        ? await prisma.priceCache.findMany({ where: { variantId: { in: variantIds } } })
        : [];
    const priceIndex = new Map(
      prices.map((p) => [`${p.variantId}:${p.market}:${p.kind}:${p.currency}`, p.amount])
    );

    const variants =
      variantIds.length > 0
        ? await prisma.cardVariant.findMany({
            where: { variantId: { in: variantIds } },
            select: { variantId: true, name: true, imageUri: true },
          })
        : [];
    const variantMap = new Map(variants.map((v) => [v.variantId, v]));

    return {
      entries: entries.map((e) => ({
        ...e,
        currentPrice:
          priceIndex.get(`${e.variantId}:${e.market}:${e.kind}:${e.currency}`) ?? null,
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
}
