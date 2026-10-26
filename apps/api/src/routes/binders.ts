import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { BINDER_KINDS, MAX_BINDERS, listBinders } from "../services/binders.js";
import { MAIN_BINDER, holdingFromEvent, loadCollectionHoldings } from "../services/collectionHoldings.js";

const finishParam = z.enum(["nonfoil", "foil", "etched"]).default("nonfoil");
const userOf = (req: FastifyRequest) => (req as FastifyRequest & { user: AuthUser }).user;

/** Copies of one printing and finish in one binder. */
async function copiesIn(userId: string, variantId: string, finish: string, binderId: string): Promise<number> {
  const events = await prisma.collectionEvent.findMany({ where: { userId, variantId }, select: { type: true, payload: true } });
  const target = holdingFromEvent(variantId, { finish, binderId }).id;
  let n = 0;
  for (const e of events) {
    const p = e.payload as { qty?: number; quantity?: number; finish?: unknown; kind?: unknown; binderId?: unknown };
    if (holdingFromEvent(variantId, p).id !== target) continue;
    const q = p.qty ?? p.quantity ?? 1;
    n += e.type === "add" ? q : -q;
  }
  return Math.max(0, n);
}

function event(userId: string, type: "add" | "remove", variantId: string, finish: string, binderId: string, quantity: number, tag: string) {
  return {
    id: `${tag}:${randomUUID()}`,
    userId,
    at: new Date(),
    type,
    variantId,
    payload: { quantity, finish, ...(binderId !== MAIN_BINDER ? { binderId } : {}) },
  };
}

export function registerBinderRoutes(app: FastifyInstance) {
  // Binders with their card counts and value (stats=false skips the counting).
  app.get("/v1/binders", { preHandler: [requireAuth] }, async (req) => {
    const user = userOf(req);
    const { stats } = z.object({ stats: z.enum(["true", "false"]).default("true") }).parse(req.query);
    const binders = await listBinders(user.sub);
    if (stats === "false") return { binders };
    const holdings = await loadCollectionHoldings(user.sub, { market: "tcgplayer", kind: "auto", currency: "USD" });
    const totals = new Map<string, { cards: number; copies: number; value: number }>();
    for (const h of holdings) {
      const t = totals.get(h.binderId) ?? { cards: 0, copies: 0, value: 0 };
      t.cards += 1;
      t.copies += h.quantity;
      t.value += h.lineValue ?? 0;
      totals.set(h.binderId, t);
    }
    return {
      binders: binders.map((b) => {
        const t = totals.get(b.id) ?? { cards: 0, copies: 0, value: 0 };
        return { ...b, cards: t.cards, copies: t.copies, value: Math.round(t.value * 100) / 100 };
      }),
    };
  });

  app.post("/v1/binders", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = userOf(req);
    const body = z.object({ name: z.string().trim().min(1).max(40), kind: z.enum(BINDER_KINDS).default("custom") }).parse(req.body);
    const existing = await listBinders(user.sub);
    if (existing.length - 1 >= MAX_BINDERS) return reply.code(400).send({ error: `You can have up to ${MAX_BINDERS} binders` });
    if (existing.some((b) => b.name.toLowerCase() === body.name.toLowerCase())) {
      return reply.code(409).send({ error: `You already have a binder called “${body.name}”` });
    }
    const b = await prisma.binder.create({ data: { userId: user.sub, name: body.name, kind: body.kind } });
    return { binder: { id: b.id, name: b.name, kind: b.kind } };
  });

  app.patch("/v1/binders/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = userOf(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ name: z.string().trim().min(1).max(40) }).parse(req.body);
    if ((await listBinders(user.sub)).some((b) => b.id !== id && b.name.toLowerCase() === body.name.toLowerCase())) {
      return reply.code(409).send({ error: `You already have a binder called “${body.name}”` });
    }
    const { count } = await prisma.binder.updateMany({ where: { id, userId: user.sub }, data: { name: body.name } });
    if (!count) return reply.code(404).send({ error: "Binder not found" });
    return { ok: true };
  });

  // Deleting a binder either moves its cards into the main collection or deletes them.
  app.delete("/v1/binders/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = userOf(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { cards } = z.object({ cards: z.enum(["move", "delete"]) }).parse(req.query);
    const binder = await prisma.binder.findFirst({ where: { id, userId: user.sub } });
    if (!binder) return reply.code(404).send({ error: "Binder not found" });
    await prisma.$transaction([
      cards === "move"
        ? prisma.$executeRaw`UPDATE "CollectionEvent" SET "payload" = "payload" - 'binderId' WHERE "userId" = ${user.sub} AND "payload"->>'binderId' = ${id}`
        : prisma.$executeRaw`DELETE FROM "CollectionEvent" WHERE "userId" = ${user.sub} AND "payload"->>'binderId' = ${id}`,
      prisma.binder.delete({ where: { id } }),
    ]);
    return { ok: true };
  });

  // Moves copies of a card from one binder to another.
  app.post("/v1/collection/move", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = userOf(req);
    const body = z
      .object({ variantId: z.string(), finish: finishParam, from: z.string(), to: z.string(), quantity: z.number().int().min(1).max(9999) })
      .parse(req.body);
    const ids = new Set((await listBinders(user.sub)).map((b) => b.id));
    if (!ids.has(body.from) || !ids.has(body.to)) return reply.code(404).send({ error: "Binder not found" });
    if (body.from === body.to) return { ok: true, moved: 0 };
    const have = await copiesIn(user.sub, body.variantId, body.finish, body.from);
    const moved = Math.min(have, body.quantity);
    if (!moved) return reply.code(409).send({ error: "That card isn't in this binder" });
    await prisma.collectionEvent.createMany({
      data: [
        event(user.sub, "remove", body.variantId, body.finish, body.from, moved, "move"),
        event(user.sub, "add", body.variantId, body.finish, body.to, moved, "move"),
      ],
    });
    return { ok: true, moved };
  });

  // Takes copies of a card out of a binder.
  app.post("/v1/collection/remove", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = userOf(req);
    const body = z
      .object({ variantId: z.string(), finish: finishParam, binderId: z.string().default(MAIN_BINDER), quantity: z.number().int().min(1).max(9999) })
      .parse(req.body);
    const have = await copiesIn(user.sub, body.variantId, body.finish, body.binderId);
    const removed = Math.min(have, body.quantity);
    if (!removed) return reply.code(409).send({ error: "That card isn't in this binder" });
    await prisma.collectionEvent.create({ data: event(user.sub, "remove", body.variantId, body.finish, body.binderId, removed, "remove") });
    return { ok: true, removed, left: have - removed };
  });
}
