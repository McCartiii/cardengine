import type { FastifyRequest, FastifyReply } from "fastify";
import { jwtVerify, importJWK, type KeyLike } from "jose";
import { prisma } from "../db.js";

export interface AuthUser {
  sub: string;
  email?: string;
}

interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  role?: string;
  exp?: number;
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";
const HS256_SECRET = process.env.SUPABASE_JWT_SECRET
  ? new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET)
  : null;

// Cache JWKS keys for 10 minutes
let jwksCache: { keys: KeyLike[]; expiresAt: number } | null = null;

async function getRemoteKeys(): Promise<KeyLike[]> {
  const now = Date.now();
  if (jwksCache && now < jwksCache.expiresAt) return jwksCache.keys;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/keys`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    if (!res.ok) return [];
    const { keys } = (await res.json()) as { keys?: object[] };
    if (!Array.isArray(keys) || keys.length === 0) return [];
    const imported = (
      await Promise.all(keys.map((k) => importJWK(k as Parameters<typeof importJWK>[0]).catch(() => null)))
    ).filter(Boolean) as KeyLike[];
    jwksCache = { keys: imported, expiresAt: now + 10 * 60 * 1000 };
    return imported;
  } catch {
    return [];
  }
}

async function verifySupabaseJwt(token: string): Promise<SupabaseJwtPayload | null> {
  // Try RS256/ES256 via fetched JWKS
  const remoteKeys = await getRemoteKeys();
  for (const key of remoteKeys) {
    try {
      const { payload } = await jwtVerify(token, key, { algorithms: ["RS256", "ES256"] });
      return payload as unknown as SupabaseJwtPayload;
    } catch {
      // try next key
    }
  }
  // Fall back to HS256 with legacy secret
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
    if (claims.role && claims.role !== "authenticated") return null;
    return { sub: claims.sub, email: claims.email };
  } catch {
    return null;
  }
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
