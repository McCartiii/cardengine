# Scanner Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace OCR-based scanner with a dual-hash (dHash + pHash) pipeline delivering sub-100ms single card recognition via VisionCamera frame processor and 9×9/12×12 binder batch scan.

**Architecture:** Hash functions live in `packages/engine/src/hashing/` and are used server-side for ingest. Mobile implements worklet-compatible dHash inline for frame processor use, and uses `expo-image-manipulator` for binder cell crops. The hash index is downloaded alongside the card bundle and held in memory during scanner sessions.

**Tech Stack:** TypeScript, Vitest, Prisma (PostgreSQL), Fastify, Sharp (server), VisionCamera v4, `vision-camera-resize-plugin`, `expo-image-manipulator`, expo-sqlite, Reanimated v4 worklets.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `packages/engine/src/hashing/dhash.ts` | Create | dHash from RGBA pixel array |
| `packages/engine/src/hashing/phash.ts` | Create | pHash via DCT from RGBA pixel array |
| `packages/engine/src/hashing/HashIndex.ts` | Create | In-memory lookup with Hamming distance |
| `packages/engine/src/hashing/index.ts` | Create | Re-exports |
| `packages/engine/src/index.ts` | Modify | Export hashing module |
| `packages/engine/test/hashing.test.ts` | Create | Unit tests for all hash functions |
| `apps/api/prisma/schema.prisma` | Modify | Add dHash/pHash columns to CardVariant |
| `apps/api/src/jobs/scryfallIngest.ts` | Modify | Compute + store hashes during ingest |
| `apps/api/src/index.ts` | Modify | Add GET /v1/bundles/:game/hashes endpoint |
| `apps/mobile/src/lib/localDb.ts` | Modify | Add hash_index table + DB helpers |
| `apps/mobile/src/lib/sync.ts` | Modify | Add downloadHashBundle |
| `apps/mobile/src/scanner/hashUtils.ts` | Create | Worklet-compatible dHash + pHash for mobile |
| `apps/mobile/src/scanner/HashIndex.ts` | Create | Mobile in-memory hash index |
| `apps/mobile/src/screens/tabs/ScannerTab.tsx` | Modify | Frame processor + binder scan UI |

---

## Task 1: Hash functions in packages/engine

**Files:**
- Create: `packages/engine/src/hashing/dhash.ts`
- Create: `packages/engine/src/hashing/phash.ts`
- Create: `packages/engine/src/hashing/HashIndex.ts`
- Create: `packages/engine/src/hashing/index.ts`
- Create: `packages/engine/test/hashing.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `packages/engine/test/hashing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeDHash, computePHash, hammingDistance } from "../src/hashing/index.js";
import { HashIndex } from "../src/hashing/HashIndex.js";

// Helper: create a flat RGBA pixel array (width × height × 4 bytes)
function makePixels(width: number, height: number, fillFn: (x: number, y: number) => [number, number, number]): Uint8Array {
  const buf = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fillFn(x, y);
      const i = (y * width + x) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
    }
  }
  return buf;
}

describe("computeDHash", () => {
  it("returns a 64-bit bigint", () => {
    const pixels = makePixels(100, 100, () => [128, 128, 128]);
    const hash = computeDHash(pixels, 100, 100);
    expect(typeof hash).toBe("bigint");
    expect(hash >= 0n).toBe(true);
    expect(hash < (1n << 64n)).toBe(true);
  });

  it("identical images produce identical hashes", () => {
    const pixels = makePixels(200, 150, (x) => [x % 255, 100, 50]);
    expect(computeDHash(pixels, 200, 150)).toBe(computeDHash(pixels, 200, 150));
  });

  it("completely different images have high Hamming distance", () => {
    const white = makePixels(100, 100, () => [255, 255, 255]);
    const black = makePixels(100, 100, () => [0, 0, 0]);
    const dist = hammingDistance(computeDHash(white, 100, 100), computeDHash(black, 100, 100));
    expect(dist).toBeGreaterThan(20);
  });

  it("slightly different images have low Hamming distance", () => {
    const a = makePixels(100, 100, (x, y) => [x * 2, y * 2, 100]);
    const b = makePixels(100, 100, (x, y) => [x * 2 + 5, y * 2 + 5, 105]);
    const dist = hammingDistance(computeDHash(a, 100, 100), computeDHash(b, 100, 100));
    expect(dist).toBeLessThan(10);
  });
});

describe("computePHash", () => {
  it("returns a 64-bit bigint", () => {
    const pixels = makePixels(100, 100, () => [128, 128, 128]);
    const hash = computePHash(pixels, 100, 100);
    expect(typeof hash).toBe("bigint");
    expect(hash >= 0n).toBe(true);
    expect(hash < (1n << 64n)).toBe(true);
  });

  it("identical images produce identical hashes", () => {
    const pixels = makePixels(200, 150, (x, y) => [x % 200, y % 150, 80]);
    expect(computePHash(pixels, 200, 150)).toBe(computePHash(pixels, 200, 150));
  });

  it("brightness-shifted image has low Hamming distance (foil tolerance)", () => {
    const base = makePixels(100, 100, (x, y) => [x * 2, y * 2, 80]);
    // Simulate foil: uniform brightness boost
    const foil = makePixels(100, 100, (x, y) => [Math.min(255, x * 2 + 40), Math.min(255, y * 2 + 40), 120]);
    const dist = hammingDistance(computePHash(base, 100, 100), computePHash(foil, 100, 100));
    expect(dist).toBeLessThan(15);
  });
});

describe("hammingDistance", () => {
  it("same hash = distance 0", () => {
    expect(hammingDistance(0b1010n, 0b1010n)).toBe(0);
  });

  it("all bits differ = distance 64", () => {
    const all1s = (1n << 64n) - 1n;
    expect(hammingDistance(0n, all1s)).toBe(64);
  });

  it("one bit differs = distance 1", () => {
    expect(hammingDistance(0n, 1n)).toBe(1);
  });
});

describe("HashIndex", () => {
  it("finds an exact match", () => {
    const index = new HashIndex([
      { variantId: "v1", dHash: 12345n, pHash: 67890n },
      { variantId: "v2", dHash: 99999n, pHash: 11111n },
    ]);
    const result = index.lookup(12345n, 67890n);
    expect(result?.variantId).toBe("v1");
    expect(result?.distance).toBe(0);
    expect(result?.matchType).toBe("dHash");
  });

  it("finds a close dHash match within threshold", () => {
    const index = new HashIndex([
      { variantId: "v1", dHash: 0b1111n, pHash: 0n },
    ]);
    const result = index.lookup(0b1110n, 0n, { dHashThreshold: 8 });
    expect(result?.variantId).toBe("v1");
    expect(result?.matchType).toBe("dHash");
  });

  it("falls back to pHash when dHash misses", () => {
    const index = new HashIndex([
      { variantId: "v1", dHash: 0n, pHash: 0b11111111n },
    ]);
    // dHash far away, pHash close
    const result = index.lookup(0xFFFFFFFFFFFFFFFFn, 0b11110111n, { dHashThreshold: 8, pHashThreshold: 12 });
    expect(result?.variantId).toBe("v1");
    expect(result?.matchType).toBe("pHash");
  });

  it("returns null when nothing is within threshold", () => {
    const index = new HashIndex([
      { variantId: "v1", dHash: 0n, pHash: 0n },
    ]);
    const result = index.lookup(0xFFFFFFFFFFFFFFFFn, 0xFFFFFFFFFFFFFFFFn, { dHashThreshold: 8, pHashThreshold: 12 });
    expect(result).toBeNull();
  });

  it("checks foil hashes when present", () => {
    const index = new HashIndex([
      { variantId: "v1", dHash: 0n, pHash: 0n, foilDHash: 0b11111111n, foilPHash: 0n },
    ]);
    const result = index.lookup(0b11110000n, 0n, { dHashThreshold: 8 });
    expect(result?.variantId).toBe("v1");
    expect(result?.matchType).toBe("foilDHash");
  });
});
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
cd packages/engine && npm test
```

Expected: FAIL — modules not found.

- [ ] **Step 1.3: Create dhash.ts**

Create `packages/engine/src/hashing/dhash.ts`:

```ts
/**
 * Compute a 64-bit difference hash (dHash) from an RGBA pixel array.
 * Samples a 9×8 grid from the image and compares adjacent horizontal pixels.
 * Result is a bigint where bit N is 1 if pixel[N] is brighter than pixel[N+1].
 */
export function computeDHash(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): bigint {
  const SAMPLE_COLS = 9;
  const SAMPLE_ROWS = 8;

  const luma = (col: number, row: number): number => {
    const x = Math.min(width - 1, Math.floor((col / SAMPLE_COLS) * width));
    const y = Math.min(height - 1, Math.floor((row / SAMPLE_ROWS) * height));
    const i = (y * width + x) * 4;
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    return (r * 299 + g * 587 + b * 114) / 1000;
  };

  let hash = 0n;
  let bit = 0;
  for (let row = 0; row < SAMPLE_ROWS; row++) {
    for (let col = 0; col < SAMPLE_COLS - 1; col++) {
      if (luma(col, row) > luma(col + 1, row)) {
        hash |= 1n << BigInt(bit);
      }
      bit++;
    }
  }
  return hash;
}

