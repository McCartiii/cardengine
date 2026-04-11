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

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: "scryfall_search",
    description:
      "Search the Scryfall MTG card database. Use Scryfall search syntax. Examples: 'is:commander color:wubg', 'type:instant cmc<=2 color:blue', 'set:sld name:jin'. Returns up to 8 results with full card data. ALWAYS use this to verify card names and find cards — never rely on memory alone.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Scryfall search query (supports full Scryfall syntax)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "scryfall_get_card",
    description:
      "Look up a specific card by name using fuzzy matching. Returns full card details including oracle text, color identity, legality, price, and EDHREC rank. Use this to verify a card exists or get its exact stats.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Card name (fuzzy matched)",
        },
      },
      required: ["name"],
    },
  },
];

// ── System prompt ────────────────────────────────────────────────────────────

const SYSTEM = `You are an expert Magic: The Gathering deck architect with access to the complete Scryfall card database via tools.

CRITICAL RULES:
- ALWAYS use scryfall_get_card to verify any card you mention. Never guess card names or abilities from memory.
- ALWAYS use scryfall_search to find cards for recommendations. Your training data may be missing recent sets, Secret Lair drops, Universes Beyond, and errata.
- If the user's commander or deck name references a card you don't recognize, look it up on Scryfall FIRST before making assumptions.
- When suggesting cards, verify each one exists and is legal in the format.
- Use real, current data from Scryfall, not memory.

When asked to improve or analyze a deck, you:
1. Look up the commander on Scryfall to understand its abilities and color identity
2. Search for synergistic cards using targeted Scryfall queries
3. Suggest concrete card swaps with quantities and explanations
4. Recommend budget alternatives where possible

When asked to build a deck from scratch, you:
1. Look up the commander on Scryfall first
2. Search for key staples and synergy pieces
3. Provide a complete card list with quantities
4. Explain the mana base and curve
5. Describe how to pilot the deck

Format card suggestions EXACTLY like this so they can be parsed and imported:
CARDS:
4 Lightning Bolt
4 Monastery Swiftspear
2 Goblin Guide
END_CARDS

Always use real MTG card names verified through Scryfall. Quantities must be 1-4 for non-commander (100 card singleton for commander).`;

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { messages, deckContext } = await req.json();

  const systemWithContext = deckContext
    ? `${SYSTEM}\n\nCurrent deck context:\n${deckContext}`
    : SYSTEM;

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        // Run an agentic loop with tool use
        let currentMessages = [...messages];
        let keepGoing = true;

        while (keepGoing) {
          const response = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: systemWithContext,
            messages: currentMessages,
            tools: TOOLS,
            stream: false,
          });

          // Process the response blocks
          let hasToolUse = false;
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const block of response.content) {
            if (block.type === "text") {
              // Stream text chunks to the client
              const chunks = block.text.match(/.{1,50}/g) ?? [block.text];
              for (const chunk of chunks) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
                );
              }
            } else if (block.type === "tool_use") {
              hasToolUse = true;
              // Execute the tool
              let result: string;
              const input = block.input as Record<string, string>;
              if (block.name === "scryfall_search") {
                result = await scryfallSearch(input.query);
              } else if (block.name === "scryfall_get_card") {
                result = await scryfallGetCard(input.name);
              } else {
                result = JSON.stringify({ error: "Unknown tool" });
              }

              // Send a small indicator to the client
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: "" })}\n\n`)
              );

              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: result,
              });
            }
          }

          if (hasToolUse) {
            // Continue the conversation with tool results
            currentMessages = [
              ...currentMessages,
              { role: "assistant" as const, content: response.content },
              { role: "user" as const, content: toolResults },
            ];
          } else {
            keepGoing = false;
          }

          // Safety: stop after too many tool rounds
          if (currentMessages.length > messages.length + 20) {
            keepGoing = false;
          }
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ text: `\n\nError: ${(err as Error).message}` })}\n\n`)
        );
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
