import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, detectMode, type AgentContext, type AgentMode, type DeckBlueprint, type DeckFormat } from "./deckAgentPrompts.js";
import { AGENT_TOOLS, buildToolExecutor } from "./deckAgentTools.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface AgentRequest {
  instruction: string;
  format: DeckFormat;
  bracket: 1 | 2 | 3 | 4 | 5;
  budget: number;
  commander?: string;
  deckCards?: string[];
  userId?: string;
  sessionMessages?: Anthropic.MessageParam[];
  blueprint?: DeckBlueprint;
}

/**
 * Run the deck agent and yield SSE-formatted strings.
 * Each yielded string is a complete SSE data line ready to write to the HTTP response.
 */
export async function* runDeckAgent(req: AgentRequest): AsyncGenerator<string> {
  const hasDeck = (req.deckCards?.length ?? 0) > 0;
  const mode: AgentMode = detectMode(req.instruction, hasDeck);

  const ctx: AgentContext = {
    format: req.format,
    bracket: req.bracket,
    budget: req.budget,
    commander: req.commander,
    deckCards: req.deckCards,
    userId: req.userId,
    instruction: req.instruction,
    blueprint: req.blueprint,
  };

  const systemPrompt = buildSystemPrompt(mode, ctx);
  const executeTool = buildToolExecutor(req.userId, {
    format: req.format,
    bracket: req.bracket,
    budget: req.budget,
    commander: req.commander,
    blueprint: req.blueprint,
  });

  const messages: Anthropic.MessageParam[] = [
    ...(req.sessionMessages ?? []),
    { role: "user", content: req.instruction },
  ];

  // Emit mode so the client knows how to render output
  yield sseJson({ type: "mode", mode });

  let iterations = 0;
  const MAX_ITERATIONS = 12;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const stream = client.messages.stream({
      model: "claude-opus-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      tools: AGENT_TOOLS,
      messages,
    });

    // Stream text deltas immediately to SSE
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield sseJson({ type: "text", text: event.delta.text });
      }

      if (
        event.type === "content_block_start" &&
        event.content_block.type === "tool_use"
      ) {
        yield sseJson({ type: "tool_start", tool: event.content_block.name });
      }
    }

    const finalMsg = await stream.finalMessage();
    messages.push({ role: "assistant", content: finalMsg.content });

    if (finalMsg.stop_reason === "end_turn") break;

    if (finalMsg.stop_reason === "tool_use") {
      const toolBlocks = finalMsg.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      // Execute all tool calls in parallel, then yield results sequentially
      const results = await Promise.all(
        toolBlocks.map(async (block) => {
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>
          );
          return { block, result };
        })
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const { block, result } of results) {
        yield sseJson({ type: "tool_done", tool: block.name });
        if (block.name === "validate_deck" || block.name === "lint_commander_deck") {
          yield sseJson({ type: "tool_result", tool: block.name, result });
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  // Return updated messages for session persistence by the route layer
  yield sseJson({ type: "session", messages });
  yield "data: [DONE]\n\n";
}

function sseJson(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}
