// The scan index: every printing's name, set and collector number, grouped by
// card name, compact enough for phones to keep and match against offline.

export interface IndexVariant {
  variantId: string;
  cardId: string;
  name: string;
  setId: string | null;
  collectorNumber: string | null;
}

/** [variantId without prefix, set code, collector number] */
export type IndexPrinting = [string, string, string];
/** [card name, cardId, printings] */
export type IndexName = [string, string, IndexPrinting[]];

export interface ScanIndex {
  version: string;
  /** Prepended to each printing's id to get its variantId. */
  prefix: string;
  names: IndexName[];
}

const PREFIX = "scryfall:";

/** Groups non-foil printings by name; foil variants are picked with the finish toggle instead. */
export function buildScanIndex(variants: IndexVariant[], version: string): ScanIndex {
  const byName = new Map<string, IndexName>();
  for (const v of variants) {
    if (v.variantId.endsWith("-foil")) continue;
    const key = `${v.name}\u0000${v.cardId}`;
    let entry = byName.get(key);
    if (!entry) {
      entry = [v.name, v.cardId, []];
      byName.set(key, entry);
    }
    const id = v.variantId.startsWith(PREFIX) ? v.variantId.slice(PREFIX.length) : v.variantId;
    entry[2].push([id, (v.setId ?? "").toLowerCase(), v.collectorNumber ?? ""]);
  }
  return { version, prefix: PREFIX, names: [...byName.values()] };
}
