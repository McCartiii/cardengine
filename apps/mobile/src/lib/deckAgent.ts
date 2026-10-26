// The deck agent on mobile: streams /v1/deck/agent and folds what arrives
// into one state object for the screen. The line parser is a copy of
// apps/api/src/services/agentOutput.ts (the server uses it to check the
// picks); keep the copies in step.
import { postSse } from "./sse";

export type AgentImportance = "critical" | "high" | "flex";

export interface AgentCard {
  name: string;
  quantity: number;
  reason: string;
  gameplay: string;
  importance: AgentImportance;
  tier: string;
}

export interface AgentSwap {
  cut: { name: string; reason: string };
  add: { name: string; reason: string };
  netSynergy: number;
}

export type AgentLineEvent =
  | { type: "status"; message: string }
  | { type: "escalate"; message: string }
  | { type: "tier"; name: string }
  | { type: "card"; card: AgentCard }
  | { type: "swap"; swap: AgentSwap }
  | { type: "replace"; from: string; to: string; reason: string }
  | { type: "remove"; name: string };

/** "12x Forest" / "12 Forest" → { quantity: 12, name: "Forest" }. */
export function splitQuantity(raw: string): { quantity: number; name: string } {
  const m = raw.trim().match(/^(\d{1,2})\s*x?\s+(.+)$/i);
  if (!m) return { quantity: 1, name: raw.trim() };
  return { quantity: Math.max(1, parseInt(m[1], 10)), name: m[2].trim() };
}

const IMPORTANCE = new Set(["critical", "high", "flex"]);

export class AgentLineParser {
  private tier = "";
  private card: AgentCard | null = null;
  private swap: AgentSwap | null = null;
  private replace: { from: string; to: string; reason: string } | null = null;
  private pending = "";

  /** Feed streamed text; returns the events completed so far. */
  push(text: string): AgentLineEvent[] {
    this.pending += text;
    const lines = this.pending.split("\n");
    this.pending = lines.pop() ?? "";
    const out: AgentLineEvent[] = [];
    for (const line of lines) this.line(line, out);
    return out;
  }

  /** Call at the end of the stream to emit whatever is still buffered. */
  end(): AgentLineEvent[] {
    const out: AgentLineEvent[] = [];
    if (this.pending) this.line(this.pending, out);
    this.pending = "";
    this.flushAll(out);
    return out;
  }

  private flushAll(out: AgentLineEvent[]) {
    if (this.card) out.push({ type: "card", card: this.card });
    if (this.swap?.cut.name && this.swap.add.name) out.push({ type: "swap", swap: this.swap });
    if (this.replace?.from && this.replace.to) out.push({ type: "replace", ...this.replace });
    this.card = null;
    this.swap = null;
    this.replace = null;
  }

  private line(raw: string, out: AgentLineEvent[]) {
    // Tolerate markdown the model sometimes adds: "- **CARD:** Sol Ring".
    const line = raw.trim().replace(/^[-*•]\s+/, "").replace(/^\*\*([A-Z_]+:)\*\*/, "$1");
    const m = line.match(/^([A-Z_]+):\s*(.*)$/);
    if (!m) return;
    const [, key, value] = m;
    switch (key) {
      case "STATUS":
        if (value.startsWith("ESCALATE")) out.push({ type: "escalate", message: value });
        else out.push({ type: "status", message: value });
        return;
      case "TIER":
        this.flushAll(out);
        this.tier = value;
        out.push({ type: "tier", name: value });
        return;
      case "CARD": {
        this.flushAll(out);
        const { quantity, name } = splitQuantity(value);
        this.card = { name, quantity, reason: "", gameplay: "", importance: "flex", tier: this.tier };
        return;
      }
      case "REASON":
        if (this.card) this.card.reason = value;
        return;
      case "GAMEPLAY":
        if (this.card) this.card.gameplay = value;
        return;
      case "IMPORTANCE": {
        const v = value.toLowerCase();
        if (this.card && IMPORTANCE.has(v)) this.card.importance = v as AgentImportance;
        return;
      }
      case "CUT":
        this.flushAll(out);
        this.swap = { cut: { name: value, reason: "" }, add: { name: "", reason: "" }, netSynergy: 0 };
        return;
      case "CUT_REASON":
        if (this.swap) this.swap.cut.reason = value;
        return;
      case "ADD":
        if (this.swap) this.swap.add.name = value;
        return;
      case "ADD_REASON":
        if (this.swap) this.swap.add.reason = value;
        return;
      case "NET_SYNERGY":
        if (this.swap) this.swap.netSynergy = parseFloat(value) || 0;
        return;
      case "REPLACE":
        this.flushAll(out);
        this.replace = { from: value, to: "", reason: "" };
        return;
      case "WITH":
        if (this.replace) this.replace.to = value;
        return;
      case "WHY":
        if (this.replace) this.replace.reason = value;
        return;
      case "REMOVE":
        this.flushAll(out);
        out.push({ type: "remove", name: value });
        return;
    }
  }
}

