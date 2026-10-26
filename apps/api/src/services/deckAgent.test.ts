import { describe, it, expect, vi, beforeEach } from "vitest";

// Scripted model turns: each call to stream() plays the next one.
type Turn = { text: string; stop: string; toolUse?: { id: string; name: string; input: unknown } };
const script: Turn[] = [];
const requests: Array<Record<string, unknown>> = [];

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
  }
  class RateLimitError extends APIError {}
  class AuthenticationError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static RateLimitError = RateLimitError;
    static AuthenticationError = AuthenticationError;
    beta = {
      messages: {
        stream: (params: Record<string, unknown>) => {
          requests.push(structuredClone(params));
          const turn = script.shift();
          if (!turn) throw new Error("No scripted turn left");
          const content: unknown[] = [{ type: "text", text: turn.text }];
          if (turn.toolUse) content.push({ type: "tool_use", ...turn.toolUse });
          return {
            async *[Symbol.asyncIterator]() {
              yield { type: "content_block_delta", delta: { type: "text_delta", text: turn.text } };
              if (turn.toolUse) yield { type: "content_block_start", content_block: { type: "tool_use", name: turn.toolUse.name } };
            },
            finalMessage: async () => ({ content, stop_reason: turn.stop }),
          };
        },
      },
    };
  }
  return { default: Anthropic };
});

const facts: Record<string, Record<string, unknown>> = {
  "meren of clan nel toth": { name: "Meren of Clan Nel Toth", colorIdentity: ["B", "G"] },
  "sol ring": { name: "Sol Ring", colorIdentity: [], priceUsd: 2, legalities: { commander: "legal" } },
  "mana crypt": { name: "Mana Crypt", colorIdentity: [], priceUsd: 180, legalities: { commander: "banned" } },
  "arcane signet": { name: "Arcane Signet", colorIdentity: [], priceUsd: 1, legalities: { commander: "legal" } },
  forest: { name: "Forest", colorIdentity: ["G"], typeLine: "Basic Land — Forest", priceUsd: 0.1, legalities: { commander: "legal" } },
};

vi.mock("./cardFacts.js", async () => {
  const { normalizeCardName } = await import("../lib/cardName.js");
  return {
    normalizeCardName,
    lookupCardFacts: async (names: string[]) =>
      new Map(
        names
          .map(normalizeCardName)
          .filter((n) => facts[n])
          .map((n) => [n, { variantId: `v-${n}`, imageUri: null, typeLine: null, manaCost: null, oracleText: null, cmc: null, priceUsd: null, legalities: null, ...facts[n] }])
      ),
  };
});

vi.mock("./deckAgentTools.js", () => ({
  AGENT_TOOLS: [],
  buildToolExecutor: () => async () => ({ ok: true }),
}));

import { runDeckAgent } from "./deckAgent.js";

async function run(req: Parameters<typeof runDeckAgent>[0]) {
  const events: Array<Record<string, unknown>> = [];
  for await (const chunk of runDeckAgent(req)) {
    const data = chunk.replace(/^data: /, "").trim();
    if (data !== "[DONE]") events.push(JSON.parse(data));
  }
  return events;
}

beforeEach(() => {
  script.length = 0;
  requests.length = 0;
});

describe("runDeckAgent", () => {
  it("continues after the output limit, then fixes what the checker finds", async () => {
    script.push(
      { text: "TIER: Ramp\nCARD: Sol Ring\nCARD: Mana Crypt\n", stop: "max_tokens", toolUse: { id: "t1", name: "get_card_details", input: {} } },
      { text: "TIER: Lands\nCARD: 97x Forest\nSTATUS: Done.\n", stop: "end_turn" },
      { text: "REPLACE: Mana Crypt\nWITH: Arcane Signet\nWHY: Crypt is banned.\nSTATUS: Done.\n", stop: "end_turn" }
    );

    const events = await run({ instruction: "Build Meren", bracket: 3, budget: 100, format: "commander", commanders: ["Meren of Clan Nel Toth"], userId: "u1" });

    expect(requests).toHaveLength(3);
    expect(requests[0]).toMatchObject({
      model: "claude-opus-5-5",
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
    });
    // The cut-off tool call is answered with an error before asking to continue.
    const continuation = (requests[1].messages as Array<{ role: string; content: unknown }>).at(-1)!;
    expect(continuation.role).toBe("user");
    expect(continuation.content).toEqual([
      expect.objectContaining({ type: "tool_result", tool_use_id: "t1", is_error: true }),
      expect.objectContaining({ type: "text", text: expect.stringContaining("Continue exactly where you stopped") }),
    ]);
    // The checker's findings go back to the model.
    const correction = (requests[2].messages as Array<{ role: string; content: unknown }>).at(-1)!;
    expect(correction.content).toEqual(expect.stringContaining("Mana Crypt is banned in Commander"));

    const checks = events.filter((e) => e.type === "check");
    expect(checks[0]).toMatchObject({ ok: false, fixing: true });
    expect(checks.at(-1)).toMatchObject({ ok: true, fixing: false, cardCount: 99 });
    const cards = events.find((e) => e.type === "cards")!.cards as Array<{ name: string }>;
    expect(cards.map((c) => c.name)).toEqual(["Sol Ring", "Arcane Signet", "Forest"]);
    expect(events.at(-1)).toMatchObject({ type: "session" });
  });

  it("stops at a refusal and says so", async () => {
    script.push({ text: "", stop: "refusal" });
    const events = await run({ instruction: "Build", bracket: 2, budget: 0, format: "commander", userId: "u1" });
    expect(events.find((e) => e.type === "error")).toMatchObject({ message: expect.stringContaining("declined") });
    expect(requests).toHaveLength(1);
  });

  it("uses medium effort for small changes and reports issues it couldn't fix", async () => {
    script.push(
      { text: "CUT: Not There\nADD: Sol Ring\n", stop: "end_turn" },
      { text: "STATUS: Done.\n", stop: "end_turn" },
      { text: "STATUS: Done.\n", stop: "end_turn" }
    );
    const events = await run({
      instruction: "swap in some ramp",
      bracket: 2,
      budget: 0,
      format: "commander",
      commanders: ["Meren of Clan Nel Toth"],
      deck: [{ name: "Divination", quantity: 1 }],
      userId: "u1",
    });
    expect(requests[0].output_config).toEqual({ effort: "medium" });
    expect(events.find((e) => e.type === "mode")).toEqual({ type: "mode", mode: "modify" });
    expect(requests).toHaveLength(3);
    expect(events.filter((e) => e.type === "check").at(-1)).toMatchObject({ ok: false, issues: ["Not There is suggested as a cut but isn't in the deck."] });
  });
});
