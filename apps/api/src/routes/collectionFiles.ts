import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { collectionToCsv, parseCollectionFile } from "../lib/collectionCsv.js";
import { listBinders, selectBinders } from "../services/binders.js";
import { matchImport } from "../services/collectionImport.js";
import { MAIN_BINDER, loadCollectionHoldings } from "../services/collectionHoldings.js";

const MAX_ROWS = 20_000;
const userOf = (req: FastifyRequest) => (req as FastifyRequest & { user: AuthUser }).user;

export function registerCollectionFileRoutes(app: FastifyInstance) {
  // Import a CSV export or card list into a binder. dryRun reports what would
  // happen; otherwise the cards are added (or replace the binder's cards).
  app.post(
    "/v1/collection/import",
    { preHandler: [requireAuth], bodyLimit: 10 * 1024 * 1024, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = userOf(req);
      const body = z
        .object({
          text: z.string().min(1),
          binderId: z.string().default(MAIN_BINDER),
          mode: z.enum(["add", "replace"]).default("add"),
          dryRun: z.boolean().default(false),
        })
        .parse(req.body);

      const binders = await listBinders(user.sub);
      if (!binders.some((b) => b.id === body.binderId)) return reply.code(404).send({ error: "Binder not found" });

      const parsed = parseCollectionFile(body.text);
      if (!parsed.entries.length) return reply.code(400).send({ error: "We couldn't find any cards in that file" });
      if (parsed.entries.length > MAX_ROWS) return reply.code(400).send({ error: `That's more than ${MAX_ROWS.toLocaleString()} rows; split the file and import it in parts` });

      const { matched, unmatched } = await matchImport(parsed.entries);
      const summary = {
        format: parsed.format,
        rows: parsed.entries.length,
        matchedCards: matched.length,
        matchedCopies: matched.reduce((n, m) => n + m.quantity, 0),
        unmatchedCount: unmatched.length,
        unmatched: unmatched.slice(0, 100).map((e) => ({ line: e.line, name: e.name, setCode: e.setCode ?? null, quantity: e.quantity })),
        sample: [...matched]
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 6)
          .map((m) => ({ name: m.name, imageUri: m.imageUri, quantity: m.quantity, finish: m.finish })),
      };
      if (body.dryRun || !matched.length) return { ...summary, imported: false };

      const at = new Date();
      const binderPart = body.binderId !== MAIN_BINDER ? { binderId: body.binderId } : {};
      const events = matched.map((m) => ({
        id: `import:${randomUUID()}`,
        userId: user.sub,
        at,
        type: "add",
        variantId: m.variantId,
        payload: { quantity: m.quantity, finish: m.finish, source: "import", ...binderPart },
      }));
      await prisma.$transaction([
        ...(body.mode === "replace"
          ? [
              body.binderId === MAIN_BINDER
                ? prisma.$executeRaw`DELETE FROM "CollectionEvent" WHERE "userId" = ${user.sub} AND NOT ("payload" ? 'binderId')`
                : prisma.$executeRaw`DELETE FROM "CollectionEvent" WHERE "userId" = ${user.sub} AND "payload"->>'binderId' = ${body.binderId}`,
            ]
          : []),
        ...Array.from({ length: Math.ceil(events.length / 1000) }, (_, i) =>
          prisma.collectionEvent.createMany({ data: events.slice(i * 1000, (i + 1) * 1000) })
        ),
      ]);
      return { ...summary, imported: true };
    }
  );

  // The collection as CSV: one binder, "owned" (all but wishlists) or "all".
  app.get("/v1/collection/export", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = userOf(req);
    const { binder } = z.object({ binder: z.string().default("all") }).parse(req.query);
    const binders = await listBinders(user.sub);
    const ids = selectBinders(binders, binder);
    if (!ids) return reply.code(404).send({ error: "Binder not found" });
    const names = new Map(binders.map((b) => [b.id, b.name]));
    const holdings = await loadCollectionHoldings(user.sub, { market: "tcgplayer", kind: "auto", currency: "USD" }, ids);
    holdings.sort((a, b) => (names.get(a.binderId) ?? "").localeCompare(names.get(b.binderId) ?? "") || a.name.localeCompare(b.name));
    const csv = collectionToCsv(
      holdings.map((h) => ({
        quantity: h.quantity,
        name: h.name,
        setId: h.setId,
        collectorNumber: h.collectorNumber,
        finish: h.finish ?? "nonfoil",
        variantId: h.variantId,
        price: h.priceUsd,
        binder: names.get(h.binderId) ?? "Collection",
      }))
    );
    const label = binder === "all" || binder === "owned" ? "collection" : (names.get(binder) ?? "binder").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="cardengine-${label}-${new Date().toISOString().slice(0, 10)}.csv"`);
    return csv;
  });
}
