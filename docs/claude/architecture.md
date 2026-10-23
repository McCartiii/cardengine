# Architecture

Snapshot of `main`. Paths are relative to the repo root.

## Layout

| Path | Role |
| --- | --- |
| `apps/api` | `@cardengine/api`. Fastify 5, Prisma 7.4, Postgres or PGlite. Workspace member. |
| `apps/web` | Next.js 16 App Router, React 19, Tailwind 4. Workspace member. |
| `apps/mobile` | Expo 52, React Native 0.76, expo-router. Separate `package-lock.json`. Not a workspace member. |
| `packages/engine` | Game-agnostic ledger, search, pricing rollups, dHash/pHash `HashIndex`. |
| `packages/mtg-adapter` | Format bundles, `MtgRulesEngine`, deck stats, scan pipeline. Depends on engine. |

Root `package.json` workspaces are `apps/api`, `apps/web`, and `packages/*`. `apps/web/next.config.ts` transpiles the two packages. App code on `main` does not import them yet. Mobile hash matching and API deck legality are local copies. `packages/engine` is still the place new shared hashing should land; `packages/mtg-adapter` is the place new format legality should land.

## API

`apps/api/src/index.ts` loads env, builds Fastify with CORS `origin: true`, and a global rate limit of 100 requests per minute keyed on the first `X-Forwarded-For` hop. It waits for `dbReady`, listens on `PORT` (default 3001) and `HOST` (default `0.0.0.0`), then starts background jobs.

Route modules in `apps/api/src/routes/`:

| Module | What it owns |
| --- | --- |
| `cards.ts` | Card detail, search, `POST /v1/scan/identify`, deck URL import, card bundles |
| `collection.ts` | Collection events, holdings, collection value, batch prices |
| `market.ts` | `GET /v1/market/home`, `GET /v1/prices/status` |
| `decks.ts` | Deck CRUD, sharing, inline legality |
| `deckAdvisor.ts` | Suggestions, swaps, EDHREC, one-shot `POST /v1/ai/deck-advice` |
| `deckAgent.ts` | `POST /v1/deck/agent` SSE, 10 requests per minute |
| `watchlist.ts` | Alerts, push tokens, notifications |
| `profile.ts` | Profile |
| `localScene.ts` | Shops, Google Places when `GOOGLE_PLACES_API_KEY` is set |
| `telemetry.ts` | Scanner and rules-disagreement telemetry |
| `admin.ts` | Admin stats, ingest trigger, ban, non-production `/dev/seed` |

`index.ts` also serves `GET /health` and cursor-paginated `GET /v1/bundles/:game/hashes` for the mobile hash bundle.

Jobs in `apps/api/src/jobs/`: Scryfall ingest and perceptual hashes (`scryfallIngest.ts`), MTGJSON prices (`mtgjsonPriceRefresh.ts`), watchlist checks, meta scrape (`metaSnapshotJob.ts`), and leases (`leaderLock.ts`).

## Data

Prisma schema: `apps/api/prisma/schema.prisma`. Generated client output is gitignored at `apps/api/src/generated/`.

| Model | Meaning |
| --- | --- |
| `User` | Profile. `id` is the Supabase auth user id. |
| `CardVariant` | One printing. Oracle fields, `mtgjsonUuid`, dHash/pHash and foil hashes. |
| `CollectionEvent` | Append-only add/remove ledger with a JSON payload. |
| `PricePoint` | History row. `source` is `scryfall` or `mtgjson`. |
| `PriceCache` | Latest quote for `(market, variantId, kind, currency)`. |
| `PriceStage` | Rows for one MTGJSON promotion run. |
| `JobLease` | One row per background job name. |
| `WatchlistEntry`, `Notification`, `PushToken` | Alerts. |
| `Deck`, `DeckCard` | Saved decks. A deck card may have no `variantId`. |
| `Shop` | Store directory. |
| `EdhrecCache` | EDHREC JSON keyed by commander. |
| `ScannerMismatch`, `RulesDisagreement` | Telemetry. |
| `MetaSnapshot` | Scraped meta JSON per format and bracket. |
| `AgentSession` | Deck-agent messages and context. |

`apps/api/src/db.ts` uses Postgres via `@prisma/adapter-pg` when `DATABASE_URL` connects. SSL uses `rejectUnauthorized: false`. Otherwise it uses PGlite and applies `apps/api/prisma/migrations/*/migration.sql` when the `User` table is missing.

