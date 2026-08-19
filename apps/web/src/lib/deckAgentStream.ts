const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Event types ───────────────────────────────────────────────────────────────

export type AgentMode = "build" | "upgrade" | "modify";

export interface ParsedCard {
  name: string;
  reason: string;
  gameplay: string;
  importance: "critical" | "high" | "flex";
  tier: string;
}

export interface ParsedSwap {
  cut: { name: string; reason: string };
  add: { name: string; reason: string };
  netSynergy: number;
}

export interface DeckValidationIssue {
  severity: "error" | "warn";
  code: string;
  message: string;
  cards?: string[];
}

export interface DeckValidationResult {
  valid: boolean;
  issues: DeckValidationIssue[];
  metrics: {
    mainCount: number;
    sideCount: number;
    deckSizeIncludingCommander: number;
    estimatedPriceUsd: number | null;
    unknownCards: string[];
    duplicateCards: string[];
  };
  repairHints: string[];
}

export interface AgentSessionContext {
  format: AgentStreamRequest["format"];
  bracket: 1 | 2 | 3 | 4 | 5;
  budget: number;
  commander: string | null;
  blueprint: AgentStreamRequest["blueprint"] | null;
}

export type AgentEvent =
  | { type: "mode"; mode: AgentMode }
  | { type: "tool_start"; tool: string }
  | { type: "tool_done"; tool: string }
  | { type: "tool_result"; tool: string; result: unknown }
  | { type: "status"; message: string }
  | { type: "tier"; name: string }
  | { type: "card"; card: ParsedCard; tier: string }
  | { type: "swap"; swap: ParsedSwap }
  | { type: "escalate"; message: string }
  | { type: "session_id"; id: string }
  | { type: "session_context"; context: AgentSessionContext }
  | { type: "done" };

// ── Stream parser ─────────────────────────────────────────────────────────────

class StreamParser {
  private currentTier = "";
  private cardBuffer: Partial<ParsedCard> | null = null;
  private swapBuffer: Partial<{ cut: { name: string; reason: string }; add: { name: string; reason: string }; netSynergy: number }> | null = null;
  private textBuffer = "";

  parse(text: string): AgentEvent[] {
    const events: AgentEvent[] = [];
    this.textBuffer += text;

    const lines = this.textBuffer.split("\n");
    this.textBuffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith("STATUS: ")) {
        const message = trimmed.slice(8).trim();
        if (message.startsWith("ESCALATE")) {
          events.push({ type: "escalate", message });
        } else {
          events.push({ type: "status", message });
        }
        continue;
      }

      if (trimmed.startsWith("TIER: ")) {
        const cardEvt = this.flushCard();
        if (cardEvt) events.push(cardEvt);
        const swapEvt = this.flushSwap();
        if (swapEvt) events.push(swapEvt);
        this.currentTier = trimmed.slice(6).trim();
        events.push({ type: "tier", name: this.currentTier });
        continue;
      }

      if (trimmed.startsWith("CARD: ")) {
        const cardEvt = this.flushCard();
        if (cardEvt) events.push(cardEvt);
        this.cardBuffer = { name: trimmed.slice(6).trim(), tier: this.currentTier };
        continue;
      }

      if (trimmed.startsWith("REASON: ") && this.cardBuffer) {
        this.cardBuffer.reason = trimmed.slice(8).trim();
        continue;
      }

      if (trimmed.startsWith("GAMEPLAY: ") && this.cardBuffer) {
        this.cardBuffer.gameplay = trimmed.slice(10).trim();
        continue;
      }

      if (trimmed.startsWith("IMPORTANCE: ") && this.cardBuffer) {
        this.cardBuffer.importance = trimmed.slice(12).trim().toLowerCase() as ParsedCard["importance"];
        continue;
      }

      if (trimmed.startsWith("CUT: ")) {
        const swapEvt = this.flushSwap();
        if (swapEvt) events.push(swapEvt);
        this.swapBuffer = { cut: { name: trimmed.slice(5).trim(), reason: "" }, add: { name: "", reason: "" }, netSynergy: 0 };
        continue;
      }

