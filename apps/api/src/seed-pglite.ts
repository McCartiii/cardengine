/**
 * Seeds the local PGlite database by:
 * 1. Pushing the Prisma schema (creating tables)
 * 2. Loading card data from the Supabase REST API
 */
import "dotenv/config";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "./generated/prisma/client.js";
import { execSync } from "child_process";
import { existsSync } from "fs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function supabaseGet(table: string, params = ""): Promise<unknown[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: "count=exact",
    },
  });
  if (!res.ok) throw new Error(`Supabase ${table}: ${res.status} ${await res.text()}`);
  const total = res.headers.get("content-range")?.split("/")[1];
  const data = await res.json();
  console.log(`  ${table}: fetched ${data.length} rows${total ? ` (of ${total})` : ""}`);
  return data;
}

async function main() {
  console.log("[seed] Starting PGlite seed...");

  // Step 1: Push schema via prisma db push (using PGlite as a temp PG server)
  // We'll create tables manually using SQL derived from the schema
  const pglite = new PGlite("./pglite-data");
  await pglite.ready;

  console.log("[seed] Creating tables...");

  // PGlite needs one statement at a time
  const exec = (sql: string) => pglite.query(sql);

  // Create all tables from Prisma schema
  const tables = [
    `CREATE TABLE IF NOT EXISTS "User" ("id" TEXT PRIMARY KEY, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "minorSafe" BOOLEAN NOT NULL DEFAULT true, "date_of_birth" TIMESTAMP(3), "display_name" TEXT, "avatar_url" TEXT)`,
    `CREATE TABLE IF NOT EXISTS "CardVariant" ("variantId" TEXT PRIMARY KEY, "game" TEXT NOT NULL, "cardId" TEXT NOT NULL, "printingId" TEXT NOT NULL, "name" TEXT NOT NULL, "setId" TEXT, "collectorNumber" TEXT, "oracle_text" TEXT, "type_line" TEXT, "colors" JSONB, "color_identity" JSONB, "cmc" DOUBLE PRECISION, "mana_cost" TEXT, "rarity" TEXT, "image_uri" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS "CollectionEvent" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL, "type" TEXT NOT NULL, "variantId" TEXT NOT NULL, "payload" JSONB NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS "PricePoint" ("id" TEXT PRIMARY KEY, "at" TIMESTAMP(3) NOT NULL, "market" TEXT NOT NULL, "kind" TEXT NOT NULL, "currency" TEXT NOT NULL, "amount" DOUBLE PRECISION NOT NULL, "variantId" TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS "PriceCache" ("id" TEXT PRIMARY KEY, "market" TEXT NOT NULL, "kind" TEXT NOT NULL, "currency" TEXT NOT NULL, "amount" DOUBLE PRECISION NOT NULL, "variantId" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS "WatchlistEntry" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "variantId" TEXT NOT NULL, "market" TEXT NOT NULL, "kind" TEXT NOT NULL, "currency" TEXT NOT NULL, "thresholdAmount" DOUBLE PRECISION NOT NULL, "direction" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS "Notification" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "type" TEXT NOT NULL, "title" TEXT NOT NULL, "body" TEXT NOT NULL, "data" JSONB, "read" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS "Shop" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "address" TEXT, "city" TEXT, "state" TEXT, "zip" TEXT, "country" TEXT NOT NULL DEFAULT 'US', "lat" DOUBLE PRECISION, "lng" DOUBLE PRECISION, "phone" TEXT, "website" TEXT, "hours" TEXT, "category" TEXT NOT NULL DEFAULT 'card_shop', "verified" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS "Checkin" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "shopId" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS "UserBlock" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "blockedId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS "Report" ("id" TEXT PRIMARY KEY, "reporterId" TEXT NOT NULL, "targetType" TEXT NOT NULL, "targetId" TEXT NOT NULL, "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolved" BOOLEAN NOT NULL DEFAULT false)`,
    `CREATE TABLE IF NOT EXISTS "ScannerMismatch" ("id" TEXT PRIMARY KEY, "userId" TEXT, "ocrNameRaw" TEXT NOT NULL, "ocrCnRaw" TEXT, "ocrSetRaw" TEXT, "ocrConfidence" INTEGER NOT NULL, "candidateId" TEXT, "confirmedId" TEXT, "wasAutoConfirmed" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS "RulesDisagreement" ("id" TEXT PRIMARY KEY, "userId" TEXT, "formatId" TEXT NOT NULL, "game" TEXT NOT NULL DEFAULT 'mtg', "deckHash" TEXT, "violationCode" TEXT NOT NULL, "userDisputed" BOOLEAN NOT NULL DEFAULT false, "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX IF NOT EXISTS "CardVariant_game_name_idx" ON "CardVariant"("game", "name")`,
    `CREATE INDEX IF NOT EXISTS "CardVariant_game_setId_collectorNumber_idx" ON "CardVariant"("game", "setId", "collectorNumber")`,
    `CREATE INDEX IF NOT EXISTS "CollectionEvent_userId_at_idx" ON "CollectionEvent"("userId", "at")`,
    `CREATE INDEX IF NOT EXISTS "CollectionEvent_variantId_at_idx" ON "CollectionEvent"("variantId", "at")`,
    `CREATE INDEX IF NOT EXISTS "PricePoint_market_variantId_at_idx" ON "PricePoint"("market", "variantId", "at")`,
    `CREATE INDEX IF NOT EXISTS "PriceCache_variantId_idx" ON "PriceCache"("variantId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PriceCache_market_variantId_kind_currency_key" ON "PriceCache"("market", "variantId", "kind", "currency")`,
  ];
  for (const sql of tables) await exec(sql);

  console.log("[seed] Tables created");

  // Step 2: Load data from Supabase REST API
  console.log("[seed] Fetching data from Supabase REST API...");

  // Fetch cards in batches (Supabase REST max 1000 per request)
  let offset = 0;
  const batchSize = 1000;
  let totalCards = 0;

  while (true) {
    const cards = (await supabaseGet(
      "CardVariant",
      `select=*&order=variantId&offset=${offset}&limit=${batchSize}`
    )) as Record<string, unknown>[];

    if (cards.length === 0) break;

    for (const c of cards) {
      await pglite.query(
        `INSERT INTO "CardVariant" ("variantId", "game", "cardId", "printingId", "name", "setId", "collectorNumber", "oracle_text", "type_line", "colors", "color_identity", "cmc", "mana_cost", "rarity", "image_uri", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT ("variantId") DO NOTHING`,
        [
          c.variantId, c.game, c.cardId, c.printingId, c.name, c.setId,
          c.collectorNumber, c.oracle_text, c.type_line,
          c.colors ? JSON.stringify(c.colors) : null,
          c.color_identity ? JSON.stringify(c.color_identity) : null,
          c.cmc, c.mana_cost, c.rarity, c.image_uri,
          c.updatedAt || new Date().toISOString(),
        ]
      );
    }

    totalCards += cards.length;
    process.stdout.write(`\r  CardVariant: ${totalCards} rows loaded...`);

    if (cards.length < batchSize) break;
    offset += batchSize;
  }
  console.log(`\n[seed] Loaded ${totalCards} cards`);

  // Fetch price caches
  const prices = (await supabaseGet("PriceCache", "select=*&limit=5000")) as Record<string, unknown>[];
  for (const p of prices) {
    await pglite.query(
      `INSERT INTO "PriceCache" ("id", "market", "kind", "currency", "amount", "variantId", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT DO NOTHING`,
      [p.id, p.market, p.kind, p.currency, p.amount, p.variantId, p.updatedAt || new Date().toISOString()]
    );
  }

  // Verify
  const count = await pglite.query('SELECT count(*) FROM "CardVariant"');
  const priceCount = await pglite.query('SELECT count(*) FROM "PriceCache"');
  console.log(`[seed] Done! Cards: ${count.rows[0].count}, Prices: ${priceCount.rows[0].count}`);

  await pglite.close();
}

main().catch((e) => {
  console.error("[seed] Error:", e);
  process.exit(1);
});
