import type Anthropic from "@anthropic-ai/sdk";
import { tavily } from "@tavily/core";
import { z } from "zod";
import { prisma } from "../db.js";
import { fetchEdhrecCommander } from "./edhrec.js";
import { lookupCardFacts, normalizeCardName } from "./cardFacts.js";
import { loadOwnedHoldings } from "./binders.js";
import { scryfallSearch } from "./scryfallSearch.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CardDetail {
  name: string;
  found: boolean;
  variantId: string | null;
  imageUri: string | null;
  typeLine: string | null;
  manaCost: string | null;
  cmc: number | null;
  colorIdentity: string[];
  oracleText: string | null;
  priceUsd: number | null;
  /** Legality in the deck's format: legal, banned, not_legal, restricted or unknown. */
  legality: string;
}

export interface OwnedCard {
  name: string;
  quantity: number;
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export interface MetaSnapshotData {
  topDecks: Array<{ name: string; colors: string[]; archetype: string }>;
  staples: string[];
  fetchedAt: string;
}

// ── Tool: get_card_details ─────────────────────────────────────────────────────

export function buildGetCardDetails(format = "commander") {
  return async function getCardDetails(cardNames: string[]): Promise<CardDetail[]> {
    if (cardNames.length === 0) return [];
    const facts = await lookupCardFacts(cardNames);
    return cardNames.map((name) => {
      const f = facts.get(normalizeCardName(name));
      if (!f) {
        return {
          name,
          found: false,
          variantId: null,
          imageUri: null,
          typeLine: null,
          manaCost: null,
          cmc: null,
          colorIdentity: [],
          oracleText: null,
          priceUsd: null,
          legality: "unknown",
        };
      }
      return {
        name: f.name,
        found: true,
        variantId: f.variantId,
        imageUri: f.imageUri,
        typeLine: f.typeLine,
        manaCost: f.manaCost,
        cmc: f.cmc,
        colorIdentity: f.colorIdentity,
        oracleText: f.oracleText ? f.oracleText.slice(0, 400) : null,
        priceUsd: f.priceUsd,
        legality: f.legalities?.[format] ?? "unknown",
      };
    });
  };
}

// ── Tool: get_collection ──────────────────────────────────────────────────────

/** The signed-in user's cards, one row per name. Never takes a user id from the model. */
export function buildGetCollection() {
  return async function getCollection(userId: string): Promise<OwnedCard[]> {
    const holdings = await loadOwnedHoldings(userId);
    const byName = new Map<string, OwnedCard>();
    for (const h of holdings) {
      const entry = byName.get(h.name) ?? { name: h.name, quantity: 0 };
      entry.quantity += h.quantity;
      byName.set(h.name, entry);
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  };
}

// ── Tool: get_meta_snapshot ───────────────────────────────────────────────────

export function buildGetMetaSnapshot() {
  return async function getMetaSnapshot(format: string, bracket: number): Promise<MetaSnapshotData | null> {
    const snap = await prisma.metaSnapshot.findUnique({
      where: { format_bracket: { format, bracket } },
    });
    if (!snap) return null;
    return snap.data as unknown as MetaSnapshotData;
  };
}

// ── Tool: search_web ──────────────────────────────────────────────────────────

export function buildSearchWeb() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return async (_query: string): Promise<SearchResult[]> => [];
  }
  const client = tavily({ apiKey });

  return async function searchWeb(query: string): Promise<SearchResult[]> {
    try {
      const response = await client.search(query, { maxResults: 5 });
      return (response.results ?? []).map((r: Record<string, unknown>) => ({
        title: (r.title as string) ?? "",
        url: (r.url as string) ?? "",
        content: ((r.content as string) ?? "").slice(0, 800),
      }));
    } catch {
      return [];
    }
  };
}

// ── Tool: fetch_edhrec ────────────────────────────────────────────────────────

/** EDHREC's commander page, trimmed to the parts that help pick cards. */
export async function edhrecForAgent(commanderName: string) {
  const page = await fetchEdhrecCommander(commanderName);
  if (!page) return { error: `No EDHREC page for "${commanderName}"` };
  return {
    commander: commanderName,
    decks: page.num_decks_avg,
    averagePrice: page.avg_price,
    themes: page.themes.slice(0, 12),
    similarCommanders: page.similar.slice(0, 6).map((s) => s.name),
    cards: page.cardlists
      .slice()
      .sort((a, b) => b.inclusion - a.inclusion)
      .slice(0, 150)
      .map((c) => ({
        name: c.name,
        synergy: Math.round(c.synergy * 100) / 100,
        inclusion: Math.round(c.inclusion * 100),
        type: c.primary_type,
        cmc: c.cmc,
        priceUsd: c.prices?.tcgplayer?.price ?? null,
      })),
  };
}

