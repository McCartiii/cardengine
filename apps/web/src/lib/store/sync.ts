import { createClient } from "../supabase/client";
import {
  db,
  getUnsyncedEvents,
  markEventsSynced,
} from "./cardStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface SyncManager {
  pushEvents(events: unknown[]): Promise<{ pushed: number }>;
  pullEvents(since: string): Promise<{ events: unknown[]; latestAt: string | null }>;
}

export function createWebSyncManager(): SyncManager {
  return {
    async pushEvents() {
      const unsynced = await getUnsyncedEvents();
      if (unsynced.length === 0) return { pushed: 0 };

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
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
              id: e.id,
              at: e.at,
              type: e.type,
              variantId: e.variantId,
              payload: e.payload,
            })),
          }),
        });

        if (res.ok) {
          const data = await res.json();
          await markEventsSynced(unsynced.map((e) => e.id));
          return { pushed: data.inserted ?? unsynced.length };
        }
      } catch {
        // Offline
      }
      return { pushed: 0 };
    },

    async pullEvents(since: string) {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { events: [], latestAt: null };

      try {
        const res = await fetch(
          `${API_URL}/v1/collection/${session.user.id}?since=${encodeURIComponent(since)}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );

        if (res.ok) {
          const data = await res.json();
          const events = data.events ?? [];
          const latestAt = events.length > 0 ? events[events.length - 1].at : null;
          return { events, latestAt };
        }
      } catch {
        // Offline
      }
      return { events: [], latestAt: null };
    },
  };
}

/** Run full sync: push local, pull remote. */
export async function runWebSync() {
  const syncManager = createWebSyncManager();

  // Push
  const pushResult = await syncManager.pushEvents([]);
  if (pushResult.pushed > 0) {
    console.log(`[sync] Pushed ${pushResult.pushed} events`);
  }

  // Pull
  const meta = await db.syncMeta.get("last_sync_at");
  const since = meta?.value ?? "1970-01-01T00:00:00Z";
  const pullResult = await syncManager.pullEvents(since);

  if (pullResult.events.length > 0) {
    console.log(`[sync] Pulled ${pullResult.events.length} events`);
    if (pullResult.latestAt) {
      await db.syncMeta.put({ key: "last_sync_at", value: pullResult.latestAt });
    }
  }
}
