// Keeps the scan index on the phone: loaded from the local database at once,
// refreshed from the server when the catalog changes, and built into a
// CardMatcher held in memory for the life of the app.
import { API_BASE_URL } from "./constants";
import { CardMatcher, type ScanIndexData } from "./cardMatcher";

let matcher: CardMatcher | null = null;
let loading: Promise<CardMatcher | null> | null = null;

// Loaded lazily: where SQLite isn't available (e.g. web) the index lives in memory only.
async function ensureTable() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getDb } = require("./localDb") as typeof import("./localDb");
  const db = await getDb();
  await db.execAsync("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  return db;
}

async function readCached(): Promise<ScanIndexData | null> {
  try {
    const db = await ensureTable();
    const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key = 'scan_index'");
    return row ? (JSON.parse(row.value) as ScanIndexData) : null;
  } catch {
    return null;
  }
}

async function writeCached(json: string) {
  try {
    const db = await ensureTable();
    await db.runAsync("INSERT OR REPLACE INTO kv (key, value) VALUES ('scan_index', ?)", [json]);
  } catch {
    // Caching is best effort; the index still works for this session.
  }
}

/** Fetches a newer index than `have`, or null when ours is current or the network is down. */
async function fetchNewer(have: string | null): Promise<{ data: ScanIndexData; json: string } | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/scan/index${have ? `?have=${encodeURIComponent(have)}` : ""}`);
    if (!res.ok) return null;
    const json = await res.text();
    const data = JSON.parse(json) as ScanIndexData & { upToDate?: boolean };
    if (data.upToDate || !Array.isArray(data.names) || data.names.length === 0) return null;
    return { data, json };
  } catch {
    return null;
  }
}

/** The matcher if it's ready, without waiting. */
export function getCardMatcher(): CardMatcher | null {
  return matcher;
}

/**
 * Loads the matcher (cached copy first, then a fresh one if the server has
 * a newer catalog). Safe to call repeatedly; resolves null if no index is
 * available yet, in which case scanning falls back to the server.
 */
export function loadCardMatcher(): Promise<CardMatcher | null> {
  if (loading) return loading;
  loading = (async () => {
    const cached = await readCached();
    if (cached) matcher = new CardMatcher(cached);
    const fresh = await fetchNewer(cached?.version ?? null);
    if (fresh) {
      matcher = new CardMatcher(fresh.data);
      void writeCached(fresh.json);
    }
    return matcher;
  })().finally(() => {
    // Allow a later retry (e.g. once back online) if nothing loaded.
    if (!matcher) loading = null;
  });
  return loading;
}
