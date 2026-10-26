import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, correctionPrompt, detectMode, type AgentContext, type AgentMode } from "./deckAgentPrompts.js";
import { AGENT_TOOLS, buildToolExecutor } from "./deckAgentTools.js";
import { parseAgentText, type AgentResult } from "./agentOutput.js";
import { checkDeck, type DeckCheck } from "./deckCheck.js";
import { lookupCardFacts, normalizeCardName, type CardFact } from "./cardFacts.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const AGENT_MODEL = "claude-opus-5-5";
const MAX_TOKENS = 64_000;
const MAX_TOOL_ROUNDS = 12;
/** Times the model may pick up where it was cut off by the output limit. */
const MAX_CONTINUATIONS = 2;
/** Rounds of "the checker found problems, fix them". */
const MAX_CORRECTIONS = 2;

type Message = Anthropic.Beta.BetaMessageParam;
type ToolExecutor = ReturnType<typeof buildToolExecutor>;

export interface AgentRequest {
  instruction: string;
  bracket: 1 | 2 | 3 | 4 | 5;
  budget: number;
  format: string;
  /** One name, or two for partners. */
  commanders?: string[];
  /** The deck's cards outside the command zone, for upgrades and changes. */
  deck?: Array<{ name: string; quantity: number }>;
  userId?: string;
  sessionMessages?: Message[];
}

export interface AgentCardInfo {
  name: string;
  variantId: string;
  imageUri: string | null;
  priceUsd: number | null;
  typeLine: string | null;
  manaCost: string | null;
  cmc: number | null;
  colorIdentity: string[];
}

function sseJson(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

const toolErrorResult = (id: string, message: string): Anthropic.Beta.BetaToolResultBlockParam => ({
  type: "tool_result",
  tool_use_id: id,
  content: message,
  is_error: true,
});

interface TurnOutcome {
  text: string;
  /** Set when the turn ended without a usable answer. */
  failure?: string;
}

/**
 * One assistant turn: streams text, runs tools until the model is done, and
 * resumes when the output limit cuts it off. Mutates `messages`.
 */
async function* runTurn(
  messages: Message[],
  system: string,
  executeTool: ToolExecutor,
  effort: "medium" | "high"
): AsyncGenerator<string, TurnOutcome> {
  let text = "";
  let continuations = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = client.beta.messages.stream({
      model: AGENT_MODEL,
      max_tokens: MAX_TOKENS,
      system,
      tools: AGENT_TOOLS as Anthropic.Beta.BetaToolUnion[],
      messages,
      thinking: { type: "adaptive" },
      output_config: { effort },
      cache_control: { type: "ephemeral" },
      betas: ["server-side-fallback-2026-07-01" as Anthropic.Beta.AnthropicBeta],
      // Server-side fallback when a request is declined (not yet in the SDK's types).
      ...({ fallbacks: "default" } as object),
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
        yield sseJson({ type: "text", text: event.delta.text });
      } else if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        yield sseJson({ type: "tool_start", tool: event.content_block.name });
      }
    }

    const final = await stream.finalMessage();
    messages.push({ role: "assistant", content: final.content as Anthropic.Beta.BetaContentBlockParam[] });
    const toolBlocks = final.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");

    switch (final.stop_reason) {
      case "refusal":
        return { text, failure: "The AI declined this request. Try rephrasing it." };

      case "max_tokens": {
        // A tool call cut off mid-input can't run; answer it so the history stays valid.
        const cutOff = toolBlocks.map((b) => toolErrorResult(b.id, "Cut off by the output limit; call again if you still need it."));
        if (continuations >= MAX_CONTINUATIONS) {
          if (cutOff.length) messages.push({ role: "user", content: cutOff });
          return { text, failure: "The answer was too long and got cut off." };
        }
        continuations++;
        messages.push({
          role: "user",
          content: [...cutOff, { type: "text", text: "You hit the output limit. Continue exactly where you stopped, without repeating anything." }],
        });
        continue;
      }

      case "pause_turn":
        continue;

      case "tool_use": {
        const results = await Promise.all(
          toolBlocks.map(async (block): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
            try {
              const result = await executeTool(block.name, block.input);
              return { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) };
            } catch (err) {
              return toolErrorResult(block.id, (err as Error).message || "Tool failed");
            }
          })
        );
        for (const block of toolBlocks) yield sseJson({ type: "tool_done", tool: block.name });
        messages.push({ role: "user", content: results });
        continue;
      }

      default:
        return { text };
    }
  }
  return { text, failure: "The AI took too many steps without finishing." };
}

