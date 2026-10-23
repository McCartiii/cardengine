---
paths:
  - "Dockerfile.api"
  - "Dockerfile.web"
  - "railway.json"
  - ".dockerignore"
  - "apps/web/vercel.json"
  - "apps/api/prisma.config.ts"
  - "apps/api/package.json"
  - "package.json"
  - "package-lock.json"
---

# Deploy

API production is Railway Railpack, configured only by `railway.json`. Build from the repo root: `npm ci`, `build:packages`, `build:api`. Start with `prisma db push` using `apps/api/prisma.config.ts`, then `node apps/api/dist/index.js`. Health check is `/health`.

`npm start` in `apps/api` also runs `prisma db push --accept-data-loss`. Schema changes hit production data through that push.

`Dockerfile.api` is the fallback image (Node 22, repo-root context). Railway left it after Metal cache corruption in August 2026. Do not switch `railway.json` back to Docker unless the cache issue is understood.

`.dockerignore` must leave `apps/web/package.json` in the context. Ignoring `apps/web` broke Railpack. `npm ci` fails when `package-lock.json` is stale; commit the lockfile with dependency changes.

Vercel uses `apps/web/vercel.json`: install from the repo root, then `build:packages` and `build:web`. The web build script is `next build --webpack`.

`DATABASE_URL` in production is the Supabase transaction pooler (port 6543). `DIRECT_URL` is the direct 5432 connection for migrations that cannot run through the pooler. Node is `>=20.19` everywhere; Docker images are Node 22.

`.dockerignore` strips `*.md`. That does not affect Claude memory in git. It does mean a Docker image will not contain these notes.