// ── Tool definitions for Claude ───────────────────────────────────────────────

const TOOL_INPUTS = {
  fetch_edhrec: z.object({ commanderName: z.string().min(1).max(200) }),
  search_web: z.object({ query: z.string().min(1).max(300) }),
  get_meta_snapshot: z.object({
    format: z.enum(["commander", "standard", "modern", "pioneer", "legacy"]),
    bracket: z.number().int().min(0).max(5),
  }),
  get_card_details: z.object({ cardNames: z.array(z.string().min(1).max(200)).min(1).max(150) }),
  search_cards: z.object({ query: z.string().min(1).max(300) }),
  get_collection: z.object({}).passthrough(),
} as const;

export type AgentToolName = keyof typeof TOOL_INPUTS;

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "fetch_edhrec",
    description: "EDHREC data for a commander: themes, similar commanders, and the 150 most-played cards with synergy (-1 to 1) and inclusion rate (% of decks). Call this first for any commander deck.",
    input_schema: {
      type: "object" as const,
      properties: {
        commanderName: { type: "string", description: "Exact commander card name" },
      },
      required: ["commanderName"],
    },
  },
  {
    name: "search_web",
    description: "Search the web for current deck techs, Reddit discussion, tournament results and upgrade guides. Most useful for higher brackets or recent sets.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_meta_snapshot",
    description: "The cached MTGGoldfish meta snapshot for a format: top decks and staples. Use for bracket 4-5 Commander or competitive 60-card formats.",
    input_schema: {
      type: "object" as const,
      properties: {
        format: { type: "string", enum: ["commander", "standard", "modern", "pioneer", "legacy"] },
        bracket: { type: "number", description: "1-5 for commander, 0 for other formats" },
      },
      required: ["format", "bracket"],
    },
  },
  {
    name: "get_card_details",
    description: "Look up cards by exact name (up to 150 per call): whether the card exists, type, mana cost, color identity, rules text, cheapest price, and legality in this deck's format. Use it to confirm names, colors, legality and prices before you answer.",
    input_schema: {
      type: "object" as const,
      properties: {
        cardNames: { type: "array", items: { type: "string" } },
      },
      required: ["cardNames"],
    },
  },
  {
    name: "search_cards",
    description: "Search every card with Scryfall syntax, ordered by EDHREC popularity, up to 12 results with price and rules text. Good for finding replacements, e.g. 'id<=BG t:creature o:sacrifice usd<2' or 'f:commander id<=UR o:\"draw a card\" cmc<=2'.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Scryfall search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_collection",
    description: "The signed-in player's collection: every card name they own and how many. Prefer owned cards when they fit.",
    input_schema: { type: "object" as const, properties: {} },
  },
].map((tool) => ({ ...tool, eager_input_streaming: true }));

// ── Tool executor ─────────────────────────────────────────────────────────────

export class ToolInputError extends Error {}

export function buildToolExecutor(opts: { userId?: string; format?: string } = {}) {
  const getCardDetails = buildGetCardDetails(opts.format ?? "commander");
  const getCollection = buildGetCollection();
  const getMetaSnapshot = buildGetMetaSnapshot();
  const searchWeb = buildSearchWeb();

  return async function executeTool(name: string, rawInput: unknown): Promise<unknown> {
    const schema = TOOL_INPUTS[name as AgentToolName];
    if (!schema) throw new ToolInputError(`Unknown tool: ${name}`);
    const parsed = schema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ToolInputError(`Invalid input for ${name}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    }
    const input = parsed.data as Record<string, unknown>;
    switch (name as AgentToolName) {
      case "fetch_edhrec":
        return edhrecForAgent(input.commanderName as string);
      case "search_web":
        return searchWeb(input.query as string);
      case "get_meta_snapshot":
        return getMetaSnapshot(input.format as string, input.bracket as number);
      case "get_card_details":
        return getCardDetails(input.cardNames as string[]);
      case "search_cards":
        return scryfallSearch(input.query as string);
      case "get_collection":
        if (!opts.userId) return { error: "No signed-in player" };
        return getCollection(opts.userId);
    }
  };
}
