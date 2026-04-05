/**
 * Offline-first collection event queue backed by expo-sqlite.
 *
 * Requires: npx expo install expo-sqlite
 *
 * How it works:
 *   1. Every addCollectionEvents() call writes to the local SQLite queue first.
 *   2. A background sync loop flushes pending events to the API when online.
 *   3. Successfully synced events are marked as `synced` (kept for local reads).
 *   4. getLocalCollection() reconstructs the owned-card map from local events,
 *      so the collection tab is always readable even with no network.
 *
 * The queue survives app restarts — events are only cleared after the server
 * confirms receipt (ok: true).
 */

let SQLite: typeof import("expo-sqlite") | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SQLite = require("expo-sqlite");
} catch {
  // expo-sqlite not installed — offline mode disabled, falls back to online-only
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PendingEvent {
  id: string;
  at: string;
  type: "add" | "remove";
  variantId: string;
  quantity: number;
  synced: 0 | 1;
  createdAt: number; // unix ms
}

// ── Database init ─────────────────────────────────────────────────────────────

type DB = Awaited<ReturnType<NonNullable<typeof SQLite>["openDatabaseAsync"]>>;
let db: DB | null = null;

export async function initOfflineDB(): Promise<void> {
  if (!SQLite) return;
  db = await SQLite.openDatabaseAsync("cardengine.db");
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS collection_events (
      id         TEXT PRIMARY KEY,
      at         TEXT NOT NULL,
      type       TEXT NOT NULL,
      variantId  TEXT NOT NULL,
      quantity   INTEGER NOT NULL DEFAULT 1,
      synced     INTEGER NOT NULL DEFAULT 0,
      createdAt  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_synced ON collection_events (synced);
    CREATE INDEX IF NOT EXISTS idx_events_variantId ON collection_events (variantId);
  `);
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function enqueueCollectionEvent(
  id: string,
  variantId: string,
  quantity: number,
  type: "add" | "remove" = "add"
): Promise<void> {
  if (!db) return;
  const at = new Date().toISOString();
  await db.runAsync(
    `INSERT OR IGNORE INTO collection_events (id, at, type, variantId, quantity, synced, createdAt)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [id, at, type, variantId, quantity, Date.now()]
  );
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getPendingEvents(): Promise<PendingEvent[]> {
  if (!db) return [];
  return db.getAllAsync<PendingEvent>(
    `SELECT * FROM collection_events WHERE synced = 0 ORDER BY createdAt ASC`
  );
}

export async function getLocalCollection(): Promise<Map<string, number>> {
  if (!db) return new Map();
  const rows = await db.getAllAsync<{ variantId: string; type: string; quantity: number }>(
    `SELECT variantId, type, quantity FROM collection_events`
  );
  const qtys = new Map<string, number>();
  for (const row of rows) {
    const delta = row.type === "add" ? row.quantity : -row.quantity;
    qtys.set(row.variantId, (qtys.get(row.variantId) ?? 0) + delta);
  }
  // Filter to positive quantities only
  for (const [k, v] of qtys) { if (v <= 0) qtys.delete(k); }
  return qtys;
}

export async function markEventsSynced(ids: string[]): Promise<void> {
  if (!db || ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  await db.runAsync(
    `UPDATE collection_events SET synced = 1 WHERE id IN (${placeholders})`,
    ids
  );
}

// ── Sync loop ─────────────────────────────────────────────────────────────────

let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncing = false;

/**
 * Flush all pending events to the remote API.
 * onSync callback receives { synced, failed } counts.
 */
export async function flushPendingEvents(
  remoteSend: (events: Array<{ id: string; at: string; type: string; variantId: string; payload: { quantity: number } }>) => Promise<{ ok: boolean; inserted: number }>
): Promise<{ synced: number; failed: number }> {
  if (syncing || !db) return { synced: 0, failed: 0 };
  syncing = true;
  let synced = 0;
  let failed = 0;
  try {
    const pending = await getPendingEvents();
    if (pending.length === 0) return { synced: 0, failed: 0 };

    // Send in batches of 50
    const BATCH = 50;
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      try {
        const res = await remoteSend(
          batch.map((e) => ({
            id: e.id,
            at: e.at,
            type: e.type,
            variantId: e.variantId,
            payload: { quantity: e.quantity },
          }))
        );
        if (res.ok) {
          await markEventsSynced(batch.map((e) => e.id));
          synced += batch.length;
        } else {
          failed += batch.length;
        }
      } catch {
        failed += batch.length;
      }
    }
  } finally {
    syncing = false;
  }
  return { synced, failed };
}

/**
 * Start a background interval that flushes events every N milliseconds.
 * Returns a cleanup function.
 */
export function startSyncLoop(
  remoteSend: Parameters<typeof flushPendingEvents>[0],
  intervalMs = 30_000
): () => void {
  if (syncTimer) clearInterval(syncTimer);
  // Flush immediately on start
  flushPendingEvents(remoteSend).catch(() => null);
  syncTimer = setInterval(() => {
    flushPendingEvents(remoteSend).catch(() => null);
  }, intervalMs);
  return () => {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = null;
  };
}
