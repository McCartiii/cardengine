import type { FastifyRequest, FastifyReply } from "fastify";
import { supabaseAdmin } from "../supabase.js";

export interface AuthUser {
  sub: string; // user ID (UUID)
  email?: string;
}

/**
 * Extracts and verifies a Supabase JWT from the Authorization header.
 * Uses the Supabase Admin SDK to verify the token against Supabase's auth server.
 * Returns the decoded user payload or null if invalid/missing.
 */
export async function extractUser(req: FastifyRequest): Promise<AuthUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const {
    data: { user },
    error
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) return null;

  return {
    sub: user.id,
    email: user.email
  };
}

/**
 * Fastify preHandler hook that requires authentication.
 * Sets request.user with the verified user payload.
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const user = await extractUser(req);
  if (!user) {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }
  (req as FastifyRequest & { user: AuthUser }).user = user;
}

/**
 * Optional auth - sets request.user if token is present, but doesn't reject.
 */
export async function optionalAuth(req: FastifyRequest) {
  const user = await extractUser(req);
  if (user) {
    (req as FastifyRequest & { user: AuthUser }).user = user;
  }
}
