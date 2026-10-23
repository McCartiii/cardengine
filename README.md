# Card Engine

MTG collection manager, price tracker and deck builder.

| Path | What it is |
|---|---|
| `apps/api` | Fastify + Prisma API (cards, prices, collection, decks, AI deck agent, watchlist, shops) |
| `apps/web` | Next.js web app |
| `apps/mobile` | Expo / React Native app (scanner, collection, decks, life counter). Not an npm workspace; it has its own lockfile. |
| `packages/engine`, `packages/mtg-adapter` | Shared hashing, search, pricing and MTG rules code |

## Local development

Requires Node 20.19+ (`.nvmrc` pins 22).

```bash
npm run setup   # install everything, build shared packages, generate the Prisma client
npm run dev     # API on :3001 + web on :3000
```

That's all you need for the web app. With no `.env` files:

- **Database**: the API runs an embedded Postgres (PGlite) stored in `apps/api/pglite-data/`. Delete that folder to start fresh. Migrations are applied automatically.
- **Card data**: on first boot the API loads one Scryfall set (`INITIAL_INGEST_SET`, default `fdn`). This needs internet access to `api.scryfall.com`. Set `INITIAL_INGEST_SET` to another set code if you like, or `AUTO_INGEST_ON_EMPTY=false` to skip it. For a quick fixture card without internet: `curl -X POST localhost:3001/dev/seed`.
- **Auth**: without Supabase keys the site runs signed-out, and signed-in pages (collection, decks, watchlist) will be empty. To sign in, copy `apps/api/.env.example` → `apps/api/.env` and `apps/web/.env.example` → `apps/web/.env.local`, and fill in the Supabase keys from a dev project.
- **Background jobs** (daily MTGJSON price refresh, watchlist alerts, meta snapshots) are off under `npm run dev`. Turn one on by setting it in `apps/api/.env`, e.g. `ENABLE_PRICE_REFRESH=true`.
- **AI features** need `ANTHROPIC_API_KEY` (and `TAVILY_API_KEY` for the deck agent's web search) in `apps/api/.env`.

Anything you set in `apps/api/.env` or your shell overrides the `npm run dev` defaults.

### Mobile

The app uses native modules (Vision Camera, text recognition), so it runs in an Expo **development build**, not Expo Go.

```bash
cp apps/mobile/.env.example apps/mobile/.env
# set EXPO_PUBLIC_API_URL to the "Mobile" URL that `npm run dev` prints (your LAN IP),
# plus the Supabase URL/anon key to be able to sign in

npm run dev                          # keep the API running
cd apps/mobile
npx expo run:ios                     # or: npx expo run:android  (needs Xcode / Android Studio)
# no local toolchain? build in the cloud instead:
#   npx eas build --profile development-simulator --platform ios
#   npx eas build --profile development --platform android
npm start                            # Metro for an installed dev build
```

The camera scanner needs a physical device.

### Checks

```bash
npm test             # vitest (engine, API, web helpers)
npm run typecheck    # API, web and mobile
npm run lint         # web
```

`cd apps/mobile && npm run doctor` checks native dependency versions against the Expo SDK.

### Database migrations

The schema lives in `apps/api/prisma/schema.prisma`. After changing it, add a migration in `apps/api/prisma/migrations/`; the local PGlite database is built from those files. Production (Railway) applies the schema with `prisma db push`.

## Deployment

- **API**: Railway, configured by `railway.json` / `Dockerfile.api`
- **Web**: Vercel (`apps/web/vercel.json`) or `Dockerfile.web`
- **Mobile**: EAS Build profiles in `apps/mobile/eas.json`
