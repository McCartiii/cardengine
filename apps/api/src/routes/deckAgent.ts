import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../db.js";
import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { aiQuota } from "../lib/aiQuota.js";
import { runDeckAgent } from "../services/deckAgent.js";
import { fetchDeckFromUrl, parseDecklistText, type ParsedDeckEntry } from "../services/urlImport.js";

export const AGENT_FORMATS = [
  "commander", "brawl", "oathbreaker",
  "standard", "pioneer", "modern", "legacy", "vintage", "pauper", "historic", "explorer",
] as const;

const AgentRequestSchema = z.object({
  instruction: z.string().min(1).max(2000),
  bracket: z.number().int().min(1).max(5) as z.ZodType<1 | 2 | 3 | 4 | 5>,
  budget: z.number().min(0).max(100000),
  format: z.enum(AGENT_FORMATS).optional(),
  commander: z.string().max(200).optional(),
  deckText: z.string().max(20000).optional(),
  deckUrl: z.string().url().optional(),
  deckId: z.string().optional(),
  sessionId: z.string().optional(),
});

const inCommandZone = (e: { section: string }) => e.section === "commander" || e.section === "companion";

function mainEntries(entries: Array<{ name: string; quantity: number; section: string }>) {
  return entries
    .filter((e) => !inCommandZone(e) && e.section !== "sideboard")
    .map((e) => ({ name: e.name, quantity: e.quantity }));
}

export function registerDeckAgentRoutes(app: FastifyInstance) {
  app.post(
    "/v1/deck/agent",
    {
      preHandler: [requireAuth, aiQuota("agent")],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      if (!process.env.ANTHROPIC_API_KEY) return reply.code(503).send({ error: "AI isn't set up on this server yet." });
      const user = (req as FastifyRequest & { user: AuthUser }).user;
      const body = AgentRequestSchema.parse(req.body);

      let format: string | undefined = body.format;
      let commanders: string[] = body.commander ? [body.commander] : [];
      let deck: Array<{ name: string; quantity: number }> = [];

      if (body.deckUrl) {
        try {
          const imported = await fetchDeckFromUrl(body.deckUrl);
          deck = mainEntries(imported.entries);
          if (!commanders.length) commanders = imported.commanders;
          format ??= (AGENT_FORMATS as readonly string[]).includes(imported.format ?? "") ? imported.format! : undefined;
        } catch (err) {
          return reply.code(400).send({ error: (err as Error).message });
        }
      } else if (body.deckText) {
        const entries: ParsedDeckEntry[] = parseDecklistText(body.deckText);
        deck = mainEntries(entries);
        if (!commanders.length) commanders = entries.filter((e) => e.section === "commander").map((e) => e.name);
      } else if (body.deckId) {
        const found = await prisma.deck.findUnique({
          where: { id: body.deckId },
          include: { cards: true },
        });
        if (!found || found.userId !== user.sub) {
          return reply.code(404).send({ error: "Deck not found" });
        }
        deck = mainEntries(found.cards.map((c) => ({ name: c.cardName, quantity: c.quantity, section: c.section })));
        format ??= found.format;
        if (!commanders.length) {
          commanders = [found.commander, found.partner].filter((c): c is string => !!c);
          if (!commanders.length) {
            commanders = found.cards.filter((c) => c.section === "commander").map((c) => c.cardName);
          }
        }
      }

      // Refinements continue a session, but only the player's own.
      let sessionMessages: Anthropic.Beta.BetaMessageParam[] | undefined;
      if (body.sessionId) {
        const session = await prisma.agentSession.findFirst({
          where: { id: body.sessionId, userId: user.sub },
        });
        if (!session) return reply.code(404).send({ error: "Session not found" });
        sessionMessages = session.messages as unknown as Anthropic.Beta.BetaMessageParam[];
      }

      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");
      reply.raw.flushHeaders();

      // Stop working (and spending) if the player leaves.
      let closed = false;
      reply.raw.on("close", () => {
        closed = true;
      });

      const generator = runDeckAgent({
        instruction: body.instruction,
        bracket: body.bracket,
        budget: body.budget,
        format: format ?? "commander",
        commanders,
        deck,
        userId: user.sub,
        sessionMessages,
      });

      let currentSessionId = body.sessionId;

      for await (const chunk of generator) {
        if (closed) {
          await generator.return(undefined);
          break;
        }
        // Intercept session events to persist them, don't forward raw to client
        if (chunk.startsWith('data: {"type":"session"')) {
          try {
            const parsed = JSON.parse(chunk.replace(/^data: /, "").replace(/\n\n$/, ""));
            if (currentSessionId) {
              await prisma.agentSession.update({
                where: { id: currentSessionId },
                data: { messages: parsed.messages },
              });
            } else {
              const newSession = await prisma.agentSession.create({
                data: {
                  userId: user.sub,
                  messages: parsed.messages,
                  context: {
                    bracket: body.bracket,
                    budget: body.budget,
                    format: format ?? "commander",
                    commanders,
                  },
                },
              });
              currentSessionId = newSession.id;
              reply.raw.write(`data: ${JSON.stringify({ type: "session_id", id: newSession.id })}\n\n`);
            }
          } catch {
            // Non-fatal: session persistence failure doesn't break the response
          }
          continue;
        }

        reply.raw.write(chunk);
      }

      reply.raw.end();
    }
  );
}
