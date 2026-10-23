---
paths:
  - "apps/mobile/src/scanner/**/*"
  - "apps/mobile/src/hooks/useCardScanner.ts"
  - "apps/mobile/src/lib/localDb.ts"
  - "apps/mobile/src/lib/sync.ts"
  - "apps/web/src/app/scan/**/*"
  - "packages/engine/src/hashing/**/*"
  - "packages/mtg-adapter/src/scanner/**/*"
  - "apps/api/src/jobs/scryfallIngest.ts"
  - "apps/api/src/routes/cards.ts"
---

# Scanner

Mobile matching is perceptual hashes, not OCR. Ingest stores dHash, pHash, and foil hashes on `CardVariant` using `sharp`. The phone downloads `GET /v1/bundles/mtg/hashes` into SQLite and matches in `apps/mobile/src/scanner/HashIndex.ts` from the Vision Camera frame processor.

Web `/scan` is still Tesseract OCR, then Dexie, then `POST /v1/scan/identify`. Do not describe the web scanner as hash-based.

`packages/engine` owns the shared hash functions. The mobile worklet cannot import that package, so `apps/mobile/src/scanner/` is a deliberate copy. If you change a hash bit layout or Hamming cutoff, change both and extend `packages/engine/test/hashing.test.ts`.

`packages/mtg-adapter` `runScanPipeline` is not the production mobile or web path on `main`. Open PR #26 starts the unification.

Binder batch scan and sub-100ms local match are the product bar from `docs/superpowers/specs/2026-04-01-scanner-redesign.md`. Report bad matches through `POST /v1/telemetry/scanner-mismatch`.
