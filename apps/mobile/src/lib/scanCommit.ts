import { addCollectionEvents } from "./api";
import { enqueueCollectionEvent } from "./offlineQueue";

function eventId(variantId: string): string {
  return `scan-${variantId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Persist a scanned card to collection — offline queue first, then API.
 * Sync loop retries when offline.
 */
export async function commitScanToCollection(
  variantId: string,
  quantity = 1
): Promise<void> {
  const events = Array.from({ length: quantity }, () => {
    const id = eventId(variantId);
    return {
      id,
      at: new Date().toISOString(),
      type: "add" as const,
      variantId,
      payload: { quantity: 1, source: "scanner" },
    };
  });

  for (const evt of events) {
    await enqueueCollectionEvent(evt.id, evt.variantId, 1, "add");
  }

  try {
    await addCollectionEvents(events);
  } catch {
    // Queued locally — background sync will flush
  }
}