/** Compute Hamming distance between two 64-bit hashes. */
export function hammingDistance(a: bigint, b: bigint): number {
  let diff = a ^ b;
  let count = 0;
  while (diff > 0n) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}
```

- [ ] **Step 1.4: Create phash.ts**

Create `packages/engine/src/hashing/phash.ts`:

```ts
/**
 * Compute a 64-bit perceptual hash (pHash) using a 2D DCT.
 * Samples a 32×32 grayscale grid, applies DCT, takes top-left 8×8
 * frequency coefficients, and thresholds at the median.
 * More tolerant of brightness/color shifts (foil) than dHash.
 */
export function computePHash(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): bigint {
  const SIZE = 32;

  // Sample SIZE×SIZE grayscale grid
  const grid: number[] = new Array(SIZE * SIZE);
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const x = Math.min(width - 1, Math.floor((col / SIZE) * width));
      const y = Math.min(height - 1, Math.floor((row / SIZE) * height));
      const i = (y * width + x) * 4;
      const r = pixels[i] ?? 0;
      const g = pixels[i + 1] ?? 0;
      const b = pixels[i + 2] ?? 0;
      grid[row * SIZE + col] = (r * 299 + g * 587 + b * 114) / 1000;
    }
  }

  // Pre-compute cosine table
  const cos = (n: number, k: number): number =>
    Math.cos(((2 * n + 1) * k * Math.PI) / (2 * SIZE));

  // 2D DCT — take only top-left 8×8 block
  const dct: number[] = new Array(64);
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let sum = 0;
      for (let x = 0; x < SIZE; x++) {
        const cx = cos(x, u);
        for (let y = 0; y < SIZE; y++) {
          sum += grid[x * SIZE + y] * cx * cos(y, v);
        }
      }
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      dct[u * 8 + v] = (2 / SIZE) * cu * cv * sum;
    }
  }

  // Compute median of the 64 DCT values
  const sorted = [...dct].sort((a, b) => a - b);
  const median = (sorted[31]! + sorted[32]!) / 2;

  // Build hash: bit N = 1 if dct[N] > median
  let hash = 0n;
  for (let i = 0; i < 64; i++) {
    if (dct[i]! > median) {
      hash |= 1n << BigInt(i);
    }
  }
  return hash;
}
```

- [ ] **Step 1.5: Create HashIndex.ts**

Create `packages/engine/src/hashing/HashIndex.ts`:

```ts
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
      // 1. dHash
      const dd = hammingDistance(queryDHash, row.dHash);
      if (dd <= dThr && dd < bestDistance) {
        bestDistance = dd;
        bestResult = { variantId: row.variantId, distance: dd, matchType: "dHash" };
      }

      // 2. Foil dHash
      if (row.foilDHash !== undefined) {
        const fdd = hammingDistance(queryDHash, row.foilDHash);
        if (fdd <= dThr && fdd < bestDistance) {
          bestDistance = fdd;
          bestResult = { variantId: row.variantId, distance: fdd, matchType: "foilDHash" };
        }
      }

      // 3. pHash (only if no dHash match yet)
      if (bestResult === null || bestResult.matchType === "pHash" || bestResult.matchType === "foilPHash") {
        const pd = hammingDistance(queryPHash, row.pHash);
        if (pd <= pThr && pd < bestDistance) {
          bestDistance = pd;
          bestResult = { variantId: row.variantId, distance: pd, matchType: "pHash" };
        }

        // 4. Foil pHash
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
```

- [ ] **Step 1.6: Create hashing/index.ts**

Create `packages/engine/src/hashing/index.ts`:

```ts
export { computeDHash, hammingDistance } from "./dhash.js";
export { computePHash } from "./phash.js";
export { HashIndex } from "./HashIndex.js";
export type { HashRow, HashLookupResult, LookupOptions } from "./HashIndex.js";
```

- [ ] **Step 1.7: Export from main engine index**

In `packages/engine/src/index.ts`, add at the bottom:

```ts
// Hashing
export {
  computeDHash,
  computePHash,
  hammingDistance,
  HashIndex,
} from "./hashing/index.js";
export type { HashRow, HashLookupResult, LookupOptions } from "./hashing/index.js";
```

- [ ] **Step 1.8: Run tests and confirm they pass**

```bash
cd packages/engine && npm test
```

Expected: All tests PASS.

- [ ] **Step 1.9: Build the engine package**

```bash
cd packages/engine && npm run build
```

Expected: `dist/` updated with no errors.

- [ ] **Step 1.10: Commit**

```bash
git add packages/engine/src/hashing packages/engine/test/hashing.test.ts packages/engine/src/index.ts packages/engine/dist
git commit -m "feat(engine): add dHash, pHash, and HashIndex for perceptual image matching"
```

---

## Task 2: Prisma schema — add hash columns to CardVariant

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 2.1: Add hash columns to CardVariant model**

In `apps/api/prisma/schema.prisma`, find the `CardVariant` model and add four columns after `imageUri`:

```prisma
  imageUri        String?  @map("image_uri")
  dHash           String?  @map("d_hash")
  pHash           String?  @map("p_hash")
  foilDHash       String?  @map("foil_d_hash")
  foilPHash       String?  @map("foil_p_hash")

  updatedAt DateTime @updatedAt
```

- [ ] **Step 2.2: Generate and apply the migration**

```bash
cd apps/api && npm run db:generate && npm run db:migrate
```

Expected: Migration created and applied. `CardVariant` table now has `d_hash`, `p_hash`, `foil_d_hash`, `foil_p_hash` columns (all nullable TEXT).

- [ ] **Step 2.3: Commit**

```bash
git add apps/api/prisma apps/api/src/generated
git commit -m "feat(api): add dHash/pHash columns to CardVariant"
```

---

## Task 3: Hash ingestion in scryfallIngest.ts

**Files:**
- Modify: `apps/api/src/jobs/scryfallIngest.ts`

- [ ] **Step 3.1: Install sharp**

```bash
cd apps/api && npm install sharp && npm install --save-dev @types/sharp
```

Expected: `sharp` added to `apps/api/package.json` dependencies.

- [ ] **Step 3.2: Add hash computation helpers to scryfallIngest.ts**

At the top of `apps/api/src/jobs/scryfallIngest.ts`, add the import:

```ts
import sharp from "sharp";
```

Then add this function after the existing `extractOracleText` function:

```ts
/** Fetch an image URL and compute dHash + pHash. Returns null on any failure. */
async function computeHashes(imageUrl: string): Promise<{
  dHash: string;
  pHash: string;
} | null> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();

    // Resize to 9×8 for dHash
    const { data: dData, info: dInfo } = await sharp(Buffer.from(arrayBuffer))
      .resize(9, 8, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const dHashVal = computeDHashFromRaw(dData, dInfo.width, dInfo.height, dInfo.channels);

    // Resize to 32×32 for pHash
    const { data: pData, info: pInfo } = await sharp(Buffer.from(arrayBuffer))
      .resize(32, 32, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pHashVal = computePHashFromRaw(pData, pInfo.width, pInfo.height, pInfo.channels);

    return {
      dHash: dHashVal.toString(16),
      pHash: pHashVal.toString(16),
    };
  } catch {
    return null;
  }
}

function computeDHashFromRaw(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): bigint {
  const luma = (col: number, row: number): number => {
    const i = (row * width + col) * channels;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    return (r * 299 + g * 587 + b * 114) / 1000;
  };
  let hash = 0n;
  let bit = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width - 1; col++) {
      if (luma(col, row) > luma(col + 1, row)) {
        hash |= 1n << BigInt(bit);
      }
      bit++;
    }
  }
  return hash;
}

function computePHashFromRaw(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): bigint {
  const grid: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * channels;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      grid.push((r * 299 + g * 587 + b * 114) / 1000);
    }
  }
  const cos = (n: number, k: number): number =>
    Math.cos(((2 * n + 1) * k * Math.PI) / (2 * width));
  const dct: number[] = [];
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let sum = 0;
      for (let x = 0; x < width; x++) {
        const cx = cos(x, u);
        for (let y = 0; y < height; y++) {
          sum += grid[x * width + y]! * cx * cos(y, v);
        }
      }
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      dct.push((2 / width) * cu * cv * sum);
    }
  }
  const sorted = [...dct].sort((a, b) => a - b);
  const median = (sorted[31]! + sorted[32]!) / 2;
  let hash = 0n;
  for (let i = 0; i < 64; i++) {
    if (dct[i]! > median) hash |= 1n << BigInt(i);
  }
  return hash;
}
```

- [ ] **Step 3.3: Call computeHashes inside ingestScryfallBulk**

Inside `ingestScryfallBulk`, in the batch upsert loop where `CardVariant` is written, add hash computation. Find the section that does the `CardVariant` upsert and add hash fields. The upsert call currently looks like:

```ts
await prisma.cardVariant.upsert({
  where: { variantId },
  create: { variantId, game: "mtg", cardId, printingId, name, ... },
  update: { name, ... },
});
```

Replace it with:

```ts
// Compute hashes for this card's image (and foil image if available)
const imageUri = extractImageUri(card);
const foilImageUri = card.card_faces?.[0]?.image_uris?.normal ?? null; // fallback if card has faces
const [hashes, foilHashes] = await Promise.all([
  imageUri ? computeHashes(imageUri) : Promise.resolve(null),
  foilImageUri && foilImageUri !== imageUri ? computeHashes(foilImageUri) : Promise.resolve(null),
]);

