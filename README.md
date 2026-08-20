# Card Engine Platform

A Magic: The Gathering deck-building and collection platform: scan cards, track a
collection and its value, build decks with an AI "Advisor," watch prices, and find
local game stores. Web, mobile, and a shared API.

The centerpiece is the **deck Advisor** — a Claude agent (Opus) that streams advice
over SSE and calls real tools (EDHREC, Scryfall, web search, meta snapshots, the
user's own collection) to make grounded, data-backed deck recommendations.

## Repository layout

This is an npm-workspaces monorepo.

| Path | What it is | Stack |
|------|------------|-------|
| `apps/api` | Backend API — cards, collection, decks, deck agent, watchlist, admin | Fastify 5 · Prisma · Supabase Postgres · Anthropic SDK |
| `apps/web` | Web app — deck builder, card pages, scanner, landing | Next.js 16 · React 19 · Tailwind 4 |
| `apps/mobile` | Mobile app — scan, life counter, collection, decks, shops, alerts | Expo 52 · React Native 0.76 · Vision Camera OCR |
| `packages/engine` | Game-agnostic core — collection ledger, search, pricing, perceptual hashing | TypeScript |
| `packages/mtg-adapter` | MTG-specific formats, rules engine, and scanner pipeline | TypeScript |

> **Note:** `apps/mobile` is intentionally **not** part of the root npm workspace —
> it has its own `package-lock.json` and is installed separately (see below).
>
> **Note:** `packages/engine` and `packages/mtg-adapter` are currently not imported
> by the apps (the apps duplicate some of their logic). See
> [Known debt](#known-debt) before extending them.

## Prerequisites

- **Node 20.19.0** (see `.nvmrc` — run `nvm use`)
- A **Supabase** project (Postgres + Auth)
- An **Anthropic API key** (for the deck Advisor)
- **Expo / EAS** account for mobile builds

## Setup

```bash
nvm use                 # Node 20.19.0
npm install             # installs api, web, and packages (root workspace)

# Mobile installs separately — it is not in the root workspace:
cd apps/mobile && npm install && cd ../..
```

### Environment variables

Each app has a committed `.env.example`. Copy it and fill in real values — the real
`.env` files are gitignored and must never be committed.

```bash
cp apps/api/.env.example    apps/api/.env
cp apps/web/.env.example    apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

Key variables (see each `.env.example` for the full list and inline docs):

- **API** — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`,
  `DATABASE_URL` (use the Supabase **Transaction Pooler**, port 6543),
  `ANTHROPIC_API_KEY`, `ADMIN_USER_IDS`.
- **Web** — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_API_URL`.
- **Mobile** — `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
  `EXPO_PUBLIC_API_URL` (your machine's LAN IP for local dev, e.g.
  `http://192.168.1.10:3001`).

### Database

```bash
npm run db:generate     # prisma generate
npm run db:migrate      # prisma migrate dev (local schema changes)
```

The API `start` script runs `prisma db push` on boot, and (unless disabled via feature
flags) auto-ingests card data from Scryfall on first boot into an empty DB.

## Running locally

```bash
npm run dev:api         # Fastify on http://localhost:3001  (GET /health)
npm run dev:web         # Next.js on http://localhost:3000
npm run dev:mobile      # Expo — scan the QR with Expo Go / a dev build
```

Start the API first; web and mobile both talk to it via the `*_API_URL` env vars.

## Testing & checks

```bash
npm test                                    # Vitest — all workspaces (api + packages)
npx tsc --noEmit -p apps/api/tsconfig.json  # API typecheck
npx tsc --noEmit -p apps/web/tsconfig.json  # Web typecheck
npm run lint --workspace=apps/web           # Web lint
```

CI runs on every PR (`.github/workflows/ci.yml`). All lanes block merges: unit tests,
API typecheck + build, web typecheck + lint, package builds, and mobile typecheck.

## Deployment

| Target | Where | How |
|--------|-------|-----|
| API | Railway | `Dockerfile.api` (Node 20, Prisma build, `/health` check); `railway.json` |
| Web | Railway / Vercel | `Dockerfile.web` (Next.js) / `.vercel` |
| Mobile | Expo Application Services | `eas build --platform ios\|android` |
| Database | Supabase | Postgres (Transaction Pooler on 6543 for prod) |

There is currently **no automated deploy pipeline** — deploys are triggered manually
via the Railway dashboard and the EAS CLI.

## Known debt

Tracked so it stays visible (see the assessment in `docs/` for detail):

- **No web/mobile tests** — coverage is API + packages only; the web and mobile UIs
  have no automated tests (E2E smoke tests are the next step).
- **Oversized files** — `apps/web/src/app/deck/page.tsx` (~1500 lines) and the card
  detail page (~1200) are prime candidates for decomposition.
