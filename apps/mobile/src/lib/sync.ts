import { supabase } from "./supabase";
import {
  getDb,
  insertCardBundle,
  insertHashBundle,
  hashIndexIsPopulated,
  getUnsyncedEvents,
  markEventsSynced,
} from "./localDb";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

interface SyncManager {
  pushEvents(events: unknown[]): Promise<{ pushed: number }>;
  pullEvents(since: string): Promise<{ events: unknown[]; latestAt: string | null }>;
}

/**
 * Download the card bundle from the API using cursor-based pagination.
 * Supports delta sync and reports progress.
 */
export async function downloadCardBundle(
  onProgress?: (downloaded: number, total: number | null) => void
) {
  console.log("[sync] Downloading card bundle...");
  const database = await getDb();

  // Check if we already have cards
  const countResult = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM cards"
  );
  const existingCount = countResult?.count ?? 0;

  // Check sync meta for last download
  const lastDownload = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM sync_meta WHERE key = 'last_bundle_download'"
  );

  // Skip if we downloaded in the last 24 hours and have cards
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  if (
    existingCount > 0 &&
    lastDownload?.value &&
    new Date(lastDownload.value).getTime() > oneDayAgo
  ) {
    console.log(`[sync] Bundle already up to date (${existingCount} cards)`);
    onProgress?.(existingCount, existingCount);
    return;
  }

  // Get total count for progress
  let totalCount: number | null = null;
  try {
    const countRes = await fetch(`${API_URL}/v1/bundles/mtg/count`);
    if (countRes.ok) {
      const countData = await countRes.json();
      totalCount = countData.count;
    }
  } catch {
    // Non-fatal
  }

  const sinceParam = lastDownload?.value
    ? `&since=${encodeURIComponent(lastDownload.value)}`
    : "";
  const startTime = new Date().toISOString();

  console.log(
    lastDownload?.value
      ? `[sync] Delta sync since ${lastDownload.value}...`
      : `[sync] Full bundle download...`
  );

  let cursor: string | null = null;
  let totalDownloaded = 0;

  try {
    let hasMore = true;
    while (hasMore) {
      const cursorParam: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
      const url: string = `${API_URL}/v1/bundles/mtg?limit=2000${sinceParam}${cursorParam}`;

      const res: Response = await fetch(url);
      if (!res.ok) throw new Error(`Bundle page failed: ${res.status}`);
      const data: { items?: Record<string, unknown>[]; hasMore?: boolean; nextCursor?: string } = await res.json();

      if (data.items && data.items.length > 0) {
        await insertCardBundle(database, data.items as Parameters<typeof insertCardBundle>[1]);
        totalDownloaded += data.items.length;
        onProgress?.(totalDownloaded, totalCount);
      }

      if (!data.hasMore || !data.nextCursor) {
        hasMore = false;
      } else {
        cursor = data.nextCursor;
      }
    }

    await database.runAsync(
      "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_bundle_download', ?)",
      [startTime]
    );
    console.log(`[sync] Downloaded ${totalDownloaded} cards`);
  } catch (err) {
    console.warn("[sync] Bundle download failed (offline?):", err);
  }
}

/**
 * Download the hash index from the API using cursor-based pagination.
 * Skips if already populated (hashes don't change often).
 */
export async function downloadHashBundle(
  onProgress?: (downloaded: number) => void
): Promise<void> {
  const database = await getDb();

  const alreadyPopulated = await hashIndexIsPopulated(database);
  if (alreadyPopulated) {
    console.log("[sync] Hash index already populated, skipping download.");
    return;
  }

  console.log("[sync] Downloading hash index...");
  let cursor: string | null = null;
  let totalDownloaded = 0;
  let hasMore = true;

  while (hasMore) {
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const url = `${API_URL}/v1/bundles/mtg/hashes?limit=2000${cursorParam}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Hash bundle fetch failed: ${res.status}`);
    const data = (await res.json()) as {
      items?: Parameters<typeof insertHashBundle>[1];
      hasMore?: boolean;
      nextCursor?: string | null;
    };

    if (data.items && data.items.length > 0) {
      await insertHashBundle(database, data.items);
      totalDownloaded += data.items.length;
      onProgress?.(totalDownloaded);
    }

    if (!data.hasMore || !data.nextCursor) {
      hasMore = false;
    } else {
      cursor = data.nextCursor ?? null;
    }
  }

  console.log(`[sync] Downloaded ${totalDownloaded} hashes.`);
}

/**
 * Mobile SyncManager: pushes local events to API and pulls new ones.
 */
export function createMobileSyncManager(): SyncManager {
  return {
    async pushEvents() {
      const database = await getDb();
      const unsynced = await getUnsyncedEvents(database);
      if (unsynced.length === 0) return { pushed: 0 };

      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return { pushed: 0 };

      try {
        const res = await fetch(`${API_URL}/v1/collection/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            events: unsynced.map((e) => ({
              id: e.id as string,
              at: e.at as string,
              type: e.type as string,
              variantId: e.variantId as string,
              payload: JSON.parse((e.payload as string) || "{}"),
            })),
          }),
        });

        if (res.ok) {
          const data = await res.json();
          await markEventsSynced(
            database,
            unsynced.map((e) => e.id as string)
          );
          return { pushed: data.inserted ?? unsynced.length };
        }
      } catch {
        // Offline - will retry later
      }

      return { pushed: 0 };
    },

    async pullEvents(since: string) {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return { events: [], latestAt: null };

      try {
        const res = await fetch(
          `${API_URL}/v1/collection/${session.user.id}?since=${encodeURIComponent(since)}`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }
        );

        if (res.ok) {
          const data = await res.json();
          const events = data.events ?? [];
          const latestAt =
            events.length > 0 ? events[events.length - 1].at : null;
          return { events, latestAt };
        }
      } catch {
        // Offline
      }

      return { events: [], latestAt: null };
    },
  };
}

/**
 * Run a full sync cycle: push local events, then pull remote events.
 */
export async function runSync() {
  const syncManager = createMobileSyncManager();
  const database = await getDb();

  // Push first
  const pushResult = await syncManager.pushEvents([]);
  if (pushResult.pushed > 0) {
    console.log(`[sync] Pushed ${pushResult.pushed} events`);
  }

  // Then pull
  const lastSync = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM sync_meta WHERE key = 'last_sync_at'"
  );
  const since = lastSync?.value ?? "1970-01-01T00:00:00Z";

  const pullResult = await syncManager.pullEvents(since);
  if (pullResult.events.length > 0) {
    console.log(`[sync] Pulled ${pullResult.events.length} events`);
    if (pullResult.latestAt) {
      await database.runAsync(
        "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_sync_at', ?)",
        [pullResult.latestAt]
      );
    }
  }
}