      if (trimmed.startsWith("CUT_REASON: ") && this.swapBuffer?.cut) {
        this.swapBuffer.cut.reason = trimmed.slice(12).trim();
        continue;
      }

      if (trimmed.startsWith("ADD: ") && this.swapBuffer) {
        this.swapBuffer.add = { name: trimmed.slice(5).trim(), reason: "" };
        continue;
      }

      if (trimmed.startsWith("ADD_REASON: ") && this.swapBuffer?.add) {
        this.swapBuffer.add.reason = trimmed.slice(12).trim();
        continue;
      }

      if (trimmed.startsWith("NET_SYNERGY: ") && this.swapBuffer) {
        this.swapBuffer.netSynergy = parseFloat(trimmed.slice(13).trim()) || 0;
        continue;
      }
    }

    return events;
  }

  flush(): AgentEvent[] {
    const events: AgentEvent[] = [];
    const cardEvt = this.flushCard();
    if (cardEvt) events.push(cardEvt);
    const swapEvt = this.flushSwap();
    if (swapEvt) events.push(swapEvt);
    return events;
  }

  private flushCard(): AgentEvent | null {
    if (!this.cardBuffer?.name) return null;
    const card: ParsedCard = {
      name: this.cardBuffer.name,
      reason: this.cardBuffer.reason ?? "",
      gameplay: this.cardBuffer.gameplay ?? "",
      importance: this.cardBuffer.importance ?? "flex",
      tier: this.cardBuffer.tier ?? this.currentTier,
    };
    this.cardBuffer = null;
    return { type: "card", card, tier: card.tier };
  }

  private flushSwap(): AgentEvent | null {
    if (!this.swapBuffer?.cut?.name || !this.swapBuffer?.add?.name) return null;
    const swap: ParsedSwap = {
      cut: this.swapBuffer.cut as { name: string; reason: string },
      add: this.swapBuffer.add as { name: string; reason: string },
      netSynergy: this.swapBuffer.netSynergy ?? 0,
    };
    this.swapBuffer = null;
    return { type: "swap", swap };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface AgentStreamRequest {
  instruction: string;
  format: "commander" | "standard" | "pioneer" | "modern" | "legacy" | "vintage" | "pauper";
  bracket: 1 | 2 | 3 | 4 | 5;
  budget: number;
  commander?: string;
  /** Editor list (one name per copy). Ignored by API if deckUrl/deckText/deckId is sent. */
  deckCards?: string[];
  deckText?: string;
  deckUrl?: string;
  deckId?: string;
  sessionId?: string;
  token?: string;
  blueprint?: {
    goals?: string[];
    keyCards?: string[];
    avoidCards?: string[];
    modelAfter?: string;
    playSpeed?: "slow" | "balanced" | "fast";
    comboTolerance?: "none" | "low" | "medium" | "high";
    tablePressure?: "low" | "medium" | "high";
    notes?: string;
  };
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

  const res = await fetch(`${API_URL}/v1/deck/agent`, {
    method: "POST",
    headers,
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Agent error: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = new StreamParser();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          for (const evt of parser.flush()) onEvent(evt);
          onEvent({ type: "done" });
          return;
        }

        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;

          if (parsed.type === "mode") {
            onEvent({ type: "mode", mode: parsed.mode as AgentMode });
          } else if (parsed.type === "tool_start") {
            onEvent({ type: "tool_start", tool: parsed.tool as string });
          } else if (parsed.type === "tool_done") {
            onEvent({ type: "tool_done", tool: parsed.tool as string });
          } else if (parsed.type === "tool_result") {
            onEvent({
              type: "tool_result",
              tool: parsed.tool as string,
              result: parsed.result,
            });
          } else if (parsed.type === "session_id") {
            onEvent({ type: "session_id", id: parsed.id as string });
          } else if (parsed.type === "session_context") {
            onEvent({
              type: "session_context",
              context: parsed.context as AgentSessionContext,
            });
          } else if (parsed.type === "text") {
            const evts = parser.parse(parsed.text as string);
            for (const evt of evts) onEvent(evt);
          }
        } catch {
          // Malformed SSE line — skip
        }
      }
    }
  }
}
