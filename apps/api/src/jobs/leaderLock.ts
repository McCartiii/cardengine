import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";

/**
 * Background jobs that must have at most one active runner.
 */
export type JobName = "priceRefresh" | "watchlistCheck" | "metaSnapshot";

/**
 * Attempt to acquire a renewable database lease, run the job, then release it.
 *
 * - Non-blocking: returns immediately if another instance holds the lock.
 * - Crash-safe: an abandoned lease expires and can be reclaimed.
 * - Pooler-safe: no session or long-running transaction is required.
 * - Returns true if the job ran on this instance, false if skipped.
 */
export async function withAdvisoryLock(
  jobName: JobName,
  job: () => Promise<void>,
): Promise<boolean> {
  // PGlite mode: no DATABASE_URL, skip locking and run job directly.
  if (!process.env.DATABASE_URL) {
    await job();
    return true;
  }

  const ownerId = randomUUID();
  const leaseMs = 3 * 60 * 60 * 1000;
  const heartbeatMs = 5 * 60 * 1000;
  const expiresAt = new Date(Date.now() + leaseMs);

  const claimed = await prisma.$queryRaw<Array<{ ownerId: string }>>`
    INSERT INTO "JobLease" ("name", "ownerId", "expiresAt", "updatedAt")
    VALUES (${jobName}, ${ownerId}, ${expiresAt}, NOW())
    ON CONFLICT ("name") DO UPDATE SET
      "ownerId" = EXCLUDED."ownerId",
      "expiresAt" = EXCLUDED."expiresAt",
      "updatedAt" = NOW()
    WHERE "JobLease"."expiresAt" <= NOW()
    RETURNING "ownerId"
  `;
  const acquired = claimed[0]?.ownerId === ownerId;

  if (!acquired) {
    console.log(`[leader-lock] Lease "${jobName}" held by another instance -- skipping.`);
    return false;
  }

  console.log(`[leader-lock] Acquired lease "${jobName}" -- running job.`);
  const heartbeat = setInterval(async () => {
    try {
      await prisma.jobLease.updateMany({
        where: { name: jobName, ownerId },
        data: { expiresAt: new Date(Date.now() + leaseMs) },
      });
    } catch (error) {
      console.error(`[leader-lock] Failed to renew lease "${jobName}"`, error);
    }
  }, heartbeatMs);
  heartbeat.unref();

  try {
    await job();
    return true;
  } finally {
    clearInterval(heartbeat);
    await prisma.jobLease
      .deleteMany({ where: { name: jobName, ownerId } })
      .catch((error) =>
        console.error(`[leader-lock] Failed to release lease "${jobName}"`, error)
      );
    console.log(`[leader-lock] Released lease "${jobName}".`);
  }
}
