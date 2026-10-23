---
paths:
  - "apps/api/src/**/*.ts"
  - "apps/api/prisma/**/*"
---

# API

Fastify 5, ESM, Prisma 7. Listen on `PORT` default 3001 and `HOST` default `0.0.0.0`. Global rate limit is 100 per minute. The deck agent route adds its own limit of 10 per minute.

Auth checks the bearer token by calling Supabase `/auth/v1/user` with the service role key. Do not verify the JWT locally; Supabase signing algorithms have already changed out from under a local verifier. Reject banned users with 403. Admin identity is `ADMIN_USER_IDS`.

Register each route path once. A second `GET /v1/bundles/:game/count` crashed boot.

Background work goes through `withAdvisoryLock` in `leaderLock.ts` when `DATABASE_URL` is set. New job names need a `JobName` union member and a `JobLease` row created by the upsert. Without `DATABASE_URL` the lock is skipped and every process runs the job.

`AUTO_INGEST_ON_EMPTY`, `ENABLE_PRICE_REFRESH`, `ENABLE_WATCHLIST_CHECK`, and `ENABLE_META_SNAPSHOT` default to enabled. Set them to the string `false` to disable.

Collection writes append `CollectionEvent` rows. Reads fold the ledger. Do not add a mutable quantity column beside it.

`??` and `||` in the same expression need parentheses; the precedence bug has already broken a route.

Prisma client output is `apps/api/src/generated/` and is gitignored. Run `npm run db:generate` after a schema change. Production applies the schema with `prisma db push`, so a destructive migration is a data-loss event.
