import { downloadHashBundle } from "../lib/sync";
import { getDb, loadHashIndex } from "../lib/localDb";
import { MobileHashIndex, type MobileHashLookupResult } from "./HashIndex";

const globalIndex = new MobileHashIndex();
let loadPromise: Promise<void> | null = null;
let ready = false;

export function isHashIndexReady(): boolean {
  return ready && globalIndex.size > 0;
}

export function getHashIndex(): MobileHashIndex {
  return globalIndex;
}

export function lookupHash(dHash: string, pHash?: string): MobileHashLookupResult | null {
  if (!ready) return null;
  return globalIndex.lookup(dHash, pHash ?? dHash);
}

/** Load hash index from SQLite; download bundle first if empty. */
export async function ensureHashIndexReady(): Promise<boolean> {
  if (ready && globalIndex.size > 0) return true;
  if (loadPromise) {
    await loadPromise;
    return globalIndex.size > 0;
  }

  loadPromise = (async () => {
    const database = await getDb();
    let rows = await loadHashIndex(database);
    if (rows.length === 0) {
      try {
        await downloadHashBundle();
        rows = await loadHashIndex(database);
      } catch (err) {
        console.warn("[hashIndex] Download failed:", err);
      }
    }
    globalIndex.load(rows);
    ready = rows.length > 0;
    console.log(`[hashIndex] Loaded ${globalIndex.size} hashes`);
  })();

  try {
    await loadPromise;
  } finally {
    loadPromise = null;
  }

  return globalIndex.size > 0;
}
