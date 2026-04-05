import { TtlCache } from "./ttlCache.js";
import type { ScryfallLiveData } from "../types/scryfall.js";

// Cache Scryfall card API responses for 4 hours.
// Scryfall prices update ~once daily from TCGplayer, so 4h is fresh enough.
// 5000 entries * ~4KB each = ~20MB memory.
export const scryfallCache = new TtlCache<ScryfallLiveData>({
  ttlMs: 4 * 60 * 60 * 1000, // 4 hours
  maxSize: 5_000,
});
