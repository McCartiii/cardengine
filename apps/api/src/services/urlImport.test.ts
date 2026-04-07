import { describe, it, expect } from "vitest";
import { detectUrlType, parseDecklistText } from "./urlImport.js";

describe("detectUrlType", () => {
  it("detects moxfield URLs", () => {
    expect(detectUrlType("https://www.moxfield.com/decks/abc123")).toBe("moxfield");
  });
  it("detects archidekt URLs", () => {
    expect(detectUrlType("https://archidekt.com/decks/123456/my-deck")).toBe("archidekt");
  });
  it("detects mtggoldfish URLs", () => {
    expect(detectUrlType("https://www.mtggoldfish.com/deck/6789012#paper")).toBe("mtggoldfish");
  });
  it("returns null for unknown URLs", () => {
    expect(detectUrlType("https://example.com/deck")).toBeNull();
  });
});

describe("parseDecklistText", () => {
  it("parses standard MTG decklist format", () => {
    const text = `1 Sol Ring\n4 Lightning Bolt\n\n// Sideboard\n2 Negate`;
    const result = parseDecklistText(text);
    expect(result).toContainEqual({ name: "Sol Ring", quantity: 1, section: "mainboard" });
    expect(result).toContainEqual({ name: "Lightning Bolt", quantity: 4, section: "mainboard" });
    expect(result).toContainEqual({ name: "Negate", quantity: 2, section: "sideboard" });
  });
  it("handles COMMANDER: section marker", () => {
    const text = `COMMANDER:\n1 Atraxa, Praetors' Voice\nDECK:\n1 Sol Ring`;
    const result = parseDecklistText(text);
    expect(result).toContainEqual({ name: "Atraxa, Praetors' Voice", quantity: 1, section: "commander" });
    expect(result).toContainEqual({ name: "Sol Ring", quantity: 1, section: "mainboard" });
  });
});
