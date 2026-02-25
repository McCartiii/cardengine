import type { FastifyRequest, FastifyReply } from "fastify";
import { jwtVerify } from "jose";
import { prisma } from "../db.js";

export interface AuthUser {
  sub: string;   // user ID (UUID)
  email?: string;
}

// Supabase signs JWTs with HS256 using SUPABASE_JWT_SECRET.
// Encode once at module load.
const jwtSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);

// Supabase JWT payload shape (only the fields we consume)
interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  role?: string;      // "authenticated" | "anon" | "service_role"
  aud?: string;
  exp?: number;
  iat?: number;
}

/**
 * Extracts and verifies a Supabase JWT from the Authorization header.
 * Verification is purely local (no network call) using SUPABASE_JWT_SECRET.
 * jose's jwtVerify automatically rejects expired tokens via the exp claim.
 */
export async function extractUser(req: FastifyRequest): Promise<AuthUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, jwtSecret, {
      algorithms: ["HS256"],
    });
    const claims = payload as unknown as SupabaseJwtPayload;

    if (!claims.sub) return null;

    // Reject anonymous tokens
    if (claims.role && claims.role !== "authenticated") return null;

    return {
      sub: claims.sub,
      email: claims.email,
    };
  } catch {
    // Expired, invalid signature, malformed
    return null;
  }
}

/**
 * Fastify preHandler hook that requires authentication.
 * Sets request.user with the verified user payload.
 * Rejects with 403 if the user's account has been banned.
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const user = await extractUser(req);
  if (!user) {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { banned: true },
  });
  if (dbUser?.banned) {
    reply.code(403).send({ error: "Account suspended" });
    return;
  }
  (req as FastifyRequest & { user: AuthUser }).user = user;
}

/**
 * Optional auth -- sets request.user if token is present, but doesn't reject.
 */
export async function optionalAuth(req: FastifyRequest) {
  const user = await extractUser(req);
  if (user) {
    (req as FastifyRequest & { user: AuthUser }).user = user;
  }
}
