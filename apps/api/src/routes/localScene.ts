import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export function registerLocalSceneRoutes(app: FastifyInstance) {
  // List shops — optionally filter by city or proximity (lat/lng/radius)
  app.get("/v1/shops", async (req) => {
    const query = z
      .object({
        city: z.string().optional(),
        lat: z.coerce.number().optional(),
        lng: z.coerce.number().optional(),
        radius: z.coerce.number().default(30),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);

    const where: Record<string, unknown> = {};
    if (query.city) where.city = { contains: query.city, mode: "insensitive" };

    const shops = await prisma.shop.findMany({
      where,
      take: query.limit,
      orderBy: { name: "asc" },
    });

    let results = shops.map((s) => ({
      ...s,
      distance:
        query.lat != null && query.lng != null && s.lat != null && s.lng != null
          ? haversineMi(query.lat, query.lng, s.lat, s.lng)
          : null,
    }));

    if (query.lat != null && query.lng != null) {
      results = results
        .filter((s) => s.distance !== null && s.distance <= query.radius)
        .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    }

    return { shops: results };
  });

  // Get single shop
  app.get("/v1/shops/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const shop = await prisma.shop.findUnique({ where: { id } });
    if (!shop) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    return { shop };
  });

  // Submit a shop (admin-verified later)
  app.post("/v1/shops", { preHandler: [requireAuth] }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zip: z.string().optional(),
        country: z.string().default("US"),
        lat: z.number().optional(),
        lng: z.number().optional(),
        phone: z.string().optional(),
        website: z.string().url().optional(),
        hours: z.string().optional(),
        category: z.string().default("card_shop"),
      })
      .parse(req.body);
    const shop = await prisma.shop.create({ data: body });
    return { ok: true, shop };
  });
}

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