export interface AgentResult {
  cards: AgentCard[];
  swaps: AgentSwap[];
  escalated: boolean;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Folds events into the current picks, applying corrections as they arrive. */
export function applyAgentEvent(result: AgentResult, e: AgentLineEvent): AgentResult {
  switch (e.type) {
    case "card":
      return { ...result, cards: [...result.cards, e.card] };
    case "swap":
      return { ...result, swaps: [...result.swaps, e.swap] };
    case "escalate":
      return { ...result, escalated: true };
    case "replace": {
      const cards = result.cards.map((c) => (same(c.name, e.from) ? { ...c, name: e.to, reason: e.reason || c.reason } : c));
      const swaps = result.swaps.map((s) =>
        same(s.add.name, e.from) ? { ...s, add: { name: e.to, reason: e.reason || s.add.reason } } : s
      );
      return { ...result, cards, swaps };
    }
    case "remove":
      return {
        ...result,
        cards: result.cards.filter((c) => !same(c.name, e.name)),
        swaps: result.swaps.filter((s) => !same(s.add.name, e.name) && !same(s.cut.name, e.name)),
      };
    default:
      return result;
  }
}

export function parseAgentText(text: string): AgentResult {
  const parser = new AgentLineParser();
  let result: AgentResult = { cards: [], swaps: [], escalated: false };
  for (const e of [...parser.push(text), ...parser.end()]) result = applyAgentEvent(result, e);
  return result;
}

// ── Agent session state ───────────────────────────────────────────────────────

export type AgentMode = "build" | "upgrade" | "modify";

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

export interface AgentCheck {
  ok: boolean;
  fixing: boolean;
  issues: string[];
  cardCount?: number;
  totalPrice?: number;
}

export interface AgentState {
  running: boolean;
  mode: AgentMode | null;
  status: string | null;
  /** Tools the agent has used, in order, with whether each is still running. */
  tools: Array<{ name: string; running: boolean }>;
  result: AgentResult;
  tiers: string[];
  escalation: string | null;
  check: AgentCheck | null;
  info: Record<string, AgentCardInfo>;
  error: string | null;
  sessionId: string | null;
}

export const initialAgentState: AgentState = {
  running: false,
  mode: null,
  status: null,
  tools: [],
  result: { cards: [], swaps: [], escalated: false },
  tiers: [],
  escalation: null,
  check: null,
  info: {},
  error: null,
  sessionId: null,
};

export interface AgentRunRequest {
  instruction: string;
  bracket: 1 | 2 | 3 | 4 | 5;
  budget: number;
  deckId?: string;
  format?: string;
  commander?: string;
  sessionId?: string;
}

function applyLine(state: AgentState, e: AgentLineEvent): AgentState {
  switch (e.type) {
    case "status":
      return { ...state, status: e.message };
    case "escalate":
      return { ...state, escalation: e.message.replace(/^ESCALATE\s*[—-]\s*/, ""), result: applyAgentEvent(state.result, e) };
    case "tier":
      return state.tiers.includes(e.name) ? state : { ...state, tiers: [...state.tiers, e.name] };
    default:
      return { ...state, result: applyAgentEvent(state.result, e) };
  }
}

/**
 * Runs the agent, calling `onState` with each new state. Resolves with the
 * final state; never throws (errors land in `state.error`).
 */
export async function runDeckAgent(req: AgentRunRequest, onState: (s: AgentState) => void, signal?: AbortSignal): Promise<AgentState> {
  // A refinement keeps the earlier answer until the new one arrives.
  let state: AgentState = { ...initialAgentState, running: true, sessionId: req.sessionId ?? null, status: "Shuffling up…" };
  const parser = new AgentLineParser();
  const set = (next: AgentState) => {
    state = next;
    onState(state);
  };
  const lines = (events: AgentLineEvent[]) => {
    if (events.length) set(events.reduce(applyLine, state));
  };
  set(state);

  try {
    await postSse(
      "/v1/deck/agent",
      req,
      (e) => {
        switch (e.type) {
          case "mode":
            set({ ...state, mode: e.mode as AgentMode });
            break;
          case "tool_start":
            set({ ...state, tools: [...state.tools, { name: e.tool as string, running: true }] });
            break;
          case "tool_done": {
            const i = state.tools.findIndex((t) => t.name === e.tool && t.running);
            if (i >= 0) set({ ...state, tools: state.tools.map((t, j) => (j === i ? { ...t, running: false } : t)) });
            break;
          }
          case "text":
            lines(parser.push(e.text as string));
            break;
          case "check":
            lines(parser.end());
            set({ ...state, check: e as unknown as AgentCheck, status: (e as unknown as AgentCheck).fixing ? "Fixing a few picks…" : state.status });
            break;
          case "cards":
            set({ ...state, info: Object.fromEntries((e.cards as AgentCardInfo[]).map((c) => [c.name.toLowerCase(), c])) });
            break;
          case "error":
            set({ ...state, error: e.message as string });
            break;
          case "session_id":
            set({ ...state, sessionId: e.id as string });
            break;
        }
      },
      signal
    );
    lines(parser.end());
  } catch (err) {
    if ((err as Error).name !== "AbortError") set({ ...state, error: (err as Error).message || "Something went wrong." });
  }
  set({ ...state, running: false, status: null, tools: state.tools.map((t) => ({ ...t, running: false })) });
  return state;
}

export function cardInfo(state: AgentState, name: string): AgentCardInfo | undefined {
  return state.info[name.toLowerCase()];
}
