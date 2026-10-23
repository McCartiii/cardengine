# Card Engine

Magic: The Gathering companion: collection, prices, decks, scanner, life counter, shops, and a watchlist. The repo is `card-engine-platform` on GitHub (`McCartiii/cardengine`).

Claude Code loads this file every session. These imports load with it:

@docs/claude/architecture.md
@docs/claude/decisions.md

Setup steps for a person live in `docs/claude/README.md`. That file is not imported.

Path-scoped notes in `.claude/rules/` load when you read or edit a matching file. Follow them. They are shared project memory; keep them tracked in git.

## Commands

Node `>=20.19` (`.nvmrc` and `.node-version` are `20.19.0`). From the repo root:

```bash
npm ci
npm run db:generate
npm run dev:api          # Fastify on port 3001
npm run dev:web          # Next.js on port 3000
npm test                 # vitest run
npm run build:packages && npm run build:api && npm run build:web
```

Mobile is not an npm workspace. It has its own lockfile:

```bash
cd apps/mobile && npm install && npm start
```

Env templates: `apps/api/.env.example`, `apps/web/.env.example`, `apps/mobile/.env.example`. Copy them to ignored `.env` files. Never commit secrets. Personal Claude notes go in gitignored `CLAUDE.local.md`.

## Invariants

- API default port is **3001**. Web default port is **3000**. `NEXT_PUBLIC_API_URL` and `EXPO_PUBLIC_API_URL` point at the API. A few call sites still fall back to `http://localhost:3000` for the API; when you touch them, point the fallback at `3001`. Those files are `apps/web/src/app/decks/[id]/page.tsx`, `apps/web/src/app/decks/[id]/share/page.tsx`, `apps/web/src/components/NetworkError.tsx`, and `apps/mobile/src/hooks/usePushNotifications.ts`.
- Production Postgres is Supabase through the **transaction pooler** (`DATABASE_URL`, port 6543). `DIRECT_URL` is only for real migrations. With no reachable `DATABASE_URL`, the API falls back to PGlite under `apps/api/pglite-data`. `USE_PGLITE=true` forces that. Jobs skip `JobLease` when `DATABASE_URL` is unset, so two local API processes will both run jobs.
- Auth is a Supabase access token in `Authorization: Bearer`. `apps/api/src/middleware/auth.ts` checks it by calling `${SUPABASE_URL}/auth/v1/user` with `SUPABASE_SERVICE_ROLE_KEY` as `apikey`. `User.id` matches `auth.users`. `requireAuth` returns 403 when `User.banned` is set. Admin routes use the comma-separated `ADMIN_USER_IDS` list.
- Collection rows are an append-only `CollectionEvent` ledger. Price rows are `PricePoint` (history) plus `PriceCache` (latest). MTGJSON wins over Scryfall for a cache key it already owns. See `.claude/rules/pricing.md`.
- Railway production start runs `prisma db push` (`railway.json` and `apps/api` `npm start`, which also passes `--accept-data-loss`). Schema edits reach production through that push. Treat destructive schema changes as production data-loss risk.
- Web production build is `next build --webpack` (`apps/web/package.json`). Vercel installs from the monorepo root, then `build:packages` and `build:web` (`apps/web/vercel.json`).
- There are two deck AIs. `/deck` talks to `POST /v1/deck/agent` (`claude-opus-4-6`, tools, SSE). The deck-detail Advisor tab talks to `POST /api/architect` (`claude-haiku-4-5-20251001`, Scryfall + EDHREC only). Keep them separate unless you are deliberately merging them.
- `apps/api/.env.example` still says the daily price job re-runs a full Scryfall bulk ingest. The job in `apps/api/src/index.ts` refreshes MTGJSON, then fills unmapped printings from Scryfall. Trust the code.

## Open work that is not on this branch

GitHub PR **#26** (`feat: Phase 1 — deck agent loop, scanner unification, CI hardening`) is open. Main does not have its CI workflow, root README, `validate_deck` tool, or the `mtg-adapter` legality refactor. `apps/api/src/routes/decks.ts` still has its own legality checks, and `packages/engine` / `packages/mtg-adapter` are not what the apps call on the hot path. That PR also gitignores `.claude/`. If it lands, keep this file and `.claude/rules/` tracked.

Draft PR **#24** adds a Cursor `AGENTS.md`. Claude Code reads `CLAUDE.md` when both exist. This file is the project memory for Claude.
