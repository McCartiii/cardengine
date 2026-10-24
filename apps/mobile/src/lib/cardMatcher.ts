// Matches what the camera read against every known printing, on the phone,
// in about a millisecond. An exact name or a set + collector number hit that
// agrees with the name is trusted on a single frame; a fuzzy name (an OCR
// slip like "Sheo1dred") is only a suggestion until it repeats.

/** [variantId without prefix, set code, collector number] */
export type IndexPrinting = [string, string, string];
/** [card name, cardId, printings] */
export type IndexName = [string, string, IndexPrinting[]];

export interface ScanIndexData {
  version: string;
  prefix: string;
  names: IndexName[];
}

export interface CardMatch {
  name: string;
  cardId: string;
  variantId: string;
  setId: string | null;
  collectorNumber: string | null;
  /** Every printing of the card, for "Wrong card?". */
  printings: Array<{ variantId: string; setId: string | null; collectorNumber: string | null }>;
  /** How the match was made; "fuzzy" should be confirmed by another frame. */
  kind: "printing" | "name" | "fuzzy";
  /** Edit distance between what was read and the card's name. */
  distance: number;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Reused rows for boundedDistance, so lookups don't allocate.
let rowA = new Int32Array(64);
let rowB = new Int32Array(64);

/** Levenshtein distance, giving up (returning max + 1) as soon as it must exceed max. */
export function boundedDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (rowA.length <= b.length) {
    rowA = new Int32Array(b.length + 1);
    rowB = new Int32Array(b.length + 1);
  }
  let prev = rowA;
  let cur = rowB;
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const sub = prev[j - 1] + (ca === b.charCodeAt(j - 1) ? 0 : 1);
      const del = prev[j] + 1;
      const ins = cur[j - 1] + 1;
      const v = sub < del ? (sub < ins ? sub : ins) : del < ins ? del : ins;
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const t = prev;
    prev = cur;
    cur = t;
  }
  return prev[b.length];
}

// Words too common to narrow anything down.
const MAX_BUCKET = 1500;
const wordsOf = (norm: string) => norm.split(" ").filter((w) => w.length >= 4);

/** How many typos to forgive in a name of this length. */
const allowance = (len: number) => (len < 5 ? 0 : len < 9 ? 1 : len < 16 ? 2 : 3);

export class CardMatcher {
  readonly version: string;
  private exact = new Map<string, IndexName[]>();
  private byPrint = new Map<string, { entry: IndexName; printing: IndexPrinting }>();
  private names: Array<{ norm: string; entry: IndexName }> = [];
  // Candidates for fuzzy matching: names sharing a whole word, or the first four letters.
  private byWord = new Map<string, number[]>();
  private byPrefix = new Map<string, number[]>();
  private prefix: string;

  constructor(data: ScanIndexData) {
    this.version = data.version;
    this.prefix = data.prefix;
    for (const entry of data.names) {
      // Double-faced cards are read by their front face's name.
      const faces = new Set([entry[0], entry[0].split(" // ")[0]]);
      for (const face of faces) {
        const norm = normalizeName(face);
        if (!norm) continue;
        const list = this.exact.get(norm);
        if (list) list.push(entry);
        else this.exact.set(norm, [entry]);
        const i = this.names.push({ norm, entry }) - 1;
        for (const key of [...new Set(wordsOf(norm))].map((w) => `w${w}`).concat(`p${norm.slice(0, 4)}`)) {
          const map = key[0] === "w" ? this.byWord : this.byPrefix;
          const list = map.get(key);
          if (list) list.push(i);
          else map.set(key, [i]);
        }
      }
      for (const printing of entry[2]) {
        if (printing[1] && printing[2]) this.byPrint.set(`${printing[1]}|${printing[2]}`, { entry, printing });
      }
    }
  }

  get size() {
    return this.exact.size;
  }

  match(readName: string, print?: { setCode: string | null; collectorNumber: string | null }): CardMatch | null {
    const norm = normalizeName(readName);
    if (norm.length < 3) return null;
    const setCode = print?.setCode?.toLowerCase() ?? null;

    // 1. The small print names one exact printing; trust it if the title agrees.
    if (setCode && print?.collectorNumber) {
      const hit = this.byPrint.get(`${setCode}|${print.collectorNumber}`);
      if (hit) {
        const d = boundedDistance(norm, normalizeName(hit.entry[0].split(" // ")[0]), 3);
        if (d <= 3) return this.result(hit.entry, hit.printing, "printing", d);
      }
    }

    // 2. An exact name. Prefer the printing from the set we read, if any.
    const exact = this.exact.get(norm);
    if (exact) return this.pick(exact, setCode, "name", 0);

    // 3. The closest name within a few typos.
    const max = allowance(norm.length);
    if (max === 0) return null;
    // Search the rarer groups; the smallest one always, even if it's common.
    const groups = wordsOf(norm)
      .map((w) => this.byWord.get(`w${w}`))
      .concat([this.byPrefix.get(`p${norm.slice(0, 4)}`)])
      .filter((g): g is number[] => !!g)
      .sort((a, b) => a.length - b.length);
    const pool = new Set<number>();
    groups.forEach((g, n) => {
      if (n === 0 || g.length <= MAX_BUCKET) for (const i of g) pool.add(i);
    });
    let best: { entry: IndexName; d: number } | null = null;
    for (const i of pool) {
      const cand = this.names[i];
      if (Math.abs(cand.norm.length - norm.length) > max) continue;
      const d = boundedDistance(norm, cand.norm, best ? best.d - 1 : max);
      if (d <= max && (!best || d < best.d)) {
        best = { entry: cand.entry, d };
        if (d === 1) break;
      }
    }
    return best ? this.pick([best.entry], setCode, "fuzzy", best.d) : null;
  }

  private pick(entries: IndexName[], setCode: string | null, kind: CardMatch["kind"], distance: number): CardMatch {
    if (setCode) {
      for (const entry of entries) {
        const printing = entry[2].find((p) => p[1] === setCode);
        if (printing) return this.result(entry, printing, kind, distance);
      }
    }
    return this.result(entries[0], entries[0][2][0], kind, distance);
  }

  private result(entry: IndexName, printing: IndexPrinting, kind: CardMatch["kind"], distance: number): CardMatch {
    const toPrinting = (p: IndexPrinting) => ({ variantId: this.prefix + p[0], setId: p[1] || null, collectorNumber: p[2] || null });
    const chosen = toPrinting(printing);
    return {
      name: entry[0],
      cardId: entry[1],
      ...chosen,
      printings: entry[2].map(toPrinting),
      kind,
      distance,
    };
  }
}

/** Card image for a Scryfall printing, built from its id so the index stays small. */
export function scryfallImage(variantId: string): string | null {
  const id = variantId.replace(/^scryfall:/, "").replace(/-foil$/, "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg`;
}
