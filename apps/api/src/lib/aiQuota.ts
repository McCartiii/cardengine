// Per-user daily limits on the AI routes, on top of the per-IP rate limit.
// Counters live in memory, so they reset on restart and are per instance;
// that's enough to stop runaway spend, not a billing system.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthUser } from "../middleware/auth.js";

export type AiFeature = "agent" | "chat" | "advice";

const DAILY_LIMITS: Record<AiFeature, number> = {
  agent: Number(process.env.AI_DAILY_AGENT_RUNS ?? 25),
  chat: Number(process.env.AI_DAILY_CHAT_MESSAGES ?? 150),
  advice: Number(process.env.AI_DAILY_ADVICE ?? 50),
};

const counts = new Map<string, number>();
let day = "";

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Records one use; false when the user is out for today. */
export function takeAiQuota(userId: string, feature: AiFeature): boolean {
  const d = today();
  if (d !== day) {
    counts.clear();
    day = d;
  }
  const key = `${feature}:${userId}`;
  const used = counts.get(key) ?? 0;
  if (used >= DAILY_LIMITS[feature]) return false;
  counts.set(key, used + 1);
  return true;
}

/** preHandler; runs after requireAuth. */
export function aiQuota(feature: AiFeature) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as FastifyRequest & { user?: AuthUser }).user;
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    if (!takeAiQuota(user.sub, feature)) {
      return reply.code(429).send({ error: "You've reached today's AI limit. It resets at midnight UTC." });
    }
  };
}
