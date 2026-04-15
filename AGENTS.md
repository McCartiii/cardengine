# AGENTS.md

## Cursor Cloud specific instructions

### Repository overview
Card Engine is an MTG (Magic: The Gathering) collection management platform. It is an npm workspaces monorepo with:
- `apps/api` — Fastify REST API (port 3001)
- `apps/web` — Next.js 16 web app (port 3000)
- `apps/mobile` — Expo/React Native (separate `npm install`, not in root workspaces)
- `packages/engine` — Core card engine library
- `packages/mtg-adapter` — MTG-specific adapter (depends on engine)

### Running services

See `package.json` root scripts. The standard commands are:
- `npm run dev:api` — starts the API (tsx watch mode)
- `npm run dev:web` — starts the Next.js dev server
- `npm run build:packages` — builds engine + mtg-adapter (must run before API)
- `npm run db:generate` — generates Prisma client (must run before API)
- `npm test` — runs all Vitest tests

### Database
The API auto-falls back to embedded PGlite when `DATABASE_URL` is not set (or `USE_PGLITE=true`). PGlite auto-applies Prisma migrations from `apps/api/prisma/migrations/`. No external Postgres is needed for local dev.

### Environment files
- `apps/api/.env` — set `USE_PGLITE=true` and disable auto-ingest/price-refresh/watchlist jobs for local dev without external services.
- `apps/web/.env` — set `NEXT_PUBLIC_API_URL=http://localhost:3001`. Supabase keys are optional (auth features require them, but standalone pages like Life Counter work without).

### Build order (one-time, before first `dev:api`)
1. `npm run db:generate`
2. `npm run build:packages`

### Lint
Only the web app has a lint script: `npm run lint -w apps/web` (ESLint 9). There are pre-existing warnings/errors in the codebase that are not caused by environment setup.

### Testing
`npm test` runs Vitest across all workspaces (currently 3 test files, 28 tests). Tests do not require any external services.

### Gotchas
- The API tries to run background jobs (Scryfall ingest, price refresh, watchlist alerts, meta snapshots) on boot. Disable them via env vars (`AUTO_INGEST_ON_EMPTY=false`, `ENABLE_PRICE_REFRESH=false`, `ENABLE_WATCHLIST_CHECK=false`, `ENABLE_META_SNAPSHOT=false`) for faster startup.
- `apps/mobile` is NOT in the npm workspaces array. It has its own `package-lock.json` and needs a separate `npm install` if you want to work on mobile.
- Prisma client is generated into `apps/api/src/generated/prisma` — if you see import errors from `./generated/prisma/client.js`, re-run `npm run db:generate`.