function namesIn(result: AgentResult): string[] {
  return [
    ...result.cards.map((c) => c.name),
    ...result.swaps.flatMap((s) => [s.add.name, s.cut.name]),
  ];
}

function cardInfo(facts: Map<string, CardFact>, names: string[]): AgentCardInfo[] {
  const seen = new Set<string>();
  const out: AgentCardInfo[] = [];
  for (const name of names) {
    const f = facts.get(normalizeCardName(name));
    if (!f || seen.has(name)) continue;
    seen.add(name);
    out.push({
      name,
      variantId: f.variantId,
      imageUri: f.imageUri,
      priceUsd: f.priceUsd,
      typeLine: f.typeLine,
      manaCost: f.manaCost,
      cmc: f.cmc,
      colorIdentity: f.colorIdentity,
    });
  }
  return out;
}

function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError) return "The AI is busy right now. Try again in a minute.";
  if (err instanceof Anthropic.AuthenticationError) return "The AI isn't configured on the server.";
  if (err instanceof Anthropic.APIError) return `The AI service returned an error (${err.status ?? "unknown"}).`;
  return "Something went wrong while building the deck.";
}

/**
 * Run the deck agent and yield SSE-formatted strings: text and tool progress
 * as it works, then a `check` event with the verified result and a `cards`
 * event with each card's image and price.
 */
export async function* runDeckAgent(req: AgentRequest): AsyncGenerator<string> {
  const deck = req.deck ?? [];
  const deckCards = deck.map((c) => c.name);
  const hasDeck = deck.length > 0;
  const mode: AgentMode = detectMode(req.instruction, hasDeck);
  const commanders = (req.commanders ?? []).filter(Boolean);

  const ctx: AgentContext = {
    bracket: req.bracket,
    budget: req.budget,
    format: req.format,
    commander: commanders.join(" and ") || undefined,
    deckCards: deck.map((c) => (c.quantity > 1 ? `${c.quantity}x ${c.name}` : c.name)),
    userId: req.userId,
    instruction: req.instruction,
  };

  const system = buildSystemPrompt(mode, ctx);
  const executeTool = buildToolExecutor({ userId: req.userId, format: req.format });
  const effort = mode === "modify" ? "medium" : "high";
  const messages: Message[] = [...(req.sessionMessages ?? []), { role: "user", content: req.instruction }];

  yield sseJson({ type: "mode", mode });

  try {
    let outcome = yield* runTurn(messages, system, executeTool, effort);
    let text = outcome.text;
    let check: DeckCheck | null = null;
    let facts = new Map<string, CardFact>();
    let result = parseAgentText(text);

    if (!outcome.failure && !result.escalated) {
      const commanderFacts = await lookupCardFacts(commanders);
      for (let round = 0; ; round++) {
        result = parseAgentText(text);
        facts = await lookupCardFacts(namesIn(result));
        check = checkDeck({
          mode,
          format: req.format,
          result,
          facts,
          commanders: commanders.flatMap((c) => commanderFacts.get(normalizeCardName(c)) ?? []),
          budget: req.budget,
          deckCards,
        });
        if (check.ok || round >= MAX_CORRECTIONS) break;

        yield sseJson({ type: "check", ok: false, fixing: true, issues: check.issues });
        messages.push({ role: "user", content: correctionPrompt(check.issues) });
        yield sseJson({ type: "text", text: "\n" });
        outcome = yield* runTurn(messages, system, executeTool, effort);
        text += `\n${outcome.text}`;
        if (outcome.failure) break;
      }
    }

    if (outcome.failure) yield sseJson({ type: "error", message: outcome.failure });
    if (check) {
      yield sseJson({ type: "check", ok: check.ok, fixing: false, issues: check.issues, cardCount: check.cardCount, totalPrice: check.totalPrice });
    }
    yield sseJson({ type: "cards", cards: cardInfo(facts, namesIn(result)) });
  } catch (err) {
    yield sseJson({ type: "error", message: friendlyError(err) });
  }

  // Updated history for session persistence by the route layer.
  yield sseJson({ type: "session", messages });
  yield "data: [DONE]\n\n";
}
