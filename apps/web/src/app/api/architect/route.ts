import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

const SYSTEM = `You are an expert Magic: The Gathering deck architect with deep knowledge of all formats, strategies, card synergies, and the competitive metagame.

When asked to improve or analyze a deck, you:
1. Identify the deck strategy and win conditions
2. Highlight specific weaknesses
3. Suggest concrete card swaps with quantities and explanations
4. Recommend budget alternatives where possible

When asked to build a deck from scratch, you:
1. Define a clear strategy and win condition
2. Provide a complete card list with quantities
3. Explain the mana base and curve
4. Describe how to pilot the deck

Format card suggestions EXACTLY like this so they can be parsed and imported:
CARDS:
4 Lightning Bolt
4 Monastery Swiftspear
2 Goblin Guide
END_CARDS

Always use real MTG card names. Quantities must be 1-4 for non-commander (100 card singleton for commander).`;

export async function POST(req: NextRequest) {
  const { messages, deckContext } = await req.json();

  const systemWithContext = deckContext
    ? `${SYSTEM}\n\nCurrent deck context:\n${deckContext}`
    : SYSTEM;

  const stream = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    system: systemWithContext,
    messages,
    stream: true,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
          );
        }
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
