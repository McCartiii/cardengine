# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

CardEngine is an MTG collection management and deck-building platform. It is an npm workspaces monorepo with:

| Package | Path | Description |
|---------|------|-------------|
| `@cardengine/api` | `apps/api` | Fastify REST API (port 3001) |
| `@cardengine/web` | `apps/web` | Next.js web frontend (port 3000 in dev) |
| `@cardengine/engine` | `packages/engine` | Shared core logic library |
| `@cardengine/mtg-adapter` | `packages/mtg-adapter` | MTG-specific adapter |
| `@cardengine/mobile` | `apps/mobile` | Expo/React Native mobile app (not in npm workspaces) |

### Running services

- **API**: `npm run dev:api` — starts on port 3001. Falls back to PGlite (embedded Postgres) when `DATABASE_URL` is absent. No external DB required for local dev.
- **Web**: Run on port 3000 to avoid collision with API: `cd apps/web && npx next dev -p 3000`. The `npm run dev:web` script uses `-p 3001` which conflicts with the API.
- **Shared packages must be built before running API/Web**: `npm run build:packages` (builds engine then mtg-adapter).
- **Prisma client must be generated before running API**: `npm run db:generate`.

### Environment files

- `apps/api/.env` — Set `USE_PGLITE=true` and disable background jobs (`AUTO_INGEST_ON_EMPTY=false`, `ENABLE_PRICE_REFRESH=false`, `ENABLE_WATCHLIST_CHECK=false`) for local dev without Supabase.
- `apps/web/.env.local` — Set `NEXT_PUBLIC_API_URL=http://localhost:3001`. Supabase keys are needed for auth but placeholder values allow the app to load.

### Lint

- Web: `npm run lint --workspace=apps/web` (Next.js ESLint). Requires `eslint-config-next` installed in the web workspace.
- No root-level lint script exists; ESLint 9 is installed at root for TypeScript linting.

### Tests

- `npx vitest run` at root. Vitest is configured but no test files exist yet in the repository.

### Key gotchas

- Node.js 20.19.0 is required (`.nvmrc`). Use `nvm use 20.19.0`.
- The `.npmrc` sets `legacy-peer-deps=true`.
- The API's `/dev/seed` endpoint (POST) creates sample data for local testing. Only available in non-production mode.
- The web app and API both default to port 3001 — run the web app on port 3000 to avoid conflicts.
