import pg from "pg";

/**
 * Deterministic lock IDs for background jobs.
 * Each must be a unique integer. Postgres advisory locks accept bigint,
 * but small positive integers are fine and readable.
 */
const LOCK_IDS = {
  priceRefresh:   100_001,
  watchlistCheck: 100_002,
} as const;

export type JobName = keyof typeof LOCK_IDS;

/**
 * Attempt to acquire a Postgres advisory lock, run the job, then release.
 *
 * - Non-blocking: returns immediately if another instance holds the lock.
 * - Crash-safe: lock is auto-released if the holding connection drops.
 * - Returns true if the job ran on this instance, false if skipped.
 *
 * Uses a dedicated pg.Client (not a pool) so that acquire and release are
 * guaranteed to run on the same session. Session-level advisory locks
 * (pg_try_advisory_lock) do not work correctly with connection pools —
 * including Supabase's transaction-mode pooler — because acquire and
 * release may be dispatched to different backend connections.
 */
export async function withAdvisoryLock(
  jobName: JobName,
  job: () => Promise<void>,
): Promise<boolean> {
  const lockId = LOCK_IDS[jobName];

  // PGlite mode: no DATABASE_URL, skip locking and run job directly.
  if (\!process.env.DATABASE_URL) {
    await job();
    return true;
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query<{ pg_try_advisory_lock: boolean }>(
      "SELECT pg_try_advisory_lock($1)",
      [lockId],
    );
    const acquired = rows[0]?.pg_try_advisory_lock === true;

    if (\!acquired) {
      console.log(`[leader-lock] Lock "${jobName}" (${lockId}) held by another instance -- skipping.`);
      return false;
    }

    console.log(`[leader-lock] Acquired lock "${jobName}" (${lockId}) -- running job.`);
    try {
      await job();
      return true;
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [lockId]);
      console.log(`[leader-lock] Released lock "${jobName}" (${lockId}).`);
    }
  } finally {
    await client.end();
  }
}
