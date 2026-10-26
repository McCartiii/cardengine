import { describe, it, expect } from "vitest";
import { AgentLineParser, parseAgentText, splitQuantity } from "./agentOutput.js";

describe("splitQuantity", () => {
  it("reads 12x and plain counts", () => {
    expect(splitQuantity("12x Forest")).toEqual({ quantity: 12, name: "Forest" });
    expect(splitQuantity("3 Lightning Bolt")).toEqual({ quantity: 3, name: "Lightning Bolt" });
    expect(splitQuantity("Sol Ring")).toEqual({ quantity: 1, name: "Sol Ring" });
  });
  it("keeps names that start with a number", () => {
    expect(splitQuantity("1x 1996 World Champion").name).toBe("1996 World Champion");
  });
});

describe("AgentLineParser", () => {
  it("emits cards with optional fields across streamed chunks", () => {
    const p = new AgentLineParser();
    const events = [
      ...p.push("STATUS: Researching\nTIER: Core Eng"),
      ...p.push("ine\nCARD: Sol Ring\nREASON: Fast mana.\nIMPORTANCE: critical\nCARD: 10x For"),
      ...p.push("est\n"),
      ...p.end(),
    ];
    expect(events.map((e) => e.type)).toEqual(["status", "tier", "card", "card"]);
    const cards = events.flatMap((e) => (e.type === "card" ? [e.card] : []));
    expect(cards[0]).toMatchObject({ name: "Sol Ring", reason: "Fast mana.", importance: "critical", tier: "Core Engine", quantity: 1 });
    expect(cards[1]).toMatchObject({ name: "Forest", quantity: 10, importance: "flex" });
  });

  it("tolerates markdown bullets and bold keys", () => {
    const r = parseAgentText("- **CARD:** Arcane Signet\n* IMPORTANCE: high\n");
    expect(r.cards).toEqual([expect.objectContaining({ name: "Arcane Signet", importance: "high" })]);
  });

  it("parses swaps and escalation", () => {
    const r = parseAgentText(
      "CUT: Mind Stone\nCUT_REASON: Slow.\nADD: Fellwar Stone\nADD_REASON: Cheaper.\nNET_SYNERGY: +0.12\nSTATUS: ESCALATE — big change"
    );
    expect(r.swaps).toEqual([{ cut: { name: "Mind Stone", reason: "Slow." }, add: { name: "Fellwar Stone", reason: "Cheaper." }, netSynergy: 0.12 }]);
    expect(r.escalated).toBe(true);
  });
});

describe("corrections", () => {
  it("replaces and removes cards and swap additions", () => {
    const r = parseAgentText(
      [
        "TIER: Ramp",
        "CARD: Mana Crypt",
        "CARD: Sol Ring",
        "CUT: Divination",
        "ADD: Rhystic Study",
        "STATUS: Done.",
        "REPLACE: Mana Crypt",
        "WITH: Mind Stone",
        "WHY: Mana Crypt is banned.",
        "REPLACE: Rhystic Study",
        "WITH: Mystic Remora",
        "REMOVE: Sol Ring",
        "CARD: Arcane Signet",
      ].join("\n")
    );
    expect(r.cards.map((c) => c.name)).toEqual(["Mind Stone", "Arcane Signet"]);
    expect(r.cards[0].reason).toBe("Mana Crypt is banned.");
    expect(r.swaps[0].add.name).toBe("Mystic Remora");
  });
});
