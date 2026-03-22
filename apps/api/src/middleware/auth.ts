import type { FastifyRequest, FastifyReply } from "fastify";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { prisma } from "../db.js";

export interface AuthUser {
  sub: string;   // user ID (UUID)
  email?: string;
}

// Supabase JWT payload shape (only the fields we consume)
interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  role?: string;
  aud?: string;
  exp?: number;
  iat?: number;
}

// Support both HS256 (legacy secret) and RS256 (JWKS) Supabase JWT signing.
// SUPABASE_URL is required for JWKS. SUPABASE_JWT_SECRET is used as HS256 fallback.
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const jwksUrl = SUPABASE_URL ? new URL(`${SUPABASE_URL}/auth/v1/keys`) : null;
const JWKS = jwksUrl ? createRemoteJWKSet(jwksUrl) : null;
const HS256_SECRET = process.env.SUPABASE_JWT_SECRET
  ? new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET)
  : null;

async function verifySupabaseJwt(token: string): Promise<SupabaseJwtPayload | null> {
  // Try RS256 via JWKS first (current Supabase default)
  if (JWKS) {
    try {
      const { payload } = await jwtVerify(token, JWKS, { algorithms: ["RS256", "ES256"] });
      return payload as unknown as SupabaseJwtPayload;
    } catch {
      // fall through to HS256
    }
  }
  // Try HS256 via legacy secret
  if (HS256_SECRET) {
    try {
      const { payload } = await jwtVerify(token, HS256_SECRET, { algorithms: ["HS256"] });
      return payload as unknown as SupabaseJwtPayload;
    } catch {
      return null;
    }
  }
  return null;
}

export async function extractUser(req: FastifyRequest): Promise<AuthUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    const claims = await verifySupabaseJwt(token);
    if (!claims?.sub) return null;
    // Reject anonymous tokens
    if (claims.role && claims.role !== "authenticated") return null;
    return { sub: claims.sub, email: claims.email };
  } catch {
    return null;
  }
}

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

export async function optionalAuth(req: FastifyRequest) {
  const user = await extractUser(req);
  if (user) {
    (req as FastifyRequest & { user: AuthUser }).user = user;
  }
}
