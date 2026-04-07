# Scanner Redesign — Dual-Hash Single Scan + Binder Batch Scan

**Date:** 2026-04-01  
**Scope:** `apps/mobile`, `packages/engine`, `apps/api`

---

## Goal

Replace the current OCR-based scanner with a perceptual hash pipeline that delivers:
- Sub-100ms single card recognition via live frame processor
- Reliable foil and special-art matching via dual-hash (dHash + pHash)
- 9×9 and 12×12 binder batch scan in 2-5 seconds
- Fully offline after initial hash index download

---

## Architecture

```
apps/api
  scryfallIngest.ts     — compute dHash + pHash per variant, store on CardVariant
  GET /v1/bundles/mtg/hashes  — serve { variantId, dHash, pHash }[] with cursor pagination

packages/engine  (new hashing/ module)
  dhash.ts              — computeDHash(pixels: Uint8Array, w, h): bigint
  phash.ts              — computePHash(pixels: Uint8Array, w, h): bigint
  HashIndex.ts          — load(rows), lookup(dHash, pHash, threshold): HashLookupResult

apps/mobile
  localDb.ts            — hash_index table (variantId, dHash, pHash)
  sync.ts               — download hashes alongside card bundle
  ScannerTab.tsx        — frame processor single scan + binder grid scan UI
```

---

## Hash Algorithms

### dHash (difference hash)
1. Resize image to 9×8 pixels (grayscale)
2. For each row, compare adjacent pixels left→right: 1 if left > right, else 0
3. Result: 64-bit integer

Fast, pixel-level, good for clean artwork. Sensitive to foil shimmer.

### pHash (perceptual hash via DCT)
1. Resize image to 32×32 pixels (grayscale)
2. Apply 2D Discrete Cosine Transform
3. Take top-left 8×8 frequency coefficients (64 values)
4. Threshold at median → 64-bit integer

Frequency-domain, naturally tolerant of brightness/color shifts from foiling.

### Lookup strategy
```
1. dHash lookup, Hamming distance ≤ 8   → high confidence, auto-confirm
2. pHash lookup, Hamming distance ≤ 12  → medium confidence, auto-confirm
3. Neither matches across 8 frames      → confirmation prompt (show top 3 candidates)
```

### Hamming distance
```ts
function hammingDistance(a: bigint, b: bigint): number {
  return popcount(a ^ b);
}
```
~microseconds per comparison. 30k comparisons = <5ms total.

---

## Hash Index — Storage & Sync

### API
- New columns on `CardVariant`: `dHash TEXT`, `pHash TEXT` (hex strings)
- Populated by `scryfallIngest.ts`: fetch image → resize → compute → store
- Both non-foil and foil image URIs hashed separately where Scryfall provides them
- Endpoint: `GET /v1/bundles/mtg/hashes?cursor=&limit=2000`
  - Returns `{ items: [{ variantId, dHash, pHash, foilDHash?, foilPHash? }], hasMore, nextCursor }`

### Mobile
- New SQLite table:
  ```sql
  CREATE TABLE hash_index (
    variantId TEXT PRIMARY KEY,
    dHash TEXT NOT NULL,
    pHash TEXT NOT NULL,
    foilDHash TEXT,
    foilPHash TEXT
  );
  ```
- Download triggered by `downloadAndStoreBundle`, runs after card data
- ~30k rows × ~60 bytes = ~1.8MB on disk
- Lazy-loaded into `Map<string, { dHash: bigint, pHash: bigint, foilDHash?: bigint, foilPHash?: bigint }>` (~3MB RAM) on first scanner open, not blocking app startup
- Refreshes on same 24hr cadence as card bundle

---

## Single Card Fast Scan

### Frame processor (replaces takePhoto polling)
VisionCamera frame processor runs on camera native thread at 30fps. No JS bridge overhead.

```
Per frame:
  1. Detect card rectangle (aspect ratio 0.716 ± 0.05, min area 20% of frame)
  2. If no card detected → skip
  3. Crop to card bounds
  4. Downscale to 9×8 (for dHash) and 32×32 (for pHash)
  5. Compute dHash + pHash
  6. Post both hashes to JS thread via Reanimated shared value
```

