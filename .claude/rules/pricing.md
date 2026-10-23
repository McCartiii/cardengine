---
paths:
  - "apps/api/src/lib/pricing.ts"
  - "apps/api/src/jobs/mtgjsonPriceRefresh.ts"
  - "apps/api/src/jobs/leaderLock.ts"
  - "apps/api/src/routes/cards.ts"
  - "apps/api/src/routes/collection.ts"
  - "apps/api/src/routes/market.ts"
  - "apps/web/src/app/card/**/*"
  - "apps/web/src/components/home/**/*"
---

# Pricing

MTGJSON is the authoritative daily snapshot. Scryfall fills catalog identity, live quotes, and printings with no `mtgjsonUuid`.

- Keep the cache upsert guard `WHERE "PriceCache"."source" <> 'mtgjson'` on any Scryfall write to `PriceCache`. A Scryfall refresh must not replace a price MTGJSON already owns.
- Stream `AllPricesToday.json.gz`. Do not JSON.parse the whole file.
- Stage into `PriceStage`, validate (date, 50k entries, provider floors of 10k, 25% of mapped variants), then promote in batches of 2000. One SQL statement per batch covers cache upsert, history upsert, and staged-row delete.
- Sweep stale `source = mtgjson` cache rows only after promotion finishes. Delete the run's `PriceStage` rows in a `finally` when validation or download fails.
- `JobLease.updatedAt` is `@updatedAt`. The 15-minute reclaim depends on the 5-minute heartbeat actually writing. The lease TTL is 3 hours. Reclaim when expired or when `updatedAt` is older than 15 minutes.
- Kinds: `market` means nonfoil, plus `foil` and `etched`. Buylist kinds are prefixed `buylist-`. Variant ids ending in `-foil` prefer the foil quote. Collection value honors the holding finish.
- Chart series are per day, market, kind, and currency, preferring `mtgjson` over `scryfall`, then extended with the latest cache quote so the line reaches today. The card chart is finish-first, uses the cubic path and smoothstep hover interpolation, and has no dotted crosshair.
- `market.ts` top movers still restrict to `kind = 'market'`. Foil movement will not show up there until that query changes on purpose.
- Price refresh runs on boot and on an interval because Railway restarts. Leave that boot run in place.
