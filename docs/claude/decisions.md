# Decisions and change history

What we decided, and which later change replaced an earlier idea. Specs in `docs/superpowers/specs/` are the design conversations. This file says what the code actually does. Dates below are the commit dates on `main`.

## Product shape

Card Engine is one account across web and mobile: collection, prices, deck building, a card scanner, a life counter, local game stores, and price alerts. The visual target for the web app is a dark "Sapphire + Five-Jewel" UI, written down in the header of `apps/web/src/app/globals.css`:

- Surfaces `#050508`, `#0D0D12`, `#14161D`, border `#1E202B`
- Sapphire `#4E93C8`, hover `#6BAADB`
- Jewels gold `#E8B24A`, sapphire `#3E7CA8`, amethyst `#6E5A82`, garnet `#C24667`, emerald `#2FA98C`
- Type: Space Grotesk for UI, JetBrains Mono for prices and counts

The 2026-04-04 spec (`docs/superpowers/specs/2026-04-04-design-system-visual-polish-design.md`) proposed Adaptive Depth (mana-tinted containers), Cinzel + Geist Sans + Geist Mono, and equal light and dark themes. The shipped web theme is the sapphire token set above, dark, with Space Grotesk and JetBrains Mono. Mana-tinted containers exist as an idea in that spec and in some card chrome; `globals.css` is the source of truth for new web UI. Mobile life-counter chrome uses teal `#0D9488` (`apps/mobile/src/lib/lifeConstants.ts`) and was specified separately from the web sapphire theme.

Homepage market (featured best-price chart, movers, new printings, popular cards) plus the sapphire restyle shipped in PR #35 (2026-08-21 / 2026-09-06 commit `8936c37`). The public landing hero before that was a navy and cyan split with floating cards (`f0c144d`, 2026-04-12).

## Pricing

This is the most expensive set of bugs we have already paid for. The pipeline lives in `apps/api/src/lib/pricing.ts`, `apps/api/src/jobs/mtgjsonPriceRefresh.ts`, `apps/api/src/jobs/leaderLock.ts`, `apps/api/src/routes/cards.ts`, `apps/api/src/routes/collection.ts`, and `apps/api/src/routes/market.ts`.

MTGJSON `AllPricesToday.json.gz` is the daily multi-provider snapshot (TCGPlayer, Cardmarket, Card Kingdom, Mana Pool, and others). Scryfall is the catalog, the live card-detail quote, and the fallback for printings that have no `mtgjsonUuid`.

Finish model:

- Retail kinds are `market` (nonfoil), `foil`, and `etched`. Buylist kinds are `buylist-` plus the retail kind.
- `preferredPriceKind`: a `variantId` ending in `-foil` prefers `foil`; every other id prefers `market`.
- Collection value uses the holding's `finish` when it is present (`priceKindForHolding`). An unknown finish falls back so the holding still has a value.
- `finishForPriceKind` maps a kind back to `nonfoil`, `foil`, or `etched` for API responses.

