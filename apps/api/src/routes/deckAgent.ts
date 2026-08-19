import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { optionalAuth, type AuthUser } from "../middleware/auth.js";
import { runDeckAgent } from "../services/deckAgent.js";
import { importDeckFromUrl, parseDecklistText } from "../services/urlImport.js";
import type Anthropic from "@anthropic-ai/sdk";

const AgentRequestSchema = z.object({
  instruction: z.string().min(1).max(2000),
  format: z.enum(["commander", "standard", "pioneer", "modern", "legacy", "vintage", "pauper"]).default("commander"),
  bracket: z.number().int().min(1).max(5) as z.ZodType<1 | 2 | 3 | 4 | 5>,
  budget: z.number().min(0).max(100000),
  commander: z.string().optional(),
  /** Current list from the deck editor (card names, one entry per copy). Used when no deckUrl/deckText/deckId. */
  deckCards: z.array(z.string().min(1).max(200)).max(400).optional(),
  deckText: z.string().optional(),
  deckUrl: z.string().url().optional(),
  deckId: z.string().optional(),
  sessionId: z.string().optional(),
  blueprint: z
    .object({
      goals: z.array(z.string()).max(12).optional(),
      keyCards: z.array(z.string()).max(30).optional(),
      avoidCards: z.array(z.string()).max(30).optional(),
      modelAfter: z.string().max(280).optional(),
      playSpeed: z.enum(["slow", "balanced", "fast"]).optional(),
      comboTolerance: z.enum(["none", "low", "medium", "high"]).optional(),
      tablePressure: z.enum(["low", "medium", "high"]).optional(),
      notes: z.string().max(400).optional(),
    })
    .optional(),
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

      // Resolve deck cards: explicit import wins; otherwise use inline list from the editor.
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
        deckCards = deck.cards.flatMap((c) => Array.from({ length: c.quantity }, () => c.cardName));
      } else if (body.deckCards?.length) {
        deckCards = body.deckCards;
      }

      // Load session history + context for refinements
      let sessionMessages: Anthropic.MessageParam[] | undefined;
      let sessionContext: Record<string, unknown> | undefined;
      if (body.sessionId) {
        const session = await prisma.agentSession.findUnique({
          where: { id: body.sessionId },
        });
        if (session) {
          sessionMessages = session.messages as unknown as Anthropic.MessageParam[];
          sessionContext = (session.context as Record<string, unknown> | null) ?? undefined;
        }
      }

      const mergedBlueprint =
        body.blueprint ??
        (sessionContext?.blueprint as typeof body.blueprint | undefined);

      const agentFormat = body.format;
      const agentBracket = body.bracket;
      const agentBudget = body.budget;
      const agentCommander = body.commander ?? (sessionContext?.commander as string | undefined);

      // Stream SSE response
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.flushHeaders();

      if (sessionContext) {
        reply.raw.write(
          `data: ${JSON.stringify({
            type: "session_context",
            context: {
              format: agentFormat,
              bracket: agentBracket,
              budget: agentBudget,
              commander: agentCommander ?? null,
              blueprint: mergedBlueprint ?? null,
            },
          })}\n\n`
        );
      }

      const generator = runDeckAgent({
        instruction: body.instruction,
        format: agentFormat,
        bracket: agentBracket,
        budget: agentBudget,
        commander: agentCommander,
        deckCards,
        userId: user?.sub,
        sessionMessages,
        blueprint: mergedBlueprint,
      });

      let currentSessionId = body.sessionId;

      for await (const chunk of generator) {
        // Intercept session events to persist them, don't forward raw to client
        if (chunk.startsWith('data: {"type":"session"')) {
          try {
            const parsed = JSON.parse(chunk.replace(/^data: /, "").replace(/\n\n$/, ""));
            const sessionContextPayload = {
              format: agentFormat,
              bracket: agentBracket,
              budget: agentBudget,
              commander: agentCommander ?? null,
              blueprint: mergedBlueprint ?? null,
            };

            if (currentSessionId) {
              await prisma.agentSession.update({
                where: { id: currentSessionId },
                data: {
                  messages: parsed.messages,
                  context: sessionContextPayload,
                },
              });
            } else {
              const newSession = await prisma.agentSession.create({
                data: {
                  userId: user?.sub ?? null,
                  messages: parsed.messages,
                  context: sessionContextPayload,
                },
              });
              currentSessionId = newSession.id;
              reply.raw.write(`data: ${JSON.stringify({ type: "session_id", id: newSession.id })}\n\n`);
              reply.raw.write(
                `data: ${JSON.stringify({ type: "session_context", context: sessionContextPayload })}\n\n`
              );
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
