import type { FastifyRequest, FastifyReply } from "fastify";
import { extractUser, type AuthUser } from "./auth.js";

const ADMIN_IDS = (process.env.ADMIN_USER_IDS ?? "").split(",").filter(Boolean);

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const user = await extractUser(req);
  if (!user) {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }
  if (!ADMIN_IDS.includes(user.sub)) {
    reply.code(403).send({ error: "Forbidden: admin access required" });
    return;
  }
  (req as FastifyRequest & { user: AuthUser }).user = user;
}
