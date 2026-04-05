import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";

export function registerTelemetryRoutes(app: FastifyInstance) {
  app.post("/v1/telemetry/scanner-mismatch", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const body = z
      .object({
        userId: z.string().optional(),
        ocrNameRaw: z.string(),
        ocrCnRaw: z.string().optional(),
        ocrSetRaw: z.string().optional(),
        ocrConfidence: z.number().int(),
        candidateId: z.string().optional(),
        confirmedId: z.string().optional(),
        wasAutoConfirmed: z.boolean().default(false),
      })
      .parse(req.body);
    const record = await prisma.scannerMismatch.create({ data: body });
    return { ok: true, id: record.id };
  });

  app.post("/v1/telemetry/rules-disagreement", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const body = z
      .object({
        userId: z.string().optional(),
        formatId: z.string(),
        game: z.string().default("mtg"),
        deckHash: z.string().optional(),
        violationCode: z.string(),
        userDisputed: z.boolean().default(true),
        notes: z.string().optional(),
      })
      .parse(req.body);
    const record = await prisma.rulesDisagreement.create({ data: body });
    return { ok: true, id: record.id };
  });

  app.get("/admin/telemetry/scanner-stats", async (req) => {
    const query = z
      .object({ days: z.coerce.number().int().min(1).max(365).default(7) })
      .parse(req.query);
    const since = new Date(Date.now() - query.days * 86_400_000);

    const total = await prisma.scannerMismatch.count({ where: { createdAt: { gte: since } } });
    const overrides = await prisma.scannerMismatch.count({
      where: { createdAt: { gte: since }, wasAutoConfirmed: false, confirmedId: { not: null } },
    });
    const noMatch = await prisma.scannerMismatch.count({
      where: { createdAt: { gte: since }, confirmedId: null },
    });
    const lowConfidence = await prisma.scannerMismatch.count({
      where: { createdAt: { gte: since }, ocrConfidence: { lt: 50 } },
    });

    return {
      period: `last ${query.days} days`,
      total,
      overrides,
      noMatch,
      lowConfidence,
      overrideRate: total > 0 ? ((overrides / total) * 100).toFixed(1) + "%" : "0%",
    };
  });

  app.get("/admin/telemetry/rules-stats", async (req) => {
    const query = z
      .object({ days: z.coerce.number().int().min(1).max(365).default(7) })
      .parse(req.query);
    const since = new Date(Date.now() - query.days * 86_400_000);

    const total = await prisma.rulesDisagreement.count({ where: { createdAt: { gte: since } } });
    const disputed = await prisma.rulesDisagreement.count({
      where: { createdAt: { gte: since }, userDisputed: true },
    });

    const recentDisagreements = await prisma.rulesDisagreement.findMany({
      where: { createdAt: { gte: since }, userDisputed: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const codeCounts = new Map<string, number>();
    for (const d of recentDisagreements) {
      codeCounts.set(d.violationCode, (codeCounts.get(d.violationCode) ?? 0) + 1);
    }
    const topCodes = [...codeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([code, count]) => ({ code, count }));

    return {
      period: `last ${query.days} days`,
      total,
      disputed,
      disputeRate: total > 0 ? ((disputed / total) * 100).toFixed(1) + "%" : "0%",
      topDisputedCodes: topCodes,
    };
  });
}
