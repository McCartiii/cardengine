import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

// ── Scryfall helpers ─────────────────────────────────────────────────────────

async function scryfallSearch(query: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=edhrec`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return JSON.stringify({ error: "No cards found", query });
    const data = await res.json();
    const cards = (data.data as Array<Record<string, unknown>>).slice(0, 8).map((c) => ({
      name: c.name,
      mana_cost: c.mana_cost,
      type_line: c.type_line,
      oracle_text: c.oracle_text,
      color_identity: c.color_identity,
      cmc: c.cmc,
      prices: (c.prices as Record<string, string | null>)?.usd ?? null,
      legalities: c.legalities,
      set_name: c.set_name,
    }));
    return JSON.stringify({ total: data.total_cards, cards });
  } catch {
    return JSON.stringify({ error: "Scryfall search failed" });
  }
}

async function scryfallGetCard(name: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return JSON.stringify({ error: `Card "${name}" not found` });
    const c = await res.json();
    return JSON.stringify({
      name: c.name,
      mana_cost: c.mana_cost,
      type_line: c.type_line,
      oracle_text: c.oracle_text,
      color_identity: c.color_identity,
      cmc: c.cmc,
      power: c.power,
      toughness: c.toughness,
      keywords: c.keywords,
      prices: (c.prices as Record<string, string | null>)?.usd ?? null,
      legalities: c.legalities,
      set_name: c.set_name,
      edhrec_rank: c.edhrec_rank,
    });
  } catch {
    return JSON.stringify({ error: "Scryfall lookup failed" });
  }
}

// ── EDHREC helper ────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function edhrecRecommendations(commanderName: string, currentCards: string[]): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/v1/deck/recs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commanderName, currentCards }),
    });
    if (!res.ok) return JSON.stringify({ error: "EDHREC data not available for this commander" });
    const data = await res.json();
    const recs = (data.recommendations as Array<Record<string, unknown>>).slice(0, 20).map(r => ({
      name: r.name,
      synergy: r.synergy,
      inclusionRate: r.inclusionRate,
      category: r.category,
      reason: r.reason,
      priceUsd: r.priceUsd,
      typeLine: r.typeLine,
      manaCost: r.manaCost,
    }));
    return JSON.stringify({ commander: commanderName, count: recs.length, recommendations: recs });
  } catch {
    return JSON.stringify({ error: "Failed to fetch EDHREC data" });
  }
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: "scryfall_search",
    description:
      "Search the Scryfall MTG card database. Use Scryfall search syntax. Examples: 'is:commander color:wubg', 'type:instant cmc<=2 color:blue', 'set:sld name:jin'. Returns up to 8 results.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Scryfall search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "scryfall_get_card",
    description:
      "Look up a specific card by name (fuzzy matched). Returns full card details. Use to verify a card exists or get exact stats.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Card name (fuzzy matched)" },
      },
      required: ["name"],
    },
  },
  {
    name: "edhrec_recommendations",
    description:
      "Get EDHREC popularity data and card recommendations for a commander. Returns the most-played cards in decks with this commander, with synergy scores, inclusion rates, categories, and prices. Use this on the FIRST message to get data-driven recommendations based on what thousands of real players use. This is your most powerful tool for deck building.",
    input_schema: {
      type: "object" as const,
      properties: {
        commander_name: { type: "string", description: "Commander card name (e.g. 'Atraxa, Praetors\\' Voice')" },
        current_cards: {
          type: "array",
          items: { type: "string" },
          description: "Card names already in the deck (to avoid re-suggesting)",
        },
      },
      required: ["commander_name"],
    },
  },
];

// ── System prompt ────────────────────────────────────────────────────────────

const SYSTEM = `You are an elite Magic: The Gathering deck architect. You have access to the complete Scryfall card database via tools.

TOOL USE RULES:
- On the FIRST message, use edhrec_recommendations to get data-driven card suggestions AND scryfall_get_card to look up the commander. EDHREC data shows what thousands of real players use — this is your primary source for recommendations.
- On follow-up messages, only use tools when the user asks about NEW cards you haven't discussed yet. Do NOT re-look-up cards you already know about.
- Use scryfall_search to find specific cards by criteria (type, color, cmc, keywords).
- When EDHREC data is available, prioritize cards with high synergy scores and inclusion rates.
- Never narrate tool use. Don't say "Let me search" or "Let me look up." Just present results.
- Limit to 2-3 tool calls per message. Be targeted, not exhaustive.

DECK BUILDING EXPERTISE:

Commander (100-card singleton):
- Lands: 35-38 (more for 3+ colors, fewer for low-curve aggro)
- Ramp: 10-12 sources (Sol Ring, Arcane Signet, signets, talismans, land ramp)
- Card draw: 8-10 sources
- Removal: 8-10 (mix of targeted + board wipes)
- Board wipes: 3-5
- Win conditions: 2-4 distinct paths to victory
- Average CMC target: 2.5-3.2 for optimized, 3.0-3.8 for casual

60-card constructed:
- Lands: 22-26 depending on curve
- 4-of staples, 2-3 of situational cards
- Tight mana curve, ideally peaking at 2 CMC

Key principles:
- Every card should synergize with the commander or strategy
- Include answers to common threats (artifacts, enchantments, graveyards)
- Mana base needs fixing for 3+ color decks (shocks, fetches, checks, pain lands)
- Include protection for commander (boots, greaves, counterspells)
- Balance proactive threats with reactive answers

COLOR IDENTITY:
- W: Removal, board wipes, lifegain, tokens, enchantments
- U: Counterspells, card draw, bounce, control, combo
- B: Tutors, reanimation, removal, sacrifice, card advantage
- R: Burn, haste, impulse draw, artifact destruction, combat tricks
- G: Ramp, big creatures, fight removal, enchantment removal, land tutors
- Colorless: Artifact ramp, equipment, utility lands

FORMAT RESPONSE:
- Use **bold** for card names and section headers
- Use bullet lists for card suggestions
- Keep responses focused and actionable
- When suggesting cards, explain WHY each card fits

Format card suggestions for import like this:
CARDS:
1 Sol Ring
1 Arcane Signet
1 Swords to Plowshares
END_CARDS`;

// ── Route handler ────────────────────────────────────────────────────────────

async function executeToolCall(name: string, input: Record<string, unknown>): Promise<string> {
  if (name === "scryfall_search") return scryfallSearch(input.query as string);
  if (name === "scryfall_get_card") return scryfallGetCard(input.name as string);
  if (name === "edhrec_recommendations") return edhrecRecommendations(
    input.commander_name as string,
    (input.current_cards as string[]) ?? []
  );
  return JSON.stringify({ error: "Unknown tool" });
}

// Trim conversation history to prevent context bloat
function trimMessages(messages: Array<{ role: string; content: unknown }>): Array<{ role: string; content: unknown }> {
  // Only keep the last 6 user/assistant text exchanges
  const textMessages = messages.filter(m =>
    typeof m.content === "string" || (Array.isArray(m.content) && m.content.every((b: { type: string }) => b.type === "text"))
  );

  if (textMessages.length <= 8) return messages;

  // Keep first message (has initial context) + last 6 messages
  return [textMessages[0], ...textMessages.slice(-6)];
}

export async function POST(req: NextRequest) {
  const { messages, deckContext } = await req.json();

  const systemWithContext = deckContext
    ? `${SYSTEM}\n\nCurrent deck context:\n${deckContext}`
    : SYSTEM;

  // Trim history to keep things fast
  const trimmedMessages = trimMessages(messages) as Anthropic.MessageParam[];

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (text: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
      };

      try {
        let currentMessages: Anthropic.MessageParam[] = [...trimmedMessages];
        let rounds = 0;
        const MAX_ROUNDS = 4; // Reduced from 8 for speed

        while (rounds < MAX_ROUNDS) {
          rounds++;

          const stream = client.messages.stream({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 4096,
            system: systemWithContext,
            messages: currentMessages,
            tools: TOOLS,
          });

          stream.on("text", (text) => send(text));

          const finalMessage = await stream.finalMessage();

          const toolUseBlocks = finalMessage.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );

          if (toolUseBlocks.length === 0) break;

          // Execute tool calls in parallel for speed
          const toolResults = await Promise.all(
            toolUseBlocks.map(async (toolBlock) => ({
              type: "tool_result" as const,
              tool_use_id: toolBlock.id,
              content: await executeToolCall(toolBlock.name, toolBlock.input as Record<string, unknown>),
            }))
          );

          currentMessages = [
            ...currentMessages,
            { role: "assistant" as const, content: finalMessage.content },
            { role: "user" as const, content: toolResults },
          ];
        }
      } catch (err) {
        send(`\n\nError: ${(err as Error).message}`);
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
