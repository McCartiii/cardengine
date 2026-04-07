import { hammingDistance } from "./dhash.js";

export interface HashRow {
  variantId: string;
  dHash: bigint;
  pHash: bigint;
  foilDHash?: bigint;
  foilPHash?: bigint;
}

export interface HashLookupResult {
  variantId: string;
  distance: number;
  matchType: "dHash" | "pHash" | "foilDHash" | "foilPHash";
}

export interface LookupOptions {
  dHashThreshold?: number;
  pHashThreshold?: number;
}

const DEFAULT_D_THRESHOLD = 8;
const DEFAULT_P_THRESHOLD = 12;

export class HashIndex {
  private rows: HashRow[];

  constructor(rows: HashRow[]) {
    this.rows = rows;
  }

  load(rows: HashRow[]): void {
    this.rows = rows;
  }

  lookup(
    queryDHash: bigint,
    queryPHash: bigint,
    options: LookupOptions = {}
  ): HashLookupResult | null {
    const dThr = options.dHashThreshold ?? DEFAULT_D_THRESHOLD;
    const pThr = options.pHashThreshold ?? DEFAULT_P_THRESHOLD;

    let bestResult: HashLookupResult | null = null;
    let bestDistance = Infinity;

    for (const row of this.rows) {
      const dd = hammingDistance(queryDHash, row.dHash);
      const rowDHashHit = dd <= dThr;
      if (rowDHashHit && dd < bestDistance) {
        bestDistance = dd;
        bestResult = { variantId: row.variantId, distance: dd, matchType: "dHash" };
      }

      let rowFoilDHashHit = false;
      if (row.foilDHash !== undefined) {
        const fdd = hammingDistance(queryDHash, row.foilDHash);
        rowFoilDHashHit = fdd <= dThr;
        if (rowFoilDHashHit && fdd < bestDistance) {
          bestDistance = fdd;
          bestResult = { variantId: row.variantId, distance: fdd, matchType: "foilDHash" };
        }
      }

      // Only use pHash as fallback when this row's dHash (and foilDHash) both missed.
      if (!rowDHashHit && !rowFoilDHashHit) {
        const pd = hammingDistance(queryPHash, row.pHash);
        if (pd <= pThr && pd < bestDistance) {
          bestDistance = pd;
          bestResult = { variantId: row.variantId, distance: pd, matchType: "pHash" };
        }

        if (row.foilPHash !== undefined) {
          const fpd = hammingDistance(queryPHash, row.foilPHash);
          if (fpd <= pThr && fpd < bestDistance) {
            bestDistance = fpd;
            bestResult = { variantId: row.variantId, distance: fpd, matchType: "foilPHash" };
          }
        }
      }
    }

    return bestResult;
  }

  get size(): number {
    return this.rows.length;
  }
}
