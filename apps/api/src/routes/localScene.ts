import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;

function haversineMi(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface PlacesResult {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: { location: { lat: number; lng: number } };
  opening_hours?: { open_now: boolean };
  rating?: number;
  formatted_phone_number?: string;
  website?: string;
}

async function fetchGooglePlaces(query: string, lat?: number, lng?: number): Promise<PlacesResult[]> {
  if (!GOOGLE_PLACES_KEY) return [];

  let url: string;
  if (lat != null && lng != null) {
    url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=50000&keyword=${encodeURIComponent("magic the gathering game store")}&key=${GOOGLE_PLACES_KEY}`;
  } else {
    url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent("magic the gathering game store near " + query)}&key=${GOOGLE_PLACES_KEY}`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json() as { results?: PlacesResult[]; status: string };
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.warn("[places] status:", data.status);
    }
    return data.results ?? [];
  } catch (err) {
    console.error("[places] fetch error:", err);
    return [];
  }
}

async function upsertPlacesResults(places: PlacesResult[]): Promise<void> {
  for (const place of places) {
    const addr = place.formatted_address ?? "";
    const parts = addr.split(",").map((s) => s.trim());
    // Best-effort address parsing: "123 Main St, City, State ZIP, Country"
    const street = parts[0] ?? null;
    const city = parts[1] ?? null;
    const stateZip = parts[2] ?? "";
    const stateParts = stateZip.trim().split(" ");
    const state = stateParts[0] ?? null;
    const zip = stateParts[1] ?? null;

    await prisma.shop.upsert({
      where: { id: place.place_id },
      create: {
        id: place.place_id,
        name: place.name,
        address: street,
        city,
        state,
        zip,
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng,
        phone: null,
        website: null,
        verified: false,
      },
      update: {
        name: place.name,
        address: street,
        city,
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng,
      },
    });
  }
}

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

    let shops = await prisma.shop.findMany({ where, take: query.limit, orderBy: { name: "asc" } });

    // Auto-populate from Google Places if we have few results
    if (shops.length < 3 && GOOGLE_PLACES_KEY) {
      const places = await fetchGooglePlaces(query.city ?? "", query.lat, query.lng);
      if (places.length > 0) {
        await upsertPlacesResults(places);
        // Re-query after upsert
        shops = await prisma.shop.findMany({ where, take: query.limit, orderBy: { name: "asc" } });
      }
    }

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
        lat: z.number().optional(),
        lng: z.number().optional(),
        phone: z.string().optional(),
        website: z.string().url().optional(),
      })
      .parse(req.body);

    const shop = await prisma.shop.create({
      data: {
        ...body,
        verified: false,
      },
    });
    return { shop };
  });

  // Admin: sync a city/area from Google Places
  app.post("/v1/shops/sync", { preHandler: [requireAuth] }, async (req, reply) => {
    const body = z
      .object({
        city: z.string().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
      .parse(req.body);

    if (!GOOGLE_PLACES_KEY) {
      reply.code(503).send({ error: "GOOGLE_PLACES_API_KEY not configured" });
      return;
    }

    const places = await fetchGooglePlaces(body.city ?? "", body.lat, body.lng);
    await upsertPlacesResults(places);
    return { ok: true, synced: places.length };
  });
}