## Web routes

Pages under `apps/web/src/app/`: `/` (marketing plus `HomeMarket`), `/collection`, `/card/[variantId]`, `/cards/[id]`, `/scan`, `/deck`, `/deck/discover`, `/decks`, `/decks/[id]`, `/decks/[id]/share`, `/watchlist`, `/map`, `/shops`, `/life`, `/profile`, `/settings`, `/login`, `/register`, `/admin`.

Next route handlers: `app/api/architect/route.ts`, `app/auth/callback/route.ts`. Supabase session refresh is in `apps/web/middleware.ts`. `AuthProvider` must stay in the root layout; removing it drops the API access token (fixed in `fa1d427`, then briefly reverted and restored on 2026-04-08).

## Mobile

Expo Router screens live in `apps/mobile/app/`. Tabs include home, browse, collection, decks, life, profile, shops, and watchlist. Older screen components also exist under `apps/mobile/src/screens/`. The life counter that matches the April 2026 redesign is the Expo Router life tab plus `src/screens/life/` and `src/store/lifeStore.ts`.

Offline cards and the hash index are SQLite (`src/lib/localDb.ts`, `src/lib/sync.ts`). The hash bundle comes from `GET /v1/bundles/mtg/hashes`.

## External services

| Env | Use |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | API auth check |
| `SUPABASE_ANON_KEY` | Present in the API example; web and mobile use the `NEXT_PUBLIC_` / `EXPO_PUBLIC_` anon keys |
| `DATABASE_URL`, `DIRECT_URL` | Postgres pooler and direct connection |
| `ANTHROPIC_API_KEY` | Deck agent, one-shot advice, and the web architect route |
| `TAVILY_API_KEY` | Deck-agent `search_web`. Missing key makes that tool a no-op |
| `GOOGLE_PLACES_API_KEY` | Shop search. Missing key makes live place search return empty or 503 |
| `ADMIN_USER_IDS` | Admin allow-list |
| `ENABLE_PRICE_REFRESH`, `ENABLE_WATCHLIST_CHECK`, `ENABLE_META_SNAPSHOT`, `AUTO_INGEST_ON_EMPTY` | Set to `false` to disable. Default is on |
| `PRICE_REFRESH_INTERVAL_MS` | Price job interval. Default 24h. Values under 60s are ignored |
| `SET_CODE`, `MAX_CARDS`, `SKIP_HASHES` | Scryfall ingest |

Web talks to the API with `NEXT_PUBLIC_API_URL`. Mobile uses `EXPO_PUBLIC_API_URL` (LAN IP for a device, not `localhost`).

## Deploy

| Target | How |
| --- | --- |
| API on Railway | Railpack, `railway.json`. Build: `npm ci && npm run build:packages && npm run build:api`. Start: `npx prisma db push --config apps/api/prisma.config.ts && node apps/api/dist/index.js`. Health: `/health`. |
| API Docker | `Dockerfile.api`, repo-root context, Node 22 Alpine, `CMD node dist/index.js` from `apps/api`. Railway moved off this path after Metal builder cache corruption (2026-08-20). |
| Web on Vercel | `apps/web/vercel.json`. |
| Web Docker | `Dockerfile.web`, `next start` on `PORT` or 3000. |

`.dockerignore` drops `node_modules`, build output, `pglite-data`, `apps/api/src/generated`, `docs`, and `*.md` except `README.md`. It must keep `apps/web/package.json` visible. Ignoring all of `apps/web` broke Railpack (PR #31).

## Tests

`npm test` runs Vitest 4 from the root. There is no root `vitest.config.ts` on `main`, so discovery is the default `*.test.ts` search. Current tests:

- `apps/api/src/lib/pricing.test.ts`
- `apps/api/src/jobs/mtgjsonPriceRefresh.test.ts`
- `apps/api/src/services/deckAgentTools.test.ts`
- `apps/api/src/services/urlImport.test.ts`
- `packages/engine/test/hashing.test.ts`
- `apps/web/src/app/card/[variantId]/price-chart-helpers.test.ts`
- `apps/web/src/components/ui/ManaSymbols.test.ts`

Add a test next to the module you change when that module already has one.
