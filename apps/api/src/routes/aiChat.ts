import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { aiQuota } from "../lib/aiQuota.js";
import { runChat } from "../services/aiChat.js";

const ChatRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .refine((m) => m[m.length - 1].role === "user", "The last message must be from the user"),
  deckId: z.string().optional(),
  /** Settings the app passes along, e.g. power level and collection preference. */
  notes: z.string().max(3000).optional(),
});

/** Keep the first question (it sets the topic) and the latest exchanges. */
function trimHistory<T>(messages: T[], keep = 12): T[] {
  if (messages.length <= keep + 1) return messages;
  const tail = messages.slice(-keep);
  return [messages[0], ...tail];
}

export function registerAiChatRoutes(app: FastifyInstance) {
  app.post(
    "/v1/ai/chat",
    {
      preHandler: [requireAuth, aiQuota("chat")],
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      if (!process.env.ANTHROPIC_API_KEY) return reply.code(503).send({ error: "AI isn't set up on this server yet." });
      const user = (req as FastifyRequest & { user: AuthUser }).user;
      const body = ChatRequestSchema.parse(req.body);
      let messages = trimHistory(body.messages);
      // History must alternate starting with a question.
      while (messages.length && messages[0].role !== "user") messages = messages.slice(1);
      messages = messages.filter((m, i) => i === 0 || m.role !== messages[i - 1].role);

      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");
      reply.raw.flushHeaders();

      let closed = false;
      reply.raw.on("close", () => {
        closed = true;
      });

      const generator = runChat({ userId: user.sub, messages, deckId: body.deckId, notes: body.notes });
      for await (const chunk of generator) {
        if (closed) {
          await generator.return(undefined);
          break;
        }
        reply.raw.write(chunk);
      }
      reply.raw.end();
    }
  );
}
