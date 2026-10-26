import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";

// The first migration added after PGlite started tracking which have run.
const PGLITE_TRACKING_STARTED = "20261026000000_add_binders";

let prismaInstance: PrismaClient;

async function createPrismaClient(): Promise<PrismaClient> {
  // Try remote Postgres first
  if (process.env.DATABASE_URL && process.env.USE_PGLITE !== "true") {
    try {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
      const adapter = new PrismaPg(pool);
      const client = new PrismaClient({ adapter });
      // Quick connectivity check
      await client.$queryRawUnsafe("SELECT 1");
      console.log("[db] Connected to remote Postgres");
      return client;
    } catch (e) {
      console.warn("[db] Remote Postgres unreachable, falling back to PGlite:", (e as Error).message?.split("\n")[0]);
    }
  }

  // Fall back to PGlite (embedded Postgres)
  console.log("[db] Starting PGlite (embedded Postgres)...");
  const pglite = new PGlite("./pglite-data");
  await pglite.ready;

  // Apply migrations that haven't run yet. Databases made before migrations
  // were tracked here had everything up to the binders migration.
  const { readFileSync, readdirSync } = await import("fs");
  const { fileURLToPath } = await import("url");
  const { dirname, join } = await import("path");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = join(__dirname, "../prisma/migrations");
  const migrationFolders = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const tracked = await pglite.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_pglite_migrations' LIMIT 1`
  );
  if ((tracked.rows as unknown[]).length === 0) {
    const hasTables = await pglite.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'User' LIMIT 1`
    );
    await pglite.exec(`CREATE TABLE "_pglite_migrations" ("name" TEXT PRIMARY KEY)`);
    if ((hasTables.rows as unknown[]).length > 0) {
      for (const folder of migrationFolders.filter((f) => f < PGLITE_TRACKING_STARTED)) {
        await pglite.query(`INSERT INTO "_pglite_migrations" ("name") VALUES ($1)`, [folder]);
      }
    }
  }
  const applied = new Set(
    ((await pglite.query(`SELECT "name" FROM "_pglite_migrations"`)).rows as Array<{ name: string }>).map((r) => r.name)
  );
  for (const folder of migrationFolders) {
    if (applied.has(folder)) continue;
    await pglite.exec(readFileSync(join(migrationsDir, folder, "migration.sql"), "utf-8"));
    await pglite.query(`INSERT INTO "_pglite_migrations" ("name") VALUES ($1)`, [folder]);
    console.log(`[db] Applied migration: ${folder}`);
  }

  const adapter = new PrismaPGlite(pglite);
  const client = new PrismaClient({ adapter });
  console.log("[db] PGlite ready");
  return client;
}

// Initialize lazily on first access
const prismaPromise = createPrismaClient();

// Export a proxy that awaits initialization transparently
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (prop === "then") return undefined; // Prevent treating proxy as thenable
    if (prismaInstance) return (prismaInstance as unknown as Record<string | symbol, unknown>)[prop];
    // Return an async function that awaits init then forwards the call
    return (...args: unknown[]) =>
      prismaPromise.then((client) => {
        prismaInstance = client;
        const val = (client as unknown as Record<string | symbol, unknown>)[prop];
        return typeof val === "function" ? (val as Function).apply(client, args) : val;
      });
  },
});

// Eagerly resolve so the server doesn't start before DB is ready
export const dbReady = prismaPromise.then((client) => {
  prismaInstance = client;
  return client;
});