await prisma.cardVariant.upsert({
  where: { variantId },
  create: {
    variantId,
    game: "mtg",
    cardId,
    printingId,
    name,
    setId: card.set,
    collectorNumber: card.collector_number,
    oracleText: extractOracleText(card),
    typeLine: card.type_line ?? null,
    colors: card.colors ?? [],
    colorIdentity: card.color_identity ?? [],
    cmc: card.cmc ?? null,
    manaCost: card.mana_cost ?? null,
    rarity: card.rarity ?? null,
    imageUri,
    dHash: hashes?.dHash ?? null,
    pHash: hashes?.pHash ?? null,
    foilDHash: foilHashes?.dHash ?? null,
    foilPHash: foilHashes?.pHash ?? null,
  },
  update: {
    name,
    setId: card.set,
    collectorNumber: card.collector_number,
    oracleText: extractOracleText(card),
    typeLine: card.type_line ?? null,
    colors: card.colors ?? [],
    colorIdentity: card.color_identity ?? [],
    cmc: card.cmc ?? null,
    manaCost: card.mana_cost ?? null,
    rarity: card.rarity ?? null,
    imageUri,
    dHash: hashes?.dHash ?? null,
    pHash: hashes?.pHash ?? null,
    foilDHash: foilHashes?.dHash ?? null,
    foilPHash: foilHashes?.pHash ?? null,
  },
});
```

- [ ] **Step 3.4: Build the API to confirm no type errors**

```bash
cd apps/api && npm run build
```

Expected: Builds with no TypeScript errors.

- [ ] **Step 3.5: Commit**

```bash
git add apps/api/src/jobs/scryfallIngest.ts apps/api/package.json apps/api/package-lock.json
git commit -m "feat(api): compute dHash + pHash during Scryfall ingest"
```

---

## Task 4: Hash bundle endpoint

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 4.1: Add GET /v1/bundles/:game/hashes route**

In `apps/api/src/index.ts`, add this route immediately after the existing `GET /v1/bundles/:game/count` route (around line 1043):

```ts
// ── Hash bundle (for mobile perceptual-hash index) ──
app.get("/v1/bundles/:game/hashes", async (req) => {
  const params = z.object({ game: z.string() }).parse(req.params);
  const query = z
    .object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(5000).default(2000),
    })
    .parse(req.query);

  const where: Record<string, unknown> = {
    game: params.game,
    dHash: { not: null },
  };

  if (query.cursor) {
    where.variantId = { gt: query.cursor };
  }

  const cards = await prisma.cardVariant.findMany({
    where,
    orderBy: { variantId: "asc" },
    take: query.limit + 1,
    select: {
      variantId: true,
      dHash: true,
      pHash: true,
      foilDHash: true,
      foilPHash: true,
    },
  });

  const hasMore = cards.length > query.limit;
  const items = hasMore ? cards.slice(0, query.limit) : cards;
  const nextCursor = hasMore ? items[items.length - 1]!.variantId : null;

  return {
    game: params.game,
    count: items.length,
    hasMore,
    nextCursor,
    items: items.map((c) => ({
      variantId: c.variantId,
      dHash: c.dHash!,
      pHash: c.pHash!,
      foilDHash: c.foilDHash ?? undefined,
      foilPHash: c.foilPHash ?? undefined,
    })),
  };
});
```

- [ ] **Step 4.2: Build the API**

```bash
cd apps/api && npm run build
```

Expected: No TypeScript errors.

- [ ] **Step 4.3: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): add GET /v1/bundles/:game/hashes endpoint"
```

---

## Task 5: Mobile SQLite hash_index table + DB helpers

**Files:**
- Modify: `apps/mobile/src/lib/localDb.ts`

- [ ] **Step 5.1: Add hash_index table to initSchema**

In `apps/mobile/src/lib/localDb.ts`, inside the `initSchema` function's `execAsync` call, add this table definition after the `advisor_cache` table:

```sql
    -- Perceptual hash index for scanner
    CREATE TABLE IF NOT EXISTS hash_index (
      variantId TEXT PRIMARY KEY,
      dHash TEXT NOT NULL,
      pHash TEXT NOT NULL,
      foilDHash TEXT,
      foilPHash TEXT
    );
```

- [ ] **Step 5.2: Add insertHashBundle function**

Add this function at the bottom of `apps/mobile/src/lib/localDb.ts`:

```ts
/** Insert or replace hash index rows from the API bundle. */
export async function insertHashBundle(
  database: SQLite.SQLiteDatabase,
  items: Array<{
    variantId: string;
    dHash: string;
    pHash: string;
    foilDHash?: string;
    foilPHash?: string;
  }>
): Promise<void> {
  const BATCH = 500;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    await database.withTransactionAsync(async () => {
      for (const item of batch) {
        await database.runAsync(
          `INSERT OR REPLACE INTO hash_index (variantId, dHash, pHash, foilDHash, foilPHash)
           VALUES (?, ?, ?, ?, ?)`,
          [
            item.variantId,
            item.dHash,
            item.pHash,
            item.foilDHash ?? null,
            item.foilPHash ?? null,
          ]
        );
      }
    });
  }
}

/** Load the full hash index into memory. Call once on scanner open. */
export async function loadHashIndex(
  database: SQLite.SQLiteDatabase
): Promise<Array<{
  variantId: string;
  dHash: string;
  pHash: string;
  foilDHash: string | null;
  foilPHash: string | null;
}>> {
  return database.getAllAsync<{
    variantId: string;
    dHash: string;
    pHash: string;
    foilDHash: string | null;
    foilPHash: string | null;
  }>(`SELECT variantId, dHash, pHash, foilDHash, foilPHash FROM hash_index`);
}

/** Returns true if the hash index has been populated. */
export async function hashIndexIsPopulated(
  database: SQLite.SQLiteDatabase
): Promise<boolean> {
  const row = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM hash_index`
  );
  return (row?.count ?? 0) > 0;
}
```

- [ ] **Step 5.3: Commit**

```bash
git add apps/mobile/src/lib/localDb.ts
git commit -m "feat(mobile): add hash_index table and DB helpers"
```

---

## Task 6: Mobile hash sync

**Files:**
- Modify: `apps/mobile/src/lib/sync.ts`

- [ ] **Step 6.1: Add downloadHashBundle to sync.ts**

In `apps/mobile/src/lib/sync.ts`, add this import at the top alongside existing imports:

```ts
import {
  getDb,
  insertCardBundle,
  insertHashBundle,
  hashIndexIsPopulated,
  getUnsyncedEvents,
  markEventsSynced,
} from "./localDb";
```

Then add this function after `downloadCardBundle`:

```ts
/**
 * Download the hash index from the API using cursor-based pagination.
 * Skips if already populated (no 24hr refresh — hashes don't change often).
 */
export async function downloadHashBundle(
  onProgress?: (downloaded: number) => void
): Promise<void> {
  const database = await getDb();

  const alreadyPopulated = await hashIndexIsPopulated(database);
  if (alreadyPopulated) {
    console.log("[sync] Hash index already populated, skipping download.");
    return;
  }

  console.log("[sync] Downloading hash index...");
  let cursor: string | null = null;
  let totalDownloaded = 0;
  let hasMore = true;

  while (hasMore) {
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const url = `${API_URL}/v1/bundles/mtg/hashes?limit=2000${cursorParam}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Hash bundle fetch failed: ${res.status}`);
    const data = await res.json();

    if (data.items?.length > 0) {
      await insertHashBundle(database, data.items);
      totalDownloaded += data.items.length;
      onProgress?.(totalDownloaded);
    }

    if (!data.hasMore || !data.nextCursor) {
      hasMore = false;
    } else {
      cursor = data.nextCursor;
    }
  }

  console.log(`[sync] Downloaded ${totalDownloaded} hashes.`);
}
```

- [ ] **Step 6.2: Call downloadHashBundle from the existing sync entry point**

Find where `downloadCardBundle` is called in `sync.ts` (or wherever the sync is triggered from `ScannerTab` or app startup). Add `downloadHashBundle` to run after the card bundle:

```ts
export async function runFullSync(
  onCardProgress?: (downloaded: number, total: number | null) => void,
  onHashProgress?: (downloaded: number) => void
): Promise<void> {
  await downloadCardBundle(onCardProgress);
  await downloadHashBundle(onHashProgress);
}
```

If `runFullSync` already exists, add `downloadHashBundle` inside it after `downloadCardBundle`. If it doesn't exist and there is no central sync function, add the above.

- [ ] **Step 6.3: Commit**

```bash
git add apps/mobile/src/lib/sync.ts
git commit -m "feat(mobile): download hash index alongside card bundle"
```

---

## Task 7: Mobile hash utilities (worklet-compatible)

**Files:**
- Create: `apps/mobile/src/scanner/hashUtils.ts`
- Create: `apps/mobile/src/scanner/HashIndex.ts`

- [ ] **Step 7.1: Create hashUtils.ts**

Create `apps/mobile/src/scanner/hashUtils.ts`:

```ts
/**
 * Worklet-compatible dHash for use inside VisionCamera frame processors.
 * Uses RGB (3-channel) pixel data from vision-camera-resize-plugin output.
 * The 'worklet' directive makes these functions run on the UI/camera thread.
 */

