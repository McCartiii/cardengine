import { hammingDistanceHex } from "./hashUtils";

export interface MobileHashRow {
  variantId: string;
  dHash: string;
  pHash: string;
  foilDHash: string | null;
  foilPHash: string | null;
}

export interface MobileHashLookupResult {
  variantId: string;
  distance: number;
  matchType: "dHash" | "pHash" | "foilDHash" | "foilPHash";
  confidence: "high" | "medium";
}

const D_THRESHOLD = 8;
const P_THRESHOLD = 12;

export class MobileHashIndex {
  private rows: MobileHashRow[] = [];

  load(rows: MobileHashRow[]): void {
    this.rows = rows;
  }

  get size(): number {
    return this.rows.length;
  }

  lookup(
    queryDHash: string,
    queryPHash: string
  ): MobileHashLookupResult | null {
    let bestResult: MobileHashLookupResult | null = null;
    let bestDistance = Infinity;

    for (const row of this.rows) {
      // 1. dHash — per-row hit flag
      const dd = hammingDistanceHex(queryDHash, row.dHash);
      const rowDHashHit = dd <= D_THRESHOLD;
      if (rowDHashHit && dd < bestDistance) {
        bestDistance = dd;
        bestResult = {
          variantId: row.variantId,
          distance: dd,
          matchType: "dHash",
          confidence: dd <= 4 ? "high" : "medium",
        };
      }

      // 2. Foil dHash — per-row hit flag
      let rowFoilDHashHit = false;
      if (row.foilDHash) {
        const fdd = hammingDistanceHex(queryDHash, row.foilDHash);
        rowFoilDHashHit = fdd <= D_THRESHOLD;
        if (rowFoilDHashHit && fdd < bestDistance) {
          bestDistance = fdd;
          bestResult = {
            variantId: row.variantId,
            distance: fdd,
            matchType: "foilDHash",
            confidence: fdd <= 4 ? "high" : "medium",
          };
        }
      }

      // 3. pHash — only if this row's dHash also missed
      if (!rowDHashHit && !rowFoilDHashHit) {
        const pd = hammingDistanceHex(queryPHash, row.pHash);
        if (pd <= P_THRESHOLD && pd < bestDistance) {
          bestDistance = pd;
          bestResult = {
            variantId: row.variantId,
            distance: pd,
            matchType: "pHash",
            confidence: "medium",
          };
        }

        // 4. Foil pHash
        if (row.foilPHash) {
          const fpd = hammingDistanceHex(queryPHash, row.foilPHash);
          if (fpd <= P_THRESHOLD && fpd < bestDistance) {
            bestDistance = fpd;
            bestResult = {
              variantId: row.variantId,
              distance: fpd,
              matchType: "foilPHash",
              confidence: "medium",
            };
          }
        }
      }
    }

    return bestResult;
  }
}
