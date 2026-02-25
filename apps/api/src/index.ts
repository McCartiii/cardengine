import "dotenv/config";
import Fastify from "fastify";
import type { FastifyError } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { prisma, dbReady } from "./db.js";
import { ingestScryfallBulk } from "./jobs/scryfallIngest.js";
import { withAdvisoryLock } from "./jobs/leaderLock.js";
import { checkWatchlistAlerts } from "./jobs/watchlistCheck.js";
import { registerCardRoutes } from "./routes/cards.js";
import { registerCollectionRoutes } from "./routes/collection.js";
import { registerDeckAdvisorRoutes } from "./routes/deckAdvisor.js";
import { registerWatchlistRoutes } from "./routes/watchlist.js";
import { registerProfileRoutes } from "./routes/profile.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerLocalSceneRoutes } from "./routes/localScene.js";
import { registerTelemetryRoutes } from "./routes/telemetry.js";
import { registerDeckRoutes } from "./routes/decks.js";

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

// ── Global error handler ──
// Intercepts ZodError thrown from .parse() in route handlers and returns a
// clean 400 rather than leaking raw Zod internals as a 500.
app.setErrorHandler((err: FastifyError | ZodError, _req, reply) => {
  if (err instanceof ZodError) {
    reply.code(400).send({
      error: "Validation error",
      issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }
  const e = err as FastifyError;
  reply.code(e.statusCode ?? 500).send({ error: e.message });
});

// ── Health ──
app.get(
  "/health",
  { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
  async () => {
    let dbStatus = "ok";
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = "error";
    }
    return {
      ok: dbStatus === "ok",
      db: dbStatus,
      version: process.env.npm_package_version ?? "1.0.0",
    };
  }
);

// ── Route modules ──
registerCardRoutes(app);
registerCollectionRoutes(app);
registerDeckAdvisorRoutes(app);
registerWatchlistRoutes(app);
registerProfileRoutes(app);
registerAdminRoutes(app);
registerLocalSceneRoutes(app);
registerTelemetryRoutes(app);
registerDeckRoutes(app);

// ── Daily pricing refresh job ──
const DAILY_MS = 24 * 60 * 60 * 1000;

async function runDailyPriceRefresh() {
  const ran = await withAdvisoryLock("priceRefresh", async () => {
    console.log("[price-refresh] Starting daily price refresh...");
    await ingestScryfallBulk();
    console.log("[price-refresh] Daily price refresh complete.");
  }).catch((err) => {
    console.error("[price-refresh] Error:", err);
    return false;
  });
  if (!ran) console.log("[price-refresh] Another instance is handling this cycle.");
}

if (process.env.ENABLE_PRICE_REFRESH !== "false") {
  setInterval(runDailyPriceRefresh, DAILY_MS);
  console.log("[price-refresh] Scheduled daily price refresh (with leader lock).");
}

// ── Watchlist check job (hourly) ──
if (process.env.ENABLE_WATCHLIST_CHECK !== "false") {
  setInterval(async () => {
    const ran = await withAdvisoryLock("watchlistCheck", async () => {
      await checkWatchlistAlerts();
    }).catch((err) => {
      console.error("[watchlist-check] Lock/job error:", err);
      return false;
    });
    if (!ran) console.log("[watchlist-check] Another instance is handling this cycle.");
  }, 60 * 60 * 1000);
}

// ── Start server ──
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";
await dbReady;
await app.listen({ port, host });

process.on("unhandledRejection", (reason) => {
  app.log.error({ reason }, "Unhandled promise rejection");
});

// ── Auto-ingest on first boot if DB is empty ──
if (process.env.AUTO_INGEST_ON_EMPTY !== "false") {
  const cardCount = await prisma.cardVariant.count();
  if (cardCount === 0) {
    console.log("[startup] No cards found -- attempting initial Scryfall ingest...");
    withAdvisoryLock("priceRefresh", async () => {
      const r = await ingestScryfallBulk();
      console.log(
        `[startup] Initial ingest complete: ${r.cardsProcessed} cards, ${r.pricesUpdated} prices`
      );
    }).catch((err) => {
      console.error("[startup] Initial ingest failed:", err);
    });
  }
}