Import and promotion, in order, from the September 2026 fixes (#36–#41):

1. Map Scryfall printings that have a `setId` and no `mtgjsonUuid` by reading per-set MTGJSON files. Updates go out in batches of 2000.
2. Skip the daily download when `HEAD` `Last-Modified` is not newer than the latest `mtgjson` `PricePoint` and there is nothing new to map.
3. Stream the gzip body through `stream-json`. Buffering the whole snapshot exhausted memory (#36).
4. Expand each uuid into paper retail and buylist rows for normal, foil, and etched. Stage them in `PriceStage` under one `runId`.
5. Refuse to promote a bad file: snapshot date must be `YYYY-MM-DD`, at least 50,000 feed entries, each of tcgplayer, cardmarket, cardkingdom, and manapool must contribute at least 10,000 points, and staged prices must cover at least 25% of mapped variants. A failed run deletes its `PriceStage` rows in a `finally`.
6. Promote in batches of 2000. Each batch is one SQL statement that upserts `PriceCache` (`source: mtgjson`), upserts `PricePoint` ids prefixed `pp-mtgjson-`, and deletes those staged rows. One statement stays under hosted Postgres statement timeouts and keeps cache, history, and staging in step (#39, #40).
7. After the batches succeed, delete stale `PriceCache` rows with `source = mtgjson` whose `updatedAt` is older than the promotion start. Doing that sweep earlier wiped good cache when promotion failed partway.
8. On every price cycle, including after a thrown MTGJSON error, `refreshScryfallFallbackPrices` updates variants that still have no `mtgjsonUuid`.

Live Scryfall quotes must not clobber MTGJSON. The card-detail upsert is `ON CONFLICT ... DO UPDATE ... WHERE "PriceCache"."source" <> 'mtgjson'` (`apps/api/src/routes/cards.ts`). Fresh Scryfall quotes also write daily `pp-live-*` history points so a chart can reach today when the daily snapshot is behind.

Charts dedupe history per day, market, kind, and currency, and prefer `mtgjson` over `scryfall` for the same key. The series then extends with the latest `PriceCache` quote. The card page is finish-first: the selected finish chooses the series (#41, #43). Hover tracking interpolates along the line with a smoothstep (`apps/web/src/app/card/[variantId]/price-chart-helpers.ts`) and the line itself is a cubic path (#44). The dotted crosshair was removed (#45, 2026-09-17). Card detail must show every finish's price and must render mana symbols (#42).

`GET /v1/market/home` sparklines use the last 30 days of TCGPlayer USD `mtgjson` points filtered by `preferredPriceKind`. The top-movers query still filters `kind = 'market'` only, so foil-only movement is missing from that list.

Leases (`leaderLock.ts`): one `JobLease` row per job (`priceRefresh`, `watchlistCheck`, `metaSnapshot`). The lease lasts 3 hours. A heartbeat every 5 minutes extends `expiresAt`, and Prisma's `@updatedAt` bumps `updatedAt`. Another instance may take the row when `expiresAt` has passed or `updatedAt` is older than 15 minutes. That second clause is what recovers a dead process whose expiry is still in the future (#37). The heartbeat has to keep writing or a healthy long import will be stolen. The lock is a single statement, so it works through the Supabase pooler. PGlite skips the lock.

The price job runs about 5 seconds after boot and then on `PRICE_REFRESH_INTERVAL_MS` (default 24h). Railway restarts often enough that an interval alone can miss the daily file. A comment in `apps/api/src/index.ts` records that.

Catalog size: do not download the full Scryfall catalog when the collection page loads (#33). A new set should sync through `SET_CODE=... npm run ingest:set` (or Admin → Sync set), which is the fast per-set path from #34. Card detail must return from data we already have when Scryfall is slow; the page used to hang on that fetch (#32). `AUTO_INGEST_ON_EMPTY` (default on) starts a bulk ingest when `CardVariant` count is 0, under the `priceRefresh` lease.

## Deck AI

Approved spec: `docs/superpowers/specs/2026-04-06-deck-ai-overhaul-design.md`. The `/deck` builder follows it.

Modes come from the prompt (`detectMode` in `deckAgentPrompts.ts`). No deck means build. A deck plus upgrade language means upgrade. Otherwise modify. The spec's escalation rule: if a modify request would touch more than about 30% of the deck, the agent should say so and ask before a full rebuild. Bracket slider is RC 1–5 (Exhibition through cEDH). Budget slider caps recommendations and cuts. Deck input is a paste, a saved deck, or a Moxfield / Archidekt / MTGGoldfish URL imported before the run.

`POST /v1/deck/agent` uses `claude-opus-4-6`, at most 10 tool rounds, and SSE. Tools in `deckAgentTools.ts`: `fetch_edhrec`, `search_web` (Tavily), `get_meta_snapshot`, `get_card_details`, `get_collection`. The web client parses `STATUS:`, `TIER:`, `CARD:`, `CUT:`, and `ADD:` lines. `AgentSession` stores the Anthropic messages. Streaming tokens during tool use, and dropping filler narration, was an explicit speed choice (`d5d3fa7`, 2026-04-11). Follow-ups trim history, run independent tools in parallel, and stop at 4 rounds in the prompt path that commit describes (`c5f4c77`).

The deck detail page spec (`docs/superpowers/specs/2026-04-10-deck-detail-page-design.md`) asked for three tabs: Cards, Advisor, and AI Architect. On 2026-04-12 we merged Advisor and AI Architect into one Advisor tab (`5ef7646`). `AIArchitectTab.tsx` is that tab. It calls the Next route `apps/web/src/app/api/architect/route.ts`, model `claude-haiku-4-5-20251001`, tools `scryfall_search`, `scryfall_get_card`, and `edhrec_recommendations` (proxied to `/v1/deck/recs`). Haiku was chosen over Opus for that tab so replies stay fast (`bd8d479`). It does not see Tavily, the meta snapshot, or the collection. `POST /v1/ai/deck-advice` is a third, smaller path: one Opus message and no tools.

Creating a deck should add the chosen commander into the deck list (`d57e760`). The new-deck flow is a two-step name and commander wizard.

EDHREC responses are cached on `EdhrecCache`. Meta snapshots are scraped into `MetaSnapshot` by `metaSnapshotJob.ts` (boot plus nightly, own lease).

## Decks, collection, and images

`docs/superpowers/specs/2026-04-08-deck-collection-perf-design.md` and its plan ask for a visual deck list (art fans), a real new-deck modal, manual add on the collection, and progressive Scryfall images (small, then normal). Pieces of that landed (`NewDeckWizard`, deck list work, `CardImage`). Treat the spec as the intended polish and check the component before assuming a behavior is finished. `CardImage` must not force `aspect-[5/7]` on every wrapper (`5121b05`); foil tilt is driven by a `foil-visible` class and JS pointer handlers (`b6a8599`).

Deck detail on `main` has `HeroBanner`, `DeckSidebar`, and `CardListPanel` (group, sort, view). Helpers are pure functions in `apps/web/src/app/decks/[id]/deck-helpers.ts`.

## Scanner

Spec: `docs/superpowers/specs/2026-04-01-scanner-redesign.md`. The decision was to stop using OCR as the primary mobile matcher. Match dHash and pHash locally, including foil hashes, in under 100ms, with a binder batch mode and an offline bundle.

What shipped:

- Ingest computes hashes with `sharp` and stores them on `CardVariant`.
- Mobile downloads `GET /v1/bundles/mtg/hashes` into SQLite and matches with `apps/mobile/src/scanner/HashIndex.ts` (Hamming on dHash, then pHash, including foil columns) from a Vision Camera frame processor.
- Web `/scan` is still Tesseract.js OCR, a Dexie offline fuzzy pass, then `POST /v1/scan/identify`.
- `packages/engine` hashing and `packages/mtg-adapter` `runScanPipeline` are the shared design. Mobile keeps its own hash code because the worklet cannot import the package. Unifying that is part of open PR #26, not `main`.

Mismatches can be reported to `POST /v1/telemetry/scanner-mismatch`.

## Life counter

Spec and plan: `docs/superpowers/specs/2026-04-11-life-counter-redesign.md` and `docs/superpowers/plans/2026-04-11-life-counter-redesign.md`. Scope was the mobile app. Decisions that shipped: setup for starting life 20/30/40/60, 2–6 players, chess clocks, poison and other counters, coin flip, elimination, and no emoji in the UI. Implementation is `lifeStore`, `SetupScreen`, `GameScreen`, `GameOverScreen`, `PlayerCard`, `CenterStrip`, `CounterDrawer`. Web `/life` is a separate browser counter and was not part of that spec.

## Auth and a crash we hit twice

`AuthProvider` has to wrap the root web layout or authenticated API calls go out without a token (`fa1d427`). A later commit removed it and we put it back the same day.

A duplicate `GET /v1/bundles/:game/count` registration crashed the API on boot (`1dafe36`). Do not register that path twice.

`??` mixed with `||` needs parentheses. That took down a route (`4a9da12`).

## Deploy lessons (2026-08-19 through 2026-08-20)

In order, so the next attempt does not repeat them:

- Vercel web and API deploys failed until the monorepo install and build commands were fixed (#25).
- Railway Docker builds failed on a stale Metal cache and a bad context (#27, #28). A comment in `Dockerfile.api` still says the cache was busted on 2026-08-20.
- Production API hosting is Railpack (`railway.json`), chosen so we would stop depending on that Docker cache (#29).
- `npm ci` on Railway fails when `package-lock.json` drifts from the API workspace (#30). Update the lockfile in the same commit as dependency edits.
- `.dockerignore` must not exclude `apps/web`. Railpack still needs that workspace `package.json` (#31).
- Prisma 7 needs Node `>=20.19`. Docker images use Node 22. Do not pin Nixpacks back to an older Node; that cycle already happened in February 2026 (PRs #5–#12).

## Legality

On `main`, deck legality is implemented inside `apps/api/src/routes/decks.ts`. `packages/mtg-adapter` has `MtgRulesEngine` and format bundles, and the two have drifted. Open PR #26 makes the adapter the only implementation and adds coverage for oathbreaker, brawl, historic, and explorer, plus commander bans, "any number" cards, snow basics, and a 100-card commander deck. Until that merges, a legality change has to be made in the route and checked against the adapter so they do not diverge further.

## Local development notes worth keeping

- `npm run dev:api` uses `tsx --watch`. The first boot with an empty catalog can start a Scryfall ingest. Set `AUTO_INGEST_ON_EMPTY=false` when you do not want that.
- `ENABLE_PRICE_REFRESH=false` avoids pulling MTGJSON during a UI session. The download is large.
- Admin user ids are Supabase auth UUIDs.
- Mobile devices cannot call `localhost` on the development machine. `EXPO_PUBLIC_API_URL` has to be a LAN address. Production mobile env belongs in `apps/mobile/eas.json` profiles.
