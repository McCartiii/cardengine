import { prisma } from "../db.js";

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
 */
export async function withAdvisoryLock(
  jobName: JobName,
  job: () => Promise<void>,
): Promise<boolean> {
  const lockId = LOCK_IDS[jobName];

  const result = await prisma.$queryRawUnsafe<[{ pg_try_advisory_lock: boolean }]>(
    `SELECT pg_try_advisory_lock($1)`,
    lockId,
  );
  const acquired = result[0]?.pg_try_advisory_lock === true;

  if (!acquired) {
    console.log(`[leader-lock] Lock "${jobName}" (${lockId}) held by another instance -- skipping.`);
    return false;
  }

  try {
    console.log(`[leader-lock] Acquired lock "${jobName}" (${lockId}) -- running job.`);
    await job();
    return true;
  } finally {
    await prisma.$queryRawUnsafe(`SELECT pg_advisory_unlock($1)`, lockId);
    console.log(`[leader-lock] Released lock "${jobName}" (${lockId}).`);
  }
}