### JS thread match loop
```
On new hash received:
  1. Lookup dHash in HashIndex (threshold ≤ 8)
  2. If no match, lookup pHash (threshold ≤ 12)
  3. Push result into ring buffer (last 8 frames)
  4. If 3 of last 8 frames agree on same variantId → auto-confirm
  5. If 8 frames with no consistent match → show hint "adjust card angle"
```

### Auto-confirm
- Vibrate (50ms)
- Add to session list (or increment quantity if same card)
- Lock for 1.5s to prevent double-scan
- Green flash on viewfinder overlay

### Foil handling
- Foil image URI hashed separately → stored as `foilDHash` and `foilPHash` columns on the same row
- dHash tolerates minor shimmer; pHash tolerates color shift
- Multi-frame (best of 8) catches frames where glare angle moves off artwork
- Expected auto-confirm rates:
  - Non-foil: ~97%
  - Special art (showcase, borderless, extended): ~97%
  - Foil (standard lighting): ~92%
  - Heavy glare / damaged: ~75% → confirmation prompt

### Fallback
If both hashes fail across all 8 frames: fall back to existing OCR path (ML Kit text recognition). Shown as "trying text match..." hint in UI. Same auto-confirm threshold applies.

### Viewfinder overlay states
| State | Overlay color | Label |
|---|---|---|
| No card detected | White dashed | "Point at a card" |
| Card detected, accumulating | Blue solid | (confidence fill animation) |
| Confirmed | Green flash | Card name appears |
| Low confidence | Amber | "Adjust angle" |
| OCR fallback | Grey | "Trying text match..." |

---

## Binder Scan (9×9 and 12×12)

### User flow
1. Tap "Binder" in mode selector
2. Choose grid: 9×9 (81 cards) or 12×12 (144 cards)
3. Grid overlay on viewfinder — align binder page to fit inside
4. Tap capture button
5. Progress indicator while cells process (~2-3s for 9×9, ~4-5s for 12×12)
6. Results bottom sheet opens progressively
7. Review, deselect wrong matches, tap "Add X Cards"

### Image capture
- `qualityPrioritization: "quality"` — full resolution needed for reliable cell crops
- Single photo, no burst

### Cell processing
```
1. Divide photo into N×N cells (pixel math, no ML)
2. For each cell:
   a. Detect if empty (≥80% of pixels within 30 brightness units of each other → skip)
   b. Crop cell image via expo-image-manipulator
   c. Compute dHash + pHash
   d. Lookup in HashIndex
3. Process in parallel batches of 9
4. Emit results progressively as batches complete
```

### Empty slot detection
Binder pages have empty pockets. Cells that are mostly uniform color (blank plastic/white) are skipped and not shown in results — avoids false matches.

### Per-cell confidence states
| State | Display |
|---|---|
| dHash ≤ 8 | Card image + name, pre-selected, no border |
| pHash ≤ 12 | Card image + name, pre-selected, amber border |
| No match | Grey "?" cell, tap → manual name search |
| Empty slot | Hidden from results |

### Results UI
- Bottom sheet (drag up) with scrollable 3-column grid
- Each cell: card image thumbnail, name, set icon
- Tap cell to deselect (grey out)
- Tap "?" cell → name search modal
- Footer: "Add X cards" button + estimated session value
- "Select all" / "Deselect all" controls

### Add to collection
- Confirmed cards added as `LedgerEvent` with `source: "binder_scan"`
- Batch insert, single DB transaction
- Session persists until user taps "Clear" or switches mode

---

## What Does Not Change

- `LedgerEvent` shape and `materializeHoldings` — unchanged
- Existing OCR pipeline — kept as fallback for single scan
- Card bundle download cadence and structure — hash download piggybacks
- `MtgRulesEngine`, deck validation, pricing — untouched

---

## Out of Scope

- ML-based image classifier (future: would push foil accuracy to ~98%)
- Token scanning
- Double-faced card back recognition (future: store back-face hash)
- Non-MTG games (Pokemon, Lorcana) — same pipeline applies but needs separate hash index per game

---

## Expected Outcomes

| Metric | Before | After |
|---|---|---|
| Single scan latency | ~800ms | <100ms |
| Single scan auto-confirm rate (non-foil) | ~70% | ~97% |
| Single scan auto-confirm rate (foil) | ~40% | ~92% |
| Binder scan | Not functional at 9×9+ | 81-144 cards in 2-5s |
| Offline capability | Partial (fallback only) | Full |