/** Compute dHash from a 9×8 RGB buffer (27 bytes). */
export function computeDHashFromRGB9x8(buffer: Uint8Array): string {
  'worklet';
  let lo = 0;
  let hi = 0;
  let bit = 0;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const i1 = (row * 9 + col) * 3;
      const i2 = (row * 9 + col + 1) * 3;
      const r1 = buffer[i1] ?? 0;
      const g1 = buffer[i1 + 1] ?? 0;
      const b1 = buffer[i1 + 2] ?? 0;
      const r2 = buffer[i2] ?? 0;
      const g2 = buffer[i2 + 1] ?? 0;
      const b2 = buffer[i2 + 2] ?? 0;
      const luma1 = (r1 * 299 + g1 * 587 + b1 * 114) / 1000;
      const luma2 = (r2 * 299 + g2 * 587 + b2 * 114) / 1000;

      if (luma1 > luma2) {
        if (bit < 32) {
          lo |= 1 << bit;
        } else {
          hi |= 1 << (bit - 32);
        }
      }
      bit++;
    }
  }

  // Return as 16-char hex string (two 32-bit halves)
  return lo.toString(16).padStart(8, "0") + hi.toString(16).padStart(8, "0");
}

/**
 * Compute dHash from an RGBA pixel array (JS thread, for binder scan).
 * Used when processing captured photos via expo-image-manipulator.
 */
export function computeDHashFromRGBA(
  pixels: Uint8Array,
  width: number,
  height: number
): string {
  const luma = (col: number, row: number): number => {
    const sx = Math.min(width - 1, Math.floor((col / 9) * width));
    const sy = Math.min(height - 1, Math.floor((row / 8) * height));
    const i = (sy * width + sx) * 4;
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    return (r * 299 + g * 587 + b * 114) / 1000;
  };

  let lo = 0;
  let hi = 0;
  let bit = 0;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (luma(col, row) > luma(col + 1, row)) {
        if (bit < 32) lo |= 1 << bit;
        else hi |= 1 << (bit - 32);
      }
      bit++;
    }
  }

  return lo.toString(16).padStart(8, "0") + hi.toString(16).padStart(8, "0");
}

/**
 * Compute pHash from an RGBA pixel array (JS thread, for binder scan).
 * Slower than dHash but more tolerant of foil/lighting shifts.
 */
export function computePHashFromRGBA(
  pixels: Uint8Array,
  width: number,
  height: number
): string {
  const SIZE = 32;
  const grid: number[] = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const x = Math.min(width - 1, Math.floor((col / SIZE) * width));
      const y = Math.min(height - 1, Math.floor((row / SIZE) * height));
      const i = (y * width + x) * 4;
      const r = pixels[i] ?? 0;
      const g = pixels[i + 1] ?? 0;
      const b = pixels[i + 2] ?? 0;
      grid.push((r * 299 + g * 587 + b * 114) / 1000);
    }
  }

  const cos = (n: number, k: number): number =>
    Math.cos(((2 * n + 1) * k * Math.PI) / (2 * SIZE));

  const dct: number[] = [];
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let sum = 0;
      for (let x = 0; x < SIZE; x++) {
        const cx = cos(x, u);
        for (let y = 0; y < SIZE; y++) {
          sum += grid[x * SIZE + y]! * cx * cos(y, v);
        }
      }
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      dct.push((2 / SIZE) * cu * cv * sum);
    }
  }

  const sorted = [...dct].sort((a, b) => a - b);
  const median = (sorted[31]! + sorted[32]!) / 2;

  let lo = 0;
  let hi = 0;
  for (let i = 0; i < 64; i++) {
    if (dct[i]! > median) {
      if (i < 32) lo |= 1 << i;
      else hi |= 1 << (i - 32);
    }
  }

  return lo.toString(16).padStart(8, "0") + hi.toString(16).padStart(8, "0");
}

/** Hamming distance between two 16-char hex hash strings. */
export function hammingDistanceHex(a: string, b: string): number {
  let dist = 0;
  for (let i = 0; i < a.length; i += 8) {
    const va = parseInt(a.slice(i, i + 8), 16);
    const vb = parseInt(b.slice(i, i + 8), 16);
    let xor = (va ^ vb) >>> 0;
    while (xor > 0) {
      dist += xor & 1;
      xor >>>= 1;
    }
  }
  return dist;
}
```

- [ ] **Step 7.2: Create mobile HashIndex.ts**

Create `apps/mobile/src/scanner/HashIndex.ts`:

```ts
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
      // 1. dHash
      const dd = hammingDistanceHex(queryDHash, row.dHash);
      if (dd <= D_THRESHOLD && dd < bestDistance) {
        bestDistance = dd;
        bestResult = {
          variantId: row.variantId,
          distance: dd,
          matchType: "dHash",
          confidence: dd <= 4 ? "high" : "medium",
        };
      }

      // 2. Foil dHash
      if (row.foilDHash) {
        const fdd = hammingDistanceHex(queryDHash, row.foilDHash);
        if (fdd <= D_THRESHOLD && fdd < bestDistance) {
          bestDistance = fdd;
          bestResult = {
            variantId: row.variantId,
            distance: fdd,
            matchType: "foilDHash",
            confidence: fdd <= 4 ? "high" : "medium",
          };
        }
      }

      // 3. pHash (only when dHash didn't match well)
      if (bestResult === null) {
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
```

- [ ] **Step 7.3: Install vision-camera-resize-plugin and expo-image-manipulator**

```bash
cd apps/mobile && npm install vision-camera-resize-plugin expo-image-manipulator
```

Expected: Both packages added to `apps/mobile/package.json`.

- [ ] **Step 7.4: Commit**

```bash
git add apps/mobile/src/scanner apps/mobile/package.json apps/mobile/package-lock.json
git commit -m "feat(mobile): add hash utilities and MobileHashIndex for scanner"
```

---

## Task 8: ScannerTab — frame processor single scan + binder scan

**Files:**
- Modify: `apps/mobile/src/screens/tabs/ScannerTab.tsx`

This task rewrites `ScannerTab.tsx` entirely. The existing OCR pipeline is preserved as a fallback within the new single-scan mode.

- [ ] **Step 8.1: Replace ScannerTab.tsx**

Replace the entire contents of `apps/mobile/src/screens/tabs/ScannerTab.tsx` with:

```tsx
"use client";
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
  Vibration,
  FlatList,
  Dimensions,
} from "react-native";
import { useAnimatedStyle, useSharedValue, withTiming, runOnJS } from "react-native-reanimated";
import Animated from "react-native-reanimated";
import { getDb, insertLedgerEvent, searchCards, loadHashIndex } from "../../lib/localDb";
import { downloadHashBundle } from "../../lib/sync";
import { colors, spacing, radii, typography, shadows, tabColors } from "../../theme";
import { MobileHashIndex } from "../../scanner/HashIndex";
import { computeDHashFromRGB9x8 } from "../../scanner/hashUtils";

const t = colors.light;
const tc = tabColors.scanner;
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";
const SCREEN_WIDTH = Dimensions.get("window").width;
const CELL_SIZE = (SCREEN_WIDTH - 32) / 3;

// ── Dynamic imports (not available in Expo Go) ──
let Camera: React.ComponentType<any> | null = null;
let useFrameProcessor: ((...args: any[]) => any) | null = null;
let useResizePlugin: (() => any) | null = null;
let TextRecognition: { recognize: (uri: string) => Promise<any> } | null = null;
let ImageManipulator: any = null;

try {
  const VisionCamera = require("react-native-vision-camera");
  Camera = VisionCamera.Camera;
  useFrameProcessor = VisionCamera.useFrameProcessor;
} catch { /* not available in Expo Go */ }

try {
  const ResizePlugin = require("vision-camera-resize-plugin");
  useResizePlugin = ResizePlugin.useResizePlugin;
} catch { /* not available in Expo Go */ }

try {
  TextRecognition = require("@react-native-ml-kit/text-recognition").default;
} catch { /* not available */ }

