import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, type AuthUser } from "../middleware/auth.js";

export function registerProfileRoutes(app: FastifyInstance) {
  // ── Profile ──
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
      const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
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

  // ── Geocoding — free via Nominatim ──
  app.get(
    "/v1/geocode",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req) => {
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
        const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
          headers: { "User-Agent": "CardEngine/1.0 (contact@cardengine.app)" },
        });
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
    }
  );
}
