import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { optionalAuth, type AuthUser } from "../middleware/auth.js";
import { runDeckAgent } from "../services/deckAgent.js";
import { importDeckFromUrl, parseDecklistText } from "../services/urlImport.js";
import type Anthropic from "@anthropic-ai/sdk";

const AgentRequestSchema = z.object({
  instruction: z.string().min(1).max(2000),
  bracket: z.number().int().min(1).max(5) as z.ZodType<1 | 2 | 3 | 4 | 5>,
  budget: z.number().min(0).max(100000),
  commander: z.string().optional(),
  deckText: z.string().optional(),
  deckUrl: z.string().url().optional(),
  deckId: z.string().optional(),
  sessionId: z.string().optional(),
});

export function registerDeckAgentRoutes(app: FastifyInstance) {
  app.post(
    "/v1/deck/agent",
    {
      preHandler: [optionalAuth],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const user = (req as FastifyRequest & { user?: AuthUser }).user;
      const body = AgentRequestSchema.parse(req.body);

      // Resolve deck cards from whichever input method was provided
      let deckCards: string[] = [];

      if (body.deckUrl) {
        const entries = await importDeckFromUrl(body.deckUrl);
        deckCards = entries.map((e) => e.name);
      } else if (body.deckText) {
        const entries = parseDecklistText(body.deckText);
        deckCards = entries.map((e) => e.name);
      } else if (body.deckId && user) {
        const deck = await prisma.deck.findUnique({
          where: { id: body.deckId },
          include: { cards: true },
        });
        if (!deck || deck.userId !== user.sub) {
          return reply.code(404).send({ error: "Deck not found" });
        }
        deckCards = deck.cards.map((c) => c.cardName);
      }

      // Load session history for refinements
      let sessionMessages: Anthropic.MessageParam[] | undefined;
      if (body.sessionId) {
        const session = await prisma.agentSession.findUnique({
          where: { id: body.sessionId },
        });
        if (session) {
          sessionMessages = session.messages as unknown as Anthropic.MessageParam[];
        }
      }

      // Stream SSE response
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.flushHeaders();

      const generator = runDeckAgent({
        instruction: body.instruction,
        bracket: body.bracket,
        budget: body.budget,
        commander: body.commander,
        deckCards,
        userId: user?.sub,
        sessionMessages,
      });

      let currentSessionId = body.sessionId;

      for await (const chunk of generator) {
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
                  userId: user?.sub ?? null,
                  messages: parsed.messages,
                  context: {
                    bracket: body.bracket,
                    budget: body.budget,
                    commander: body.commander ?? null,
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