try {
  ImageManipulator = require("expo-image-manipulator");
} catch { /* not available */ }

// ── Types ──
type ScanMode = "rapid" | "binder";
type GridSize = 9 | 12;
type OverlayState = "idle" | "detecting" | "confirmed" | "lowConfidence" | "ocrFallback";

interface ScanCandidate {
  variantId: string;
  cardId: string;
  name: string;
  setId?: string;
  collectorNumber?: string;
  imageUri?: string;
  manaCost?: string;
  typeLine?: string;
  rarity?: string;
  score: number;
  matchType: string;
  prices?: Array<{ market: string; kind: string; currency: string; amount: number }>;
}

interface ScannedCard {
  variantId: string;
  cardId: string;
  name: string;
  setId?: string;
  collectorNumber?: string;
  imageUri?: string;
  quantity: number;
  priceUsd: number;
  addedToCollection: boolean;
}

interface BinderCell {
  variantId: string;
  name: string;
  imageUri?: string;
  setId?: string;
  confidence: "high" | "medium" | "none";
  selected: boolean;
}

// ── Levenshtein (OCR fallback) ──
function levenshtein(a: string, b: string): number {
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const curr = [i];
    for (let j = 1; j <= lb; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j]!, curr[j - 1]!, prev[j - 1]!);
    }
    prev = curr;
  }
  return prev[lb]!;
}

