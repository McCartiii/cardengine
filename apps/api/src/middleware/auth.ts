import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../db.js";

export interface AuthUser {
  sub: string;
  email?: string;
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/**
 * Verifies a Supabase JWT by calling the Supabase auth API.
 * Works regardless of signing algorithm (HS256, RS256, ES256).
 */
async function verifyToken(token: string): Promise<AuthUser | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    if (!res.ok) return null;
    const user = await res.json() as { id?: string; email?: string };
    if (!user?.id) return null;
    return { sub: user.id, email: user.email };
  } catch {
    return null;
  }
}

export async function extractUser(req: FastifyRequest): Promise<AuthUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return verifyToken(authHeader.slice(7));
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const user = await extractUser(req);
  if (!user) { reply.code(401).send({ error: "Unauthorized" }); return; }
  const dbUser = await prisma.user.findUnique({ where: { id: user.sub }, select: { banned: true } });
  if (dbUser?.banned) { reply.code(403).send({ error: "Account suspended" }); return; }
  (req as FastifyRequest & { user: AuthUser }).user = user;
}

export async function optionalAuth(req: FastifyRequest) {
  const user = await extractUser(req);
  if (user) (req as FastifyRequest & { user: AuthUser }).user = user;
}
