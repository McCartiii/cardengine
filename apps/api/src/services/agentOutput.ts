// Parses the deck agent's line format. The same parser runs on the server
// (to check the picks) and in the web and mobile clients (to render them as
// they stream), so it has no dependencies. Keep the copies in
// apps/web/src/lib/deckAgentStream.ts and apps/mobile/src/lib/deckAgent.ts in step.

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
