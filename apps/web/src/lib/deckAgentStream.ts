// Client for the deck agent's SSE stream. The line parser below is a copy of
// apps/api/src/services/agentOutput.ts (the server uses it to check the
// picks); keep the copies in step.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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

// ── Stream events ─────────────────────────────────────────────────────────────

export type AgentMode = "build" | "upgrade" | "modify";
export type ParsedCard = AgentCard;
export type ParsedSwap = AgentSwap;

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
  /** True while the agent is fixing these issues. */
  fixing: boolean;
  issues: string[];
  cardCount?: number;
  totalPrice?: number;
}

export type AgentEvent =
  | { type: "mode"; mode: AgentMode }
  | { type: "tool_start"; tool: string }
  | { type: "tool_done"; tool: string }
  | { type: "status"; message: string }
  | { type: "tier"; name: string }
  | { type: "card"; card: ParsedCard; tier: string }
  | { type: "swap"; swap: ParsedSwap }
  | { type: "replace"; from: string; to: string; reason: string }
  | { type: "remove"; name: string }
  | { type: "escalate"; message: string }
  | { type: "check"; check: AgentCheck }
  | { type: "cards"; cards: AgentCardInfo[] }
  | { type: "error"; message: string }
  | { type: "session_id"; id: string }
  | { type: "done" };

function toAgentEvent(e: AgentLineEvent): AgentEvent {
  return e.type === "card" ? { type: "card", card: e.card, tier: e.card.tier } : e;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface AgentStreamRequest {
  instruction: string;
  bracket: 1 | 2 | 3 | 4 | 5;
  budget: number;
  format?: string;
  commander?: string;
  deckText?: string;
  deckUrl?: string;
  deckId?: string;
  sessionId?: string;
  token?: string;
}

/**
 * Connect to the deck agent SSE stream and call onEvent for each parsed event.
 */
export async function streamDeckAgent(
  req: AgentStreamRequest,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (req.token) headers["Authorization"] = `Bearer ${req.token}`;
  const body: Omit<AgentStreamRequest, "token"> & { token?: string } = { ...req };
  delete body.token;

  const res = await fetch(`${API_URL}/v1/deck/agent`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    if (res.status === 401) throw new Error("Sign in to use the deck AI.");
    const err = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(err?.error ?? `Agent error: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = new AgentLineParser();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") {
        for (const evt of parser.end()) onEvent(toAgentEvent(evt));
        onEvent({ type: "done" });
        return;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(data) as Record<string, unknown>;
      } catch {
        continue; // Malformed SSE line
      }
      switch (parsed.type) {
        case "mode":
          onEvent({ type: "mode", mode: parsed.mode as AgentMode });
          break;
        case "tool_start":
        case "tool_done":
          onEvent({ type: parsed.type, tool: parsed.tool as string });
          break;
        case "session_id":
          onEvent({ type: "session_id", id: parsed.id as string });
          break;
        case "text":
          for (const evt of parser.push(parsed.text as string)) onEvent(toAgentEvent(evt));
          break;
        case "check":
          // Flush first so the check applies to everything streamed so far.
          for (const evt of parser.end()) onEvent(toAgentEvent(evt));
          onEvent({ type: "check", check: parsed as unknown as AgentCheck });
          break;
        case "cards":
          onEvent({ type: "cards", cards: parsed.cards as AgentCardInfo[] });
          break;
        case "error":
          onEvent({ type: "error", message: parsed.message as string });
          break;
      }
    }
  }
  for (const evt of parser.end()) onEvent(toAgentEvent(evt));
  onEvent({ type: "done" });
}
