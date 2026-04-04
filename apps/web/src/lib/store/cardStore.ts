import Dexie, { type EntityTable } from "dexie";

export interface LocalCard {
  variantId: string;
  cardId: string;
  name: string;
  setId?: string;
  collectorNumber?: string;
  oracleText?: string;
  typeLine?: string;
  colors?: string[];
  colorIdentity?: string[];
  cmc?: number;
  manaCost?: string;
  rarity?: string;
  imageUri?: string;
  game: string;
}

export interface LocalCollectionEvent {
  id: string;
  at: string;
  type: string;
  variantId: string;
  payload: Record<string, unknown>;
  synced: boolean;
}

export interface LocalDeck {
  id: string;
  name: string;
  formatId?: string;
  game: string;
  cards: string; // JSON
  createdAt: string;
  updatedAt: string;
}

export interface SyncMeta {
  key: string;
  value: string;
}

class CardEngineDB extends Dexie {
  cards!: EntityTable<LocalCard, "variantId">;
  collectionEvents!: EntityTable<LocalCollectionEvent, "id">;
  decks!: EntityTable<LocalDeck, "id">;
  syncMeta!: EntityTable<SyncMeta, "key">;

  constructor() {
    super("CardEngineDB");
    this.version(1).stores({
      cards: "variantId, cardId, name, setId, game, rarity, *colors, *colorIdentity, cmc",
      collectionEvents: "id, at, variantId, synced",
      decks: "id, name, formatId, game",
      syncMeta: "key",
    });
  }
}

export const db = new CardEngineDB();

/**
 * Download card bundle from API using cursor-based pagination.
 * Supports delta sync: only downloads cards updated since last download.
 * Reports progress via optional callback.
 */
export async function downloadAndStoreBundle(
  apiUrl: string,
  onProgress?: (downloaded: number, total: number | null) => void
) {
  const lastDownload = await db.syncMeta.get("last_bundle_download");
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const count = await db.cards.count();

  if (
    count > 0 &&
    lastDownload?.value &&
    new Date(lastDownload.value).getTime() > oneDayAgo
  ) {
    console.log(`[store] Bundle up to date (${count} cards)`);
    onProgress?.(count, count);
    return;
  }

  // Get total count for progress
  let totalCount: number | null = null;
  try {
    const countRes = await fetch(`${apiUrl}/v1/bundles/mtg/count`);
    if (countRes.ok) {
      const countData = await countRes.json();
      totalCount = countData.count;
    }
  } catch {
    // Non-fatal
  }

  // Determine if this is a delta sync or full initial
  const sinceParam = lastDownload?.value ? `&since=${encodeURIComponent(lastDownload.value)}` : "";
  const startTime = new Date().toISOString();

  console.log(
    lastDownload?.value
      ? `[store] Delta sync since ${lastDownload.value}...`
      : `[store] Full bundle download...`
  );

  let cursor: string | null = null;
  let totalDownloaded = 0;
  let hasMore = true;

  while (hasMore) {
    const cursorParam: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const url: string = `${apiUrl}/v1/bundles/mtg?limit=2000${sinceParam}${cursorParam}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Bundle page failed: ${res.status}`);
    const data = await res.json();

    if (data.items?.length > 0) {
      await db.cards.bulkPut(
        data.items.map((item: Record<string, unknown>) => ({
          ...item,
          game: (item.game as string) ?? "mtg",
        }))
      );
      totalDownloaded += data.items.length;
      onProgress?.(totalDownloaded, totalCount);
    }

    if (!data.hasMore || !data.nextCursor) {
      hasMore = false;
    } else {
      cursor = data.nextCursor as string;
    }
  }

  await db.syncMeta.put({
    key: "last_bundle_download",
    value: startTime,
  });

  console.log(`[store] Downloaded ${totalDownloaded} cards`);
}

/** Search cards locally via IndexedDB. */
export async function searchCardsLocal(
  query: string,
  limit = 20
): Promise<LocalCard[]> {
  if (!query) return [];
  const q = query.toLowerCase();
  return db.cards
    .filter(
      (card) =>
        card.name.toLowerCase().includes(q) ||
        (card.oracleText?.toLowerCase().includes(q) ?? false) ||
        (card.typeLine?.toLowerCase().includes(q) ?? false)
    )
    .limit(limit)
    .toArray();
}

/** Add a collection event locally. */
export async function addCollectionEvent(event: Omit<LocalCollectionEvent, "synced">) {
  await db.collectionEvents.put({ ...event, synced: false });
}

/** Get unsynced events. */
export async function getUnsyncedEvents(): Promise<LocalCollectionEvent[]> {
  return db.collectionEvents.where("synced").equals(0).toArray();
}

/** Mark events as synced. */
export async function markEventsSynced(ids: string[]) {
  await db.collectionEvents.where("id").anyOf(ids).modify({ synced: true });
}

/** Get all collection events (for materializeHoldings). */
export async function getAllCollectionEvents(): Promise<LocalCollectionEvent[]> {
  return db.collectionEvents.orderBy("at").toArray();
}

/** Get local card count. */
export async function getLocalCardCount(): Promise<number> {
  return db.cards.count();
}
