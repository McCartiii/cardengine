import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAdmin } from "../middleware/admin.js";
import { ingestScryfallBulk } from "../jobs/scryfallIngest.js";

export function registerAdminRoutes(app: FastifyInstance) {
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

  // ── Admin: Scryfall ingest ──
  app.post(
    "/admin/ingest/scryfall",
    {
      preHandler: [requireAdmin],
      config: { rateLimit: { max: 2, timeWindow: "1 minute" } },
    },
    async (req) => {
      const body = z
        .object({ maxCards: z.number().optional() })
        .default({})
        .parse(req.body ?? {});
      const result = await ingestScryfallBulk({ maxCards: body.maxCards });
      return { ok: true, ...result };
    }
  );

  // ── Admin: ban user ──
  app.post("/admin/users/:id/ban", { preHandler: [requireAdmin] }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await prisma.user.update({ where: { id }, data: { banned: true } });
    return { ok: true, userId: id };
  });

  // ── Dev seed (non-production only) ──
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
      update: { name: "Sample Card", game: "mtg", cardId: "card-abc", printingId: "printing-abc" },
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
}
