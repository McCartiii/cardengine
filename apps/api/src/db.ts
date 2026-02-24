import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";

let prismaInstance: PrismaClient;

async function createPrismaClient(): Promise<PrismaClient> {
  // Try remote Supabase Postgres first
  if (process.env.DATABASE_URL && process.env.USE_PGLITE !== "true") {
    try {
      const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
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

  // Apply schema migrations if tables don't exist yet
  const tableCheck = await pglite.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'User' LIMIT 1`
  );
  if ((tableCheck.rows as unknown[]).length === 0) {
    const { readFileSync, readdirSync } = await import("fs");
    const { fileURLToPath } = await import("url");
    const { dirname, join } = await import("path");
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const migrationsDir = join(__dirname, "../prisma/migrations");
    const migrationFolders = readdirSync(migrationsDir)
      .filter((f) => !f.startsWith("."))
      .sort();
    for (const folder of migrationFolders) {
      const sqlPath = join(migrationsDir, folder, "migration.sql");
      const sql = readFileSync(sqlPath, "utf-8");
      await pglite.exec(sql);
      console.log(`[db] Applied migration: ${folder}`);
    }
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
    if (prismaInstance) return (prismaInstance as Record<string | symbol, unknown>)[prop];
    // Return an async function that awaits init then forwards the call
    return (...args: unknown[]) =>
      prismaPromise.then((client) => {
        prismaInstance = client;
        const val = (client as Record<string | symbol, unknown>)[prop];
        return typeof val === "function" ? (val as Function).apply(client, args) : val;
      });
  },
});

// Eagerly resolve so the server doesn't start before DB is ready
export const dbReady = prismaPromise.then((client) => {
  prismaInstance = client;
  return client;
});
