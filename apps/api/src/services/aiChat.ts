// The general AI assistant: questions about a deck, about the player's
// collection, or about cards and rules. Streams text as SSE, with tools for
// card search, EDHREC, the player's collection and the open deck.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "../db.js";
import { scryfallNamed, scryfallSearch } from "./scryfallSearch.js";
import { edhrecForAgent } from "./deckAgentTools.js";
import { type CollectionHolding } from "./collectionHoldings.js";
import { loadOwnedHoldings } from "./binders.js";
import { collectionOverview, searchCollection } from "./collectionInsights.js";
import { suggestDecks } from "./deckAdvisor.js";
import { lookupCardFacts, normalizeCardName } from "./cardFacts.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const CHAT_MODEL = "claude-haiku-5-5";
const MAX_TOOL_ROUNDS = 8;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  userId: string;
  messages: ChatMessage[];
  deckId?: string;
  notes?: string;
}

const TOOL_INPUTS = {
  search_cards: z.object({ query: z.string().min(1).max(300) }),
  get_card: z.object({ name: z.string().min(1).max(200) }),
  edhrec_commander: z.object({ commanderName: z.string().min(1).max(200) }),
  collection_overview: z.object({}).passthrough(),
  search_collection: z.object({
    name: z.string().max(100).optional(),
    type: z.string().max(60).optional(),
    withinColors: z.string().max(5).optional(),
    minPrice: z.number().min(0).optional(),
    maxPrice: z.number().min(0).optional(),
    sort: z.enum(["value", "price", "gain", "loss", "name"]).optional(),
    limit: z.number().int().min(1).max(150).optional(),
  }),
  commanders_i_can_build: z.object({}).passthrough(),
  get_deck: z.object({}).passthrough(),
} as const;

type ToolName = keyof typeof TOOL_INPUTS;

const TOOL_DEFS: Anthropic.Tool[] = [
  {
    name: "search_cards",
    description: "Search all Magic cards with Scryfall syntax, ordered by EDHREC popularity (up to 12, with price, rules text and legality). E.g. 'id<=BG t:creature o:sacrifice usd<2'.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "get_card",
    description: "One card by name (fuzzy): rules text, type, price, color identity, legality in each format, EDHREC rank.",
    input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
  {
    name: "edhrec_commander",
    description: "EDHREC data for a commander: themes, similar commanders, and the most-played cards with synergy and inclusion rate.",
    input_schema: { type: "object", properties: { commanderName: { type: "string" } }, required: ["commanderName"] },
  },
  {
    name: "collection_overview",
    description: "The player's collection at a glance: card count, total value, most valuable cards, biggest 7-day gainers and losers, counts by color and type, and legendary creatures they own.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_collection",
    description: "Search the player's own cards by name, type, colors (withinColors: cards whose color identity fits, e.g. 'BG'), price range; sort by value, price, gain, loss or name.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        type: { type: "string", description: "Text in the type line, e.g. 'Creature', 'Elf', 'Equipment'" },
        withinColors: { type: "string" },
        minPrice: { type: "number" },
        maxPrice: { type: "number" },
        sort: { type: "string", enum: ["value", "price", "gain", "loss", "name"] },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "commanders_i_can_build",
    description: "Commanders the player owns, ranked by how much of a deck their collection already covers, with EDHREC themes and the estimated cost to finish.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_deck",
    description: "The deck the player has open: name, format, commander, and every card with quantity, type, mana cost and price.",
    input_schema: { type: "object", properties: {} },
  },
];
const TOOLS: Anthropic.Tool[] = TOOL_DEFS.map((tool) => ({ ...tool, eager_input_streaming: true }));

function systemPrompt(deck: { name: string; format: string; commander: string | null } | null, notes?: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `You are the AI assistant inside a Magic: The Gathering collection and deck app. You help players with their decks, their collection (what it's worth, what's moving, what to build, what to sell or trade), and cards and rules.

Use the tools for facts: card names, rules text, legality, prices, and anything about the player's collection or deck. Don't guess prices or what they own. Never narrate tool use; just answer.

Answer for a phone screen: short paragraphs, "## " headings only when the answer has sections, "- " bullets, **bold** card names. Lead with the answer. When you recommend cards, say briefly why each fits and give its price when you looked it up.

When asked what to sell, weigh value, recent price change, and whether the card is in demand or likely to drop (new reprints, rotation), and say plainly that prices can move. When asked what to build, start from commanders_i_can_build.

${deck ? `The player has their deck "${deck.name}" open (${deck.format}${deck.commander ? `, commander ${deck.commander}` : ""}). Call get_deck before answering questions about it. When you suggest a list of cards to add, also put them at the end in a block the app can import:
CARDS:
1 Card Name
END_CARDS` : ""}
${notes ? `\nThe player's settings for this chat:\n${notes}\n` : ""}
Today is ${today}.`;
}

function sseJson(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function buildExecutor(userId: string, deckId?: string) {
  let holdings: Promise<CollectionHolding[]> | null = null;
  const owned = () => (holdings ??= loadOwnedHoldings(userId));

  return async (name: string, rawInput: unknown): Promise<unknown> => {
    const schema = TOOL_INPUTS[name as ToolName];
    if (!schema) throw new Error(`Unknown tool: ${name}`);
    const parsed = schema.safeParse(rawInput ?? {});
    if (!parsed.success) throw new Error(`Invalid input for ${name}: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
    const input = parsed.data as Record<string, unknown>;

    switch (name as ToolName) {
      case "search_cards":
        return scryfallSearch(input.query as string);
      case "get_card":
        return scryfallNamed(input.name as string);
      case "edhrec_commander":
        return edhrecForAgent(input.commanderName as string);
      case "collection_overview":
        return collectionOverview(await owned());
      case "search_collection":
        return searchCollection(await owned(), input);
      case "commanders_i_can_build":
        return (await suggestDecks(userId)).slice(0, 10).map((s) => ({
          commander: s.commander.name,
          colorIdentity: s.commander.colorIdentity.join("") || "C",
          ownedCardsInIdentity: s.ownedCardsInIdentity,
          edhrecDecks: s.edhrecDecks,
          themes: s.themes.slice(0, 5),
          estimatedCostToFinishUsd: s.estimatedBudgetToComplete,
        }));
      case "get_deck": {
        if (!deckId) return { error: "No deck is open" };
        const deck = await prisma.deck.findFirst({ where: { id: deckId, userId }, include: { cards: true } });
        if (!deck) return { error: "Deck not found" };
        const facts = await lookupCardFacts(deck.cards.map((c) => c.cardName));
        return {
          name: deck.name,
          format: deck.format,
          commander: deck.commander,
          partner: deck.partner,
          cards: deck.cards.map((c) => {
            const f = facts.get(normalizeCardName(c.cardName));
            return {
              name: c.cardName,
              quantity: c.quantity,
              section: c.section,
              type: f?.typeLine ?? null,
              manaCost: f?.manaCost ?? null,
              priceUsd: f?.priceUsd ?? null,
            };
          }),
        };
      }
    }
  };
}

