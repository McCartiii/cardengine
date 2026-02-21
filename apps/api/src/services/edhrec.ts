import { prisma } from "../db.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EdhrecCardEntry {
  name: string;
  sanitized: string;
  num_decks: number;
  potential_decks?: number;
  synergy: number;
  inclusion: number; // derived: num_decks / potential_decks (0-1)
  primary_type: string;
  cmc: number;
  color_identity: string[];
  image_uris?: Array<{ normal?: string }>;
  prices?: Record<string, { price?: number }>;
  url?: string;
}

export interface EdhrecCommanderPage {
  header: string;
  num_decks_avg: number;
  avg_price: number;
  similar: Array<{
    name: string;
    sanitized: string;
    color_identity: string[];
    url: string;
  }>;
  themes: string[];
  cardlists: EdhrecCardEntry[];
  raw: unknown; // full response for caching
}

// ── Name sanitization ──────────────────────────────────────────────────────────

/**
 * Convert a commander name to the EDHREC URL slug format.
 * e.g. "Kenrith, the Returned King" -> "kenrith-the-returned-king"
 */
export function sanitizeCommanderName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,''.]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/\/\/.*$/, "") // strip back face of DFCs
    .trim();
}

// ── Rate limiting ──────────────────────────────────────────────────────────────

let lastRequestTime = 0;
const MIN_INTERVAL_MS = 1100; // ~1 req/sec

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();

  const res = await fetch(url, {
    headers: {
      "User-Agent": "CardEngine/1.0 (contact@cardengine.app)",
      Accept: "application/json",
    },
  });
  return res;
}

// ── Cache TTL ──────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Core fetch ─────────────────────────────────────────────────────────────────

/**
 * Fetch EDHREC commander page data, with Postgres caching (24h TTL).
 */
export async function fetchEdhrecCommander(
  commanderName: string
): Promise<EdhrecCommanderPage | null> {
  const sanitized = sanitizeCommanderName(commanderName);
  const cacheKey = `commander:${sanitized}`;

  // Check cache
  const cached = await prisma.edhrecCache.findUnique({
    where: { key: cacheKey },
  });

  if (cached) {
    const age = Date.now() - cached.fetchedAt.getTime();
    if (age < CACHE_TTL_MS) {
      return parseEdhrecResponse(cached.data);
    }
  }

  // Fetch from EDHREC
  const url = `https://json.edhrec.com/pages/commanders/${sanitized}.json`;
  let res: Response;
  try {
    res = await rateLimitedFetch(url);
  } catch {
    // Network error — return cached data if available
    if (cached) return parseEdhrecResponse(cached.data);
    return null;
  }

  if (!res.ok) {
    // 404 or other error — return cached data if available
    if (cached) return parseEdhrecResponse(cached.data);
    return null;
  }

  const data: unknown = await res.json();

  // Upsert cache
  await prisma.edhrecCache.upsert({
    where: { key: cacheKey },
    create: { key: cacheKey, data: data as Parameters<typeof prisma.edhrecCache.create>[0]["data"]["data"], fetchedAt: new Date() },
    update: { data: data as Parameters<typeof prisma.edhrecCache.update>[0]["data"]["data"], fetchedAt: new Date() },
  });

  return parseEdhrecResponse(data);
}

// ── Response parsing ───────────────────────────────────────────────────────────

function parseEdhrecResponse(data: unknown): EdhrecCommanderPage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  // Extract card recommendations from the 'cardlists' array
  // EDHREC structures these as arrays of { header, cardviews: [...] }
  const cardlists: EdhrecCardEntry[] = [];

  const rawCardlists = d.cardlists as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(rawCardlists)) {
    for (const section of rawCardlists) {
      const cardviews = section.cardviews as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(cardviews)) continue;
      for (const cv of cardviews) {
        cardlists.push(parseCardEntry(cv, d.num_decks_avg as number));
      }
    }
  }

  // Also check the container.json_dict.cardlists structure (EDHREC varies)
  const container = d.container as Record<string, unknown> | undefined;
  if (container && cardlists.length === 0) {
    const jsonDict = container.json_dict as Record<string, unknown> | undefined;
    if (jsonDict) {
      const innerCardlists = jsonDict.cardlists as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(innerCardlists)) {
        for (const section of innerCardlists) {
          const cardviews = section.cardviews as Array<Record<string, unknown>> | undefined;
          if (!Array.isArray(cardviews)) continue;
          for (const cv of cardviews) {
            cardlists.push(parseCardEntry(cv, d.num_decks_avg as number));
          }
        }
      }
    }
  }

  // Extract themes from panels.links
  const themes: string[] = [];
  const panels = d.panels as Record<string, unknown> | undefined;
  if (panels) {
    const links = panels.links as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(links)) {
      for (const group of links) {
        if (group.header === "Tags") {
          const items = group.items as Array<{ value: string }> | undefined;
          if (Array.isArray(items)) {
            themes.push(...items.map((i) => i.value));
          }
        }
      }
    }
  }

  // Extract similar commanders
  const similar = (d.similar as Array<Record<string, unknown>> ?? [])
    .slice(0, 6)
    .map((s) => ({
      name: String(s.name ?? ""),
      sanitized: String(s.sanitized ?? ""),
      color_identity: (s.color_identity as string[]) ?? [],
      url: String(s.url ?? ""),
    }));

  return {
    header: String(d.header ?? ""),
    num_decks_avg: (d.num_decks_avg as number) ?? 0,
    avg_price: (d.avg_price as number) ?? 0,
    similar,
    themes,
    cardlists,
    raw: data,
  };
}

function parseCardEntry(
  cv: Record<string, unknown>,
  totalDecks: number
): EdhrecCardEntry {
  const numDecks = (cv.num_decks as number) ?? 0;
  const potentialDecks = (cv.potential_decks as number) ?? totalDecks ?? 1;
  const inclusion = potentialDecks > 0 ? numDecks / potentialDecks : 0;

  return {
    name: String(cv.name ?? ""),
    sanitized: String(cv.sanitized ?? ""),
    num_decks: numDecks,
    potential_decks: potentialDecks,
    synergy: (cv.synergy as number) ?? 0,
    inclusion,
    primary_type: String(cv.primary_type ?? ""),
    cmc: (cv.cmc as number) ?? 0,
    color_identity: (cv.color_identity as string[]) ?? [],
    image_uris: cv.image_uris as Array<{ normal?: string }> | undefined,
    prices: cv.prices as Record<string, { price?: number }> | undefined,
    url: cv.url as string | undefined,
  };
}
