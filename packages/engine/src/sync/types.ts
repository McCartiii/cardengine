import type { LedgerEvent } from "../collection/ledger.js";

/**
 * SyncManager interface for background sync between local stores and Supabase.
 * Mobile and web each provide platform-specific implementations.
 */
export interface SyncManager {
  /** Push local events to the remote store. */
  pushEvents(events: LedgerEvent[]): Promise<{ pushed: number }>;

  /** Pull new events from the remote store since a given timestamp. */
  pullEvents(since: string): Promise<{ events: LedgerEvent[]; latestAt: string | null }>;
}