export async function* runChat(req: ChatRequest): AsyncGenerator<string> {
  const deck = req.deckId
    ? await prisma.deck.findFirst({ where: { id: req.deckId, userId: req.userId }, select: { name: true, format: true, commander: true } })
    : null;
  const tools = deck ? TOOLS : TOOLS.filter((t) => t.name !== "get_deck");
  const execute = buildExecutor(req.userId, deck ? req.deckId : undefined);
  const messages: Anthropic.MessageParam[] = req.messages.map((m) => ({ role: m.role, content: m.content }));

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const stream = client.messages.stream({
        model: CHAT_MODEL,
        max_tokens: 16_000,
        system: systemPrompt(deck, req.notes),
        tools,
        messages,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
      } as Anthropic.MessageStreamParams);

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield sseJson({ type: "text", text: event.delta.text });
        } else if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
          yield sseJson({ type: "tool_start", tool: event.content_block.name });
        }
      }
      const final = await stream.finalMessage();
      messages.push({ role: "assistant", content: final.content });

      if (final.stop_reason === "refusal") {
        yield sseJson({ type: "error", message: "The assistant can't help with that one." });
        break;
      }
      if (final.stop_reason === "pause_turn") continue;
      if (final.stop_reason !== "tool_use") {
        if (final.stop_reason === "max_tokens") yield sseJson({ type: "error", message: "The answer got cut off." });
        break;
      }

      const toolBlocks = final.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const results = await Promise.all(
        toolBlocks.map(async (block): Promise<Anthropic.ToolResultBlockParam> => {
          try {
            return { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(await execute(block.name, block.input)) };
          } catch (err) {
            return { type: "tool_result", tool_use_id: block.id, content: (err as Error).message, is_error: true };
          }
        })
      );
      for (const block of toolBlocks) yield sseJson({ type: "tool_done", tool: block.name });
      messages.push({ role: "user", content: results });
    }
  } catch (err) {
    const message =
      err instanceof Anthropic.RateLimitError
        ? "The assistant is busy right now. Try again in a minute."
        : err instanceof Anthropic.APIError
          ? `The AI service returned an error (${err.status ?? "unknown"}).`
          : "Something went wrong.";
    yield sseJson({ type: "error", message });
  }
  yield "data: [DONE]\n\n";
}
