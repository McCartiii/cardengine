import Anthropic from "@anthropic-ai/sdk";
import { tavily } from "@tavily/core";
import { prisma } from "../db.js";
import { fetchEdhrecCommander } from "./edhrec.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CardDetail {
  name: string;
  variantId: string | null;
  imageUri: string | null;
  typeLine: string | null;
  manaCost: string | null;
  priceUsd: number | null;
}

export interface OwnedCard {
  name: string;
  variantId: string;
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

export function buildGetCardDetails() {
  return async function getCardDetails(cardNames: string[]): Promise<CardDetail[]> {
    if (cardNames.length === 0) return [];

    const variants = await prisma.cardVariant.findMany({
      where: { game: "mtg", name: { in: cardNames, mode: "insensitive" } },
      select: { variantId: true, name: true, imageUri: true, typeLine: true, manaCost: true },
    });

    // Deduplicate: prefer non-foil
    const dbMap = new Map<string, { variantId: string; imageUri: string | null; typeLine: string | null; manaCost: string | null }>();
    for (const v of variants) {
      const key = v.name.toLowerCase();
      if (!dbMap.has(key) || dbMap.get(key)!.variantId.endsWith("-foil")) {
        dbMap.set(key, { variantId: v.variantId, imageUri: v.imageUri, typeLine: v.typeLine, manaCost: v.manaCost });
      }
    }

    // Batch price lookup
    const variantIds = [...dbMap.values()].map((v) => v.variantId);
    const prices = variantIds.length > 0
      ? await prisma.priceCache.findMany({
          where: { variantId: { in: variantIds }, market: "tcgplayer", kind: "market", currency: "USD" },
        })
      : [];
    const priceMap = new Map(prices.map((p) => [p.variantId, p.amount]));

    return cardNames.map((name) => {
      const key = name.toLowerCase();
      const db = dbMap.get(key) ?? null;
      const scryfallImage = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;
      return {
        name,
        variantId: db?.variantId ?? null,
        imageUri: db?.imageUri ?? scryfallImage,
        typeLine: db?.typeLine ?? null,
        manaCost: db?.manaCost ?? null,
        priceUsd: db ? (priceMap.get(db.variantId) ?? null) : null,
      };
    });
  };
}

// ── Tool: get_collection ──────────────────────────────────────────────────────

export function buildGetCollection() {
  return async function getCollection(userId: string): Promise<OwnedCard[]> {
    const events = await prisma.collectionEvent.findMany({
      where: { userId },
      select: { type: true, variantId: true, payload: true },
    });

    const quantities = new Map<string, number>();
    for (const e of events) {
      const qty = quantities.get(e.variantId) ?? 0;
      const payload = e.payload as Record<string, unknown>;
      const eventQty = (payload.quantity as number) ?? 1;
      quantities.set(e.variantId, e.type === "add" ? qty + eventQty : qty - eventQty);
    }

    const variantIds = [...quantities.entries()].filter(([, q]) => q > 0).map(([vid]) => vid);
    if (variantIds.length === 0) return [];

    const variants = await prisma.cardVariant.findMany({
      where: { variantId: { in: variantIds } },
      select: { name: true, variantId: true },
    });

    return variants.map((v) => ({ name: v.name.toLowerCase(), variantId: v.variantId }));
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

// ── Tool definitions for Claude ───────────────────────────────────────────────

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "fetch_edhrec",
    description: "Fetch EDHREC commander page data: synergy scores, inclusion rates, popular cards, themes, and similar commanders. Always call this first for any commander deck.",
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
    description: "Search the web for current MTG deck tech, Reddit discussions, tournament results, and upgrade guides. Use for Bracket 3-5 or when you need recent community knowledge.",
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
    description: "Get the cached MTGGoldfish meta snapshot for a format and bracket. Use for Bracket 4-5 commander or competitive constructed formats.",
    input_schema: {
      type: "object" as const,
      properties: {
        format: { type: "string", enum: ["commander", "standard", "modern", "pioneer", "legacy"] },
        bracket: { type: "number", description: "1-5 for commander, 0 for non-commander" },
      },
      required: ["format", "bracket"],
    },
  },
  {
    name: "get_card_details",
    description: "Look up card details (image, type, mana cost, price) for a list of card names. Call after finalizing your card list to verify names are real.",
    input_schema: {
      type: "object" as const,
      properties: {
        cardNames: { type: "array", items: { type: "string" } },
      },
      required: ["cardNames"],
    },
  },
  {
    name: "get_collection",
    description: "Get the user's owned cards. Only call if a userId is provided.",
    input_schema: {
      type: "object" as const,
      properties: {
        userId: { type: "string" },
      },
      required: ["userId"],
    },
  },
];

// ── Tool executor ─────────────────────────────────────────────────────────────

export function buildToolExecutor(userId?: string) {
  const getCardDetails = buildGetCardDetails();
  const getCollection = buildGetCollection();
  const getMetaSnapshot = buildGetMetaSnapshot();
  const searchWeb = buildSearchWeb();

  return async function executeTool(
    name: string,
    input: Record<string, unknown>
  ): Promise<unknown> {
    switch (name) {
      case "fetch_edhrec":
        return fetchEdhrecCommander(input.commanderName as string);
      case "search_web":
        return searchWeb(input.query as string);
      case "get_meta_snapshot":
        return getMetaSnapshot(input.format as string, input.bracket as number);
      case "get_card_details":
        return getCardDetails(input.cardNames as string[]);
      case "get_collection":
        return getCollection((input.userId as string | undefined) ?? userId ?? "");
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  };
}