// ── OCR field extraction (fallback) ──
function extractCardFields(result: any): {
  name: string; setCode?: string; collectorNumber?: string;
} {
  const blocks = result?.blocks ?? [];
  let nameBlock = "";
  let bottomText = "";
  const imgHeight = result?.height ?? 1000;
  const imgWidth = result?.width ?? 700;
  for (const block of blocks) {
    const frame = block.frame ?? block.boundingBox ?? {};
    const y = frame.y ?? frame.top ?? 0;
    const x = frame.x ?? frame.left ?? 0;
    const text = (block.text ?? "").trim();
    if (!text) continue;
    const yRatio = y / imgHeight;
    const xRatio = x / imgWidth;
    if (yRatio < 0.15 && xRatio < 0.6) {
      if (!nameBlock) nameBlock = text;
    } else if (yRatio > 0.85) {
      bottomText += " " + text;
    }
  }
  if (!nameBlock) {
    const lines = (result?.text ?? "").split("\n").filter((l: string) => l.trim().length > 1);
    nameBlock = lines[0] ?? "";
  }
  const name = nameBlock.replace(/[^a-zA-Z0-9\s,'-]/g, "").trim();
  let setCode: string | undefined;
  let collectorNumber: string | undefined;
  const bottomMatch = bottomText.match(/([A-Z]{3,5})\s*[·•.\-]?\s*(\d{1,4}[a-z]?)/i);
  if (bottomMatch) {
    setCode = bottomMatch[1]!.toUpperCase();
    collectorNumber = bottomMatch[2];
  }
  return { name, setCode, collectorNumber };
}

// ── OCR offline match (fallback) ──
async function matchOfflineOcr(fields: {
  name: string; setCode?: string; collectorNumber?: string;
}): Promise<ScanCandidate | null> {
  try {
    const database = await getDb();
    const nameNorm = fields.name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    if (nameNorm.length < 2) return null;
    const results = await searchCards(database, nameNorm, 20);
    let best: any = null;
    let bestScore = 0;
    for (const row of results) {
      const card = row as any;
      const cName = (card.name ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, "");
      let score = 0;
      let matchType = "fuzzy";
      if (cName === nameNorm) { score = 80; matchType = "exact_name"; }
      else if (cName.startsWith(nameNorm) || nameNorm.startsWith(cName)) { score = 70; matchType = "prefix"; }
      else {
        const dist = levenshtein(nameNorm, cName);
        const maxLen = Math.max(nameNorm.length, cName.length);
        score = Math.round((1 - dist / maxLen) * 60);
      }
      if (fields.setCode && card.setId?.toLowerCase() === fields.setCode.toLowerCase()) {
        score += 10;
        if (fields.collectorNumber && card.collectorNumber === fields.collectorNumber) {
          score += 10; matchType = "set_collector";
        }
      }
      if (score > bestScore) { bestScore = score; best = { ...card, score, matchType }; }
    }
    if (best && best.score >= 50) {
      return {
        variantId: best.variantId, cardId: best.cardId, name: best.name,
        setId: best.setId, collectorNumber: best.collectorNumber,
        imageUri: best.imageUri, manaCost: best.manaCost, typeLine: best.typeLine,
        rarity: best.rarity, score: best.score, matchType: best.matchType, prices: [],
      };
    }
  } catch { /* offline match failed */ }
  return null;
}

// ── Singleton hash index (loaded once per scanner session) ──
const globalHashIndex = new MobileHashIndex();
let hashIndexLoaded = false;

async function ensureHashIndexLoaded(): Promise<void> {
  if (hashIndexLoaded) return;
  const database = await getDb();
  const rows = await loadHashIndex(database);
  if (rows.length === 0) {
    // Try downloading
    await downloadHashBundle();
    const freshRows = await loadHashIndex(database);
    globalHashIndex.load(freshRows);
  } else {
    globalHashIndex.load(rows);
  }
  hashIndexLoaded = true;
}

// ── Component ──
export function ScannerTab() {
  const [hasPermission, setHasPermission] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>("rapid");
  const [isActive, setIsActive] = useState(true);
  const [overlayState, setOverlayState] = useState<OverlayState>("idle");
  const [ocrHint, setOcrHint] = useState<string | null>(null);
  const [hashIndexReady, setHashIndexReady] = useState(false);

  // Rapid-fire state
  const [scannedCards, setScannedCards] = useState<ScannedCard[]>([]);
  const [scanCount, setScanCount] = useState(0);
  const [sessionValue, setSessionValue] = useState(0);
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerCandidates, setPickerCandidates] = useState<ScanCandidate[]>([]);

  // Binder state
  const [gridSize, setGridSize] = useState<GridSize>(9);
  const [binderCells, setBinderCells] = useState<BinderCell[]>([]);
  const [binderProcessing, setBinderProcessing] = useState(false);
  const [binderProgress, setBinderProgress] = useState(0);

  const cameraRef = useRef<any>(null);
  const scanLockRef = useRef(false);

  // Ring buffer: last 8 frame hash results (variantId | null)
  const ringBuffer = useRef<Array<string | null>>(new Array(8).fill(null));
  const ringIdx = useRef(0);

  // Confidence fill animation
  const confidenceFill = useSharedValue(0);
  const overlayColor = useSharedValue("#FFFFFF");

  // Load hash index on mount
  useEffect(() => {
    ensureHashIndexLoaded().then(() => setHashIndexReady(true));
  }, []);

  // Camera permission
  useEffect(() => {
    if (Camera) {
      (async () => {
        try {
          const VisionCamera = require("react-native-vision-camera");
          const status = await VisionCamera.Camera.requestCameraPermission();
          setHasPermission(status === "granted" || status === "authorized");
        } catch {
          setHasPermission(false);
        }
      })();
    }
  }, []);

  // ── Hash received from frame processor ──
  const onHashReceived = useCallback((dHashHex: string) => {
    if (scanLockRef.current || scanMode !== "rapid") return;

    const result = globalHashIndex.lookup(dHashHex, dHashHex); // pHash fallback uses same hash in frame processor
    const variantId = result?.variantId ?? null;

    // Push into ring buffer
    ringBuffer.current[ringIdx.current % 8] = variantId;
    ringIdx.current++;

    // Count matching results in last 8 frames
    const counts: Record<string, number> = {};
    for (const id of ringBuffer.current) {
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }

    const topId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

    if (topId && topId[1] >= 3) {
      // 3 of last 8 frames agree — auto-confirm
      const matchedId = topId[0];
      if (matchedId !== lastScannedId) {
        autoConfirmByVariantId(matchedId);
      }
      setOverlayState("confirmed");
      confidenceFill.value = withTiming(1, { duration: 100 });
    } else if (ringIdx.current > 0 && ringIdx.current % 8 === 0 && !topId) {
      // 8 frames, no match — suggest OCR fallback
      setOverlayState("lowConfidence");
      triggerOcrFallback();
    } else if (variantId) {
      setOverlayState("detecting");
      confidenceFill.value = withTiming((topId?.[1] ?? 1) / 3, { duration: 80 });
    } else {
      setOverlayState("idle");
      confidenceFill.value = withTiming(0, { duration: 200 });
    }
  }, [scanMode, lastScannedId]);

  // ── Frame processor ──
  const resize = useResizePlugin ? useResizePlugin() : null;

  const frameProcessor = useFrameProcessor && resize && hashIndexReady
    ? useFrameProcessor((frame: any) => {
        'worklet';
        try {
          const resized = resize(frame, {
            scale: { width: 9, height: 8 },
            pixelFormat: 'rgb',
            dataType: 'uint8',
          });
          const dHash = computeDHashFromRGB9x8(new Uint8Array(resized.buffer));
          runOnJS(onHashReceived)(dHash);
        } catch { /* ignore frame errors */ }
      }, [onHashReceived, resize, hashIndexReady])
    : undefined;

  // ── Auto-confirm by variantId (lookup card details from local DB) ──
  const autoConfirmByVariantId = useCallback(async (variantId: string) => {
    scanLockRef.current = true;
    Vibration.vibrate(50);

    // Reset ring buffer
    ringBuffer.current = new Array(8).fill(null);
    ringIdx.current = 0;

    try {
      const database = await getDb();
      const rows = await database.getAllAsync<any>(
        `SELECT * FROM cards WHERE variantId = ? LIMIT 1`, [variantId]
      );
      const card = rows[0];
      if (!card) return;

      const priceUsd = 0; // Prices fetched lazily from API if needed

      setScannedCards((prev) => {
        const existing = prev.find((c) => c.variantId === variantId);
        if (existing) {
          return prev.map((c) =>
            c.variantId === variantId ? { ...c, quantity: c.quantity + 1 } : c
          );
        }
        return [
          {
            variantId: card.variantId,
            cardId: card.cardId,
            name: card.name,
            setId: card.setId,
            collectorNumber: card.collectorNumber,
            imageUri: card.imageUri,
            quantity: 1,
            priceUsd,
            addedToCollection: false,
          },
          ...prev,
        ];
      });

      setLastScannedId(variantId);
      setScanCount((c) => c + 1);
      setOverlayState("confirmed");

      // Unlock after 1.5s
      setTimeout(() => {
        scanLockRef.current = false;
        setLastScannedId(null);
        setOverlayState("idle");
        confidenceFill.value = withTiming(0, { duration: 300 });
      }, 1500);
    } catch {
      scanLockRef.current = false;
    }
  }, []);

  // ── OCR fallback (when hash fails) ──
  const triggerOcrFallback = useCallback(async () => {
    if (scanLockRef.current || !cameraRef.current || !TextRecognition) return;
    scanLockRef.current = true;
    setOverlayState("ocrFallback");
    setOcrHint("Trying text match...");

    try {
      const photo = await cameraRef.current.takePhoto({ qualityPrioritization: "speed" });
      const recognized = await TextRecognition.recognize(photo.path);
      if (!recognized?.text || recognized.text.trim().length < 3) return;

      const fields = extractCardFields(recognized);
      if (!fields.name || fields.name.length < 2) return;

      const candidate = await matchOfflineOcr(fields);
      if (candidate && candidate.score >= 70 && candidate.variantId !== lastScannedId) {
        await autoConfirmByVariantId(candidate.variantId);
      } else if (candidate) {
        setPickerCandidates([candidate]);
        setShowPicker(true);
      }
    } catch { /* ignore */ } finally {
      scanLockRef.current = false;
      setOcrHint(null);
    }
  }, [lastScannedId, autoConfirmByVariantId]);

  // ── Add all to collection ──
  const addAllToCollection = useCallback(async () => {
    const toAdd = scannedCards.filter((c) => !c.addedToCollection);
    if (toAdd.length === 0) {
      Alert.alert("Nothing to add", "All cards already in collection.");
      return;
    }
    try {
      const database = await getDb();
      for (const card of toAdd) {
        for (let i = 0; i < card.quantity; i++) {
          await insertLedgerEvent(database, {
            id: `scan-${card.variantId}-${Date.now()}-${i}`,
            at: new Date().toISOString(),
            type: "add",
            variantId: card.variantId,
            payload: { source: "rapid_scan", quantity: 1 },
          });
        }
      }
      setScannedCards((prev) => prev.map((c) => ({ ...c, addedToCollection: true })));
      Alert.alert("Added", `${toAdd.reduce((s, c) => s + c.quantity, 0)} card(s) added.`);
    } catch {
      Alert.alert("Error", "Failed to add cards to collection.");
    }
  }, [scannedCards]);

  const undoLastScan = useCallback(() => {
    setScannedCards((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[0]!;
      if (last.quantity > 1) {
        setScanCount((c) => c - 1);
        setSessionValue((v) => v - last.priceUsd);
        return prev.map((c, i) => i === 0 ? { ...c, quantity: c.quantity - 1 } : c);
      }
      setScanCount((c) => c - 1);
      setSessionValue((v) => v - last.priceUsd);
      return prev.slice(1);
    });
  }, []);

  // ── Binder capture ──
  const captureBinderPage = useCallback(async () => {
    if (!cameraRef.current || !ImageManipulator) return;
    setBinderProcessing(true);
    setBinderCells([]);
    setBinderProgress(0);

    try {
      const photo = await cameraRef.current.takePhoto({ qualityPrioritization: "quality" });
      const photoUri = `file://${photo.path}`;

      const n = gridSize;
      const totalCells = n * n;
      const results: BinderCell[] = [];
      let processed = 0;

      // Get image dimensions from first resize
      const dimInfo = await ImageManipulator.manipulateAsync(
        photoUri,
        [{ resize: { width: 100 } }],
        { base64: false }
      );
      const aspectRatio = dimInfo.height / dimInfo.width;
      const fullWidth = photo.width ?? 3024;
      const fullHeight = photo.height ?? Math.round(fullWidth * aspectRatio);

      const cellW = Math.floor(fullWidth / n);
      const cellH = Math.floor(fullHeight / n);

      // Process in batches of 9
      const BATCH = 9;
      for (let start = 0; start < totalCells; start += BATCH) {
        const batchCells = [];
        for (let offset = 0; offset < BATCH && start + offset < totalCells; offset++) {
          const idx = start + offset;
          const row = Math.floor(idx / n);
          const col = idx % n;
          batchCells.push({ row, col, idx });
        }

        await Promise.all(
          batchCells.map(async ({ row, col }) => {
            try {
              // Crop this cell
              const cropped = await ImageManipulator.manipulateAsync(
                photoUri,
                [{
                  crop: {
                    originX: col * cellW,
                    originY: row * cellH,
                    width: cellW,
                    height: cellH,
                  },
                }, { resize: { width: 64, height: 64 } }],
                { base64: true, format: ImageManipulator.SaveFormat?.PNG ?? "png" }
              );

              if (!cropped.base64) return;

              // Decode base64 PNG to pixel array
              const pixels = decodePngBase64ToRGBA(cropped.base64, 64, 64);
              if (!pixels) return;

              // Empty slot detection: check if uniform color
              if (isEmptySlot(pixels, 64, 64)) return;

              // Compute hashes
              const { computeDHashFromRGBA, computePHashFromRGBA } = require("../../scanner/hashUtils");
              const dHashHex = computeDHashFromRGBA(pixels, 64, 64);
              const pHashHex = computePHashFromRGBA(pixels, 64, 64);

              const match = globalHashIndex.lookup(dHashHex, pHashHex);
              if (!match) return;

              // Lookup card details
              const database = await getDb();
              const rows = await database.getAllAsync<any>(
                `SELECT variantId, name, imageUri, setId FROM cards WHERE variantId = ? LIMIT 1`,
                [match.variantId]
              );
              const card = rows[0];
              if (!card) return;

              results.push({
                variantId: card.variantId,
                name: card.name,
                imageUri: card.imageUri,
                setId: card.setId,
                confidence: match.confidence,
                selected: true,
              });
            } catch { /* skip cell on error */ }
          })
        );

        processed += batchCells.length;
        setBinderProgress(Math.round((processed / totalCells) * 100));
        setBinderCells([...results]);
      }

      Vibration.vibrate(100);
    } catch {
      Alert.alert("Scan Error", "Failed to process binder page.");
    } finally {
      setBinderProcessing(false);
    }
  }, [gridSize]);

  const toggleBinderCell = useCallback((variantId: string) => {
    setBinderCells((prev) =>
      prev.map((c) => c.variantId === variantId ? { ...c, selected: !c.selected } : c)
    );
  }, []);

  const addSelectedBinderCards = useCallback(async () => {
    const selected = binderCells.filter((c) => c.selected);
    if (selected.length === 0) {
      Alert.alert("Nothing selected", "Tap cards to select them.");
      return;
    }
    try {
      const database = await getDb();
      await database.withTransactionAsync(async () => {
        for (const card of selected) {
          await insertLedgerEvent(database, {
            id: `binder-${card.variantId}-${Date.now()}`,
            at: new Date().toISOString(),
            type: "add",
            variantId: card.variantId,
            payload: { source: "binder_scan", quantity: 1 },
          });
        }
      });
      Alert.alert("Added", `${selected.length} card(s) added to collection.`);
      setBinderCells([]);
    } catch {
      Alert.alert("Error", "Failed to add cards.");
    }
  }, [binderCells]);

  // ── Overlay style ──
  const overlayBorderStyle = useAnimatedStyle(() => ({
    borderColor:
      overlayState === "confirmed" ? "#22C55E" :
      overlayState === "detecting" ? "#3B82F6" :
      overlayState === "lowConfidence" ? "#F59E0B" :
      overlayState === "ocrFallback" ? "#6B7280" :
      "#FFFFFF",
    opacity: overlayState === "idle" ? 0.4 : 1,
  }));

  // ── Fallback UI (Expo Go) ──
  if (!Camera) {
    return (
      <View style={styles.container}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackTitle}>Camera not available</Text>
          <Text style={styles.fallbackSubtitle}>
            Use a development build (not Expo Go) to enable the scanner.
          </Text>
        </View>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackTitle}>Camera permission required</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Mode selector ── */}
      <View style={styles.modeBar}>
        <TouchableOpacity
          style={[styles.modeBtn, scanMode === "rapid" && styles.modeBtnActive]}
          onPress={() => setScanMode("rapid")}
        >
          <Text style={[styles.modeBtnText, scanMode === "rapid" && styles.modeBtnTextActive]}>
            Single
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, scanMode === "binder" && styles.modeBtnActive]}
          onPress={() => setScanMode("binder")}
        >
          <Text style={[styles.modeBtnText, scanMode === "binder" && styles.modeBtnTextActive]}>
            Binder
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Camera ── */}
      <View style={styles.cameraContainer}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={undefined} // resolved by VisionCamera internally
          isActive={isActive}
          frameProcessor={scanMode === "rapid" ? frameProcessor : undefined}
          photo
        />

        {/* Viewfinder overlay */}
        {scanMode === "rapid" && (
          <Animated.View style={[styles.cardOverlay, overlayBorderStyle]}>
            {overlayState === "confirmed" && (
              <Text style={styles.overlayConfirmedText}>✓</Text>
            )}
            {(overlayState === "lowConfidence") && (
              <Text style={styles.overlayHintText}>Adjust angle</Text>
            )}
            {overlayState === "ocrFallback" && (
              <Text style={styles.overlayHintText}>{ocrHint}</Text>
            )}
          </Animated.View>
        )}

        {/* Binder grid overlay */}
        {scanMode === "binder" && (
          <View style={styles.binderGridOverlay}>
            {Array.from({ length: gridSize }).map((_, row) =>
              Array.from({ length: gridSize }).map((_, col) => (
                <View
                  key={`${row}-${col}`}
                  style={[
                    styles.binderCell,
                    {
                      width: `${100 / gridSize}%`,
                      height: `${100 / gridSize}%`,
                    },
                  ]}
                />
              ))
            )}
          </View>
        )}

        {/* Hash index loading indicator */}
        {!hashIndexReady && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.loadingText}>Loading card index...</Text>
          </View>
        )}
      </View>

      {/* ── Controls ── */}
      {scanMode === "rapid" && (
        <View style={styles.rapidControls}>
          <View style={styles.sessionStats}>
            <Text style={styles.statText}>{scanCount} cards</Text>
            {sessionValue > 0 && (
              <Text style={styles.statText}>${sessionValue.toFixed(2)}</Text>
            )}
          </View>
          <View style={styles.rapidActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={undoLastScan}>
              <Text style={styles.actionBtnText}>Undo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={addAllToCollection}>
              <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>
                Add {scanCount > 0 ? scanCount : ""} to Collection
              </Text>
            </TouchableOpacity>
          </View>

          {/* Scanned cards list */}
          <FlatList
            data={scannedCards}
            keyExtractor={(c) => c.variantId}
            horizontal
            style={styles.scannedList}
            renderItem={({ item }) => (
              <View style={styles.scannedCard}>
                {item.imageUri ? (
                  <Image source={{ uri: item.imageUri }} style={styles.scannedCardImage} />
                ) : (
                  <View style={[styles.scannedCardImage, styles.scannedCardPlaceholder]}>
                    <Text style={styles.scannedCardName}>{item.name[0]}</Text>
                  </View>
                )}
                {item.quantity > 1 && (
                  <View style={styles.quantityBadge}>
                    <Text style={styles.quantityText}>×{item.quantity}</Text>
                  </View>
                )}
                {item.addedToCollection && (
                  <View style={styles.addedBadge}>
                    <Text style={styles.addedText}>✓</Text>
                  </View>
                )}
              </View>
            )}
          />
        </View>
      )}

      {scanMode === "binder" && (
        <View style={styles.binderControls}>
          {/* Grid size selector */}
          <View style={styles.gridSizeRow}>
            <Text style={styles.gridSizeLabel}>Grid:</Text>
            {([9, 12] as GridSize[]).map((size) => (
              <TouchableOpacity
                key={size}
                style={[styles.gridSizeBtn, gridSize === size && styles.gridSizeBtnActive]}
                onPress={() => setGridSize(size)}
              >
                <Text style={[styles.gridSizeBtnText, gridSize === size && styles.gridSizeBtnTextActive]}>
                  {size}×{size}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Capture button */}
          {!binderProcessing && binderCells.length === 0 && (
            <TouchableOpacity style={styles.captureBtn} onPress={captureBinderPage}>
              <Text style={styles.captureBtnText}>Scan Page</Text>
            </TouchableOpacity>
          )}

          {binderProcessing && (
            <View style={styles.processingRow}>
              <ActivityIndicator color={tc.primary} />
              <Text style={styles.processingText}>Processing {binderProgress}%</Text>
            </View>
          )}

          {/* Results grid */}
          {binderCells.length > 0 && (
            <>
              <View style={styles.binderResultsHeader}>
                <Text style={styles.binderResultsTitle}>
                  {binderCells.filter((c) => c.selected).length} of {binderCells.length} selected
                </Text>
                <TouchableOpacity onPress={() => setBinderCells((prev) => prev.map((c) => ({ ...c, selected: true })))}>
                  <Text style={styles.binderSelectAll}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setBinderCells((prev) => prev.map((c) => ({ ...c, selected: false })))}>
                  <Text style={styles.binderSelectAll}>None</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={binderCells}
                keyExtractor={(c) => c.variantId}
                numColumns={3}
                style={styles.binderResultsList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.binderResultCell,
                      !item.selected && styles.binderResultCellDeselected,
                      item.confidence === "medium" && styles.binderResultCellMedium,
                    ]}
                    onPress={() => toggleBinderCell(item.variantId)}
                  >
                    {item.imageUri ? (
                      <Image source={{ uri: item.imageUri }} style={styles.binderResultImage} />
                    ) : (
                      <View style={[styles.binderResultImage, styles.binderResultPlaceholder]}>
                        <Text style={styles.binderResultPlaceholderText}>{item.name[0]}</Text>
                      </View>
                    )}
                    <Text style={styles.binderResultName} numberOfLines={1}>{item.name}</Text>
                  </TouchableOpacity>
                )}
              />

              <TouchableOpacity style={styles.addAllBtn} onPress={addSelectedBinderCards}>
                <Text style={styles.addAllBtnText}>
                  Add {binderCells.filter((c) => c.selected).length} Cards
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.clearBtn} onPress={() => setBinderCells([])}>
                <Text style={styles.clearBtnText}>Clear & Rescan</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ── PNG decode helper ──
// Decodes a base64 PNG that is exactly 64×64 pixels into a Uint8Array of RGBA values.
// Handles only uncompressed or minimally compressed tiny PNGs from expo-image-manipulator.
function decodePngBase64ToRGBA(base64: string, width: number, height: number): Uint8Array | null {
  try {
    // Use atob if available (React Native with Hermes supports it)
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    // PNG signature: bytes 0-7 = [137, 80, 78, 71, 13, 10, 26, 10]
    if (bytes[0] !== 137 || bytes[1] !== 80) return null;

    // For simplicity: generate a synthetic RGBA array from the base64 length
    // This is a placeholder — in production use a proper PNG decoder like 'fast-png'
    // For now, return a uniform grey array (will produce hash = 0, which is filtered by HashIndex)
    // TODO: Replace with 'fast-png' npm package for accurate pixel decoding
    return new Uint8Array(width * height * 4).fill(128);
  } catch {
    return null;
  }
}

// ── Empty slot detection ──
function isEmptySlot(pixels: Uint8Array, width: number, height: number): boolean {
  const sampleCount = Math.min(100, Math.floor(pixels.length / 4));
  const step = Math.floor((width * height) / sampleCount);
  let minL = 255, maxL = 0;
  for (let i = 0; i < sampleCount; i++) {
    const idx = (i * step) * 4;
    const r = pixels[idx] ?? 128;
    const g = pixels[idx + 1] ?? 128;
    const b = pixels[idx + 2] ?? 128;
    const l = (r * 299 + g * 587 + b * 114) / 1000;
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
  }
  return (maxL - minL) < 30; // uniform color = empty slot
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: t.background },
  modeBar: {
    flexDirection: "row",
    backgroundColor: t.surface,
    margin: spacing.sm,
    borderRadius: radii.md,
    padding: 2,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    borderRadius: radii.sm,
  },
  modeBtnActive: { backgroundColor: tc.primary },
  modeBtnText: { ...typography.body, color: t.textSecondary },
  modeBtnTextActive: { color: "#fff", fontWeight: "600" },
  cameraContainer: { height: 320, marginHorizontal: spacing.sm, borderRadius: radii.lg, overflow: "hidden", position: "relative" },
  cardOverlay: {
    position: "absolute",
    top: "10%",
    left: "10%",
    right: "10%",
    bottom: "10%",
    borderWidth: 2,
    borderRadius: radii.md,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  overlayConfirmedText: { fontSize: 48, color: "#22C55E" },
  overlayHintText: { fontSize: 14, color: "#fff", backgroundColor: "rgba(0,0,0,0.5)", padding: 4, borderRadius: 4 },
  binderGridOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  binderCell: {
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.4)",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  loadingText: { color: "#fff", ...typography.body },
  rapidControls: { flex: 1, padding: spacing.sm },
  sessionStats: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  statText: { ...typography.body, color: t.textSecondary },
  rapidActions: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: "center",
  },
  actionBtnPrimary: { backgroundColor: tc.primary, borderColor: tc.primary },
  actionBtnText: { ...typography.body, color: t.text },
  actionBtnTextPrimary: { color: "#fff", fontWeight: "600" },
  scannedList: { flexGrow: 0 },
  scannedCard: { width: 60, height: 84, marginRight: spacing.sm, borderRadius: radii.sm, overflow: "hidden", position: "relative" },
  scannedCardImage: { width: "100%", height: "100%", borderRadius: radii.sm },
  scannedCardPlaceholder: { backgroundColor: t.surface, alignItems: "center", justifyContent: "center" },
  scannedCardName: { fontSize: 20, fontWeight: "bold", color: t.text },
  quantityBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    backgroundColor: tc.primary,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  quantityText: { fontSize: 10, color: "#fff", fontWeight: "bold" },
  addedBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: "#22C55E",
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  addedText: { fontSize: 10, color: "#fff" },
  binderControls: { flex: 1, padding: spacing.sm },
  gridSizeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  gridSizeLabel: { ...typography.body, color: t.textSecondary },
  gridSizeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: t.border,
  },
  gridSizeBtnActive: { backgroundColor: tc.primary, borderColor: tc.primary },
  gridSizeBtnText: { ...typography.body, color: t.text },
  gridSizeBtnTextActive: { color: "#fff", fontWeight: "600" },
  captureBtn: {
    backgroundColor: tc.primary,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  captureBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  processingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  processingText: { ...typography.body, color: t.textSecondary },
  binderResultsHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  binderResultsTitle: { flex: 1, ...typography.body, color: t.text },
  binderSelectAll: { ...typography.body, color: tc.primary },
  binderResultsList: { flex: 1 },
  binderResultCell: {
    width: CELL_SIZE,
    alignItems: "center",
    marginBottom: spacing.sm,
    borderRadius: radii.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "transparent",
  },
  binderResultCellDeselected: { opacity: 0.35 },
  binderResultCellMedium: { borderColor: "#F59E0B" },
  binderResultImage: { width: CELL_SIZE, height: CELL_SIZE * 1.4, borderRadius: radii.sm },
  binderResultPlaceholder: { backgroundColor: t.surface, alignItems: "center", justifyContent: "center" },
  binderResultPlaceholderText: { fontSize: 24, color: t.textSecondary },
  binderResultName: { ...typography.caption, color: t.text, paddingHorizontal: 2, marginTop: 2 },
  addAllBtn: {
    backgroundColor: tc.primary,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  addAllBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  clearBtn: {
    alignItems: "center",
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  clearBtnText: { ...typography.body, color: t.textSecondary },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  fallbackTitle: { ...typography.heading, color: t.text, marginBottom: spacing.sm },
  fallbackSubtitle: { ...typography.body, color: t.textSecondary, textAlign: "center" },
});
```

> **Note on PNG decoding (`decodePngBase64ToRGBA`):** The stub above returns a grey fill — it will not produce meaningful hashes until replaced with a proper PNG decoder. In Step 8.2 below, install `fast-png` and replace the stub.

- [ ] **Step 8.2: Install fast-png and fix PNG decoder**

```bash
cd apps/mobile && npm install fast-png
```

Then replace the `decodePngBase64ToRGBA` function in `ScannerTab.tsx` with:

```ts
function decodePngBase64ToRGBA(base64: string, _width: number, _height: number): Uint8Array | null {
  try {
    const { decode } = require("fast-png");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const decoded = decode(bytes);
    // fast-png returns { data: Uint8Array, width, height, channels }
    if (decoded.channels === 4) return new Uint8Array(decoded.data.buffer);
    // Convert RGB to RGBA
    const rgba = new Uint8Array(decoded.width * decoded.height * 4);
    for (let i = 0; i < decoded.width * decoded.height; i++) {
      rgba[i * 4] = decoded.data[i * 3]!;
      rgba[i * 4 + 1] = decoded.data[i * 3 + 1]!;
      rgba[i * 4 + 2] = decoded.data[i * 3 + 2]!;
      rgba[i * 4 + 3] = 255;
    }
    return rgba;
  } catch {
    return null;
  }
}
```

- [ ] **Step 8.3: Verify TypeScript compiles**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: No type errors (warnings about `any` are acceptable).

- [ ] **Step 8.4: Commit**

```bash
git add apps/mobile/src/screens/tabs/ScannerTab.tsx apps/mobile/src/scanner apps/mobile/package.json apps/mobile/package-lock.json
git commit -m "feat(mobile): frame processor single scan + 9x9/12x12 binder scan with dual-hash"
```

---

## Task 9: Wire up hash download in app startup

**Files:**
- Modify: `apps/mobile/src/screens/MainApp.tsx` (or wherever `downloadCardBundle` is currently called)

- [ ] **Step 9.1: Find where downloadCardBundle is called**

```bash
grep -r "downloadCardBundle\|downloadHashBundle\|runFullSync" apps/mobile/src --include="*.ts" --include="*.tsx" -l
```

- [ ] **Step 9.2: Add downloadHashBundle call after card bundle**

In the file found above, add `downloadHashBundle` immediately after `downloadCardBundle`:

```ts
import { downloadCardBundle, downloadHashBundle } from "../lib/sync";

// Inside the startup / onMount sequence:
await downloadCardBundle(onProgress);
await downloadHashBundle(); // download hash index after cards
```

- [ ] **Step 9.3: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): trigger hash index download on app startup"
```

---

## Task 10: Push branch + update PR

- [ ] **Step 10.1: Push all commits**

```bash
git push
```

- [ ] **Step 10.2: Update PR description**

```bash
gh pr edit 19 --body "$(cat <<'EOF'
## Summary

- Adds dual-hash (dHash + pHash) perceptual image matching pipeline
- Single card scan: VisionCamera frame processor at 30fps, <100ms confirmation via ring buffer consensus
- Binder scan: 9×9 (81 cards) and 12×12 (144 cards) via grid-cell hash lookup
- Foil + special art handled via separate foilDHash/foilPHash columns
- Hash index downloaded alongside card bundle, loaded lazily on scanner open
- OCR kept as fallback when hash fails after 8 frames

## Changes by package

- `packages/engine/src/hashing/` — pure TS dHash, pHash, HashIndex (tested)
- `apps/api/prisma/schema.prisma` — dHash/pHash columns on CardVariant
- `apps/api/src/jobs/scryfallIngest.ts` — hash computation via sharp during ingest
- `apps/api/src/index.ts` — GET /v1/bundles/:game/hashes endpoint
- `apps/mobile/src/lib/localDb.ts` — hash_index table + helpers
- `apps/mobile/src/lib/sync.ts` — downloadHashBundle
- `apps/mobile/src/scanner/` — hashUtils.ts, HashIndex.ts
- `apps/mobile/src/screens/tabs/ScannerTab.tsx` — full rewrite

## Expected outcomes

| Metric | Before | After |
|---|---|---|
| Single scan latency | ~800ms | <100ms |
| Auto-confirm rate (non-foil) | ~70% | ~97% |
| Auto-confirm rate (foil) | ~40% | ~92% |
| Binder scan | Non-functional at 9×9+ | 81–144 cards in 2–5s |
| Offline capability | Partial | Full |

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| dHash + pHash algorithms | Task 1 |
| foilDHash + foilPHash storage | Tasks 2, 3, 5 |
| Hash index API endpoint | Task 4 |
| Mobile hash_index table | Task 5 |
| Hash bundle download | Tasks 6, 9 |
| Lazy-load into memory on scanner open | Task 8 (ensureHashIndexLoaded) |
| Frame processor single scan | Task 8 |
| Ring buffer consensus (3 of 8 frames) | Task 8 |
| OCR fallback | Task 8 (triggerOcrFallback) |
| Viewfinder overlay states | Task 8 (overlayState) |
| 9×9 and 12×12 binder scan | Task 8 (captureBinderPage) |
| Parallel batch cell processing | Task 8 (BATCH = 9, Promise.all) |
| Empty slot detection | Task 8 (isEmptySlot) |
| Results grid with select/deselect | Task 8 |
| Batch LedgerEvent insert | Task 8 (addSelectedBinderCards) |

All spec sections covered. No gaps.
