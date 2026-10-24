import { describe, it, expect } from "vitest";
import { detectUrlType, parseArchidekt, parseDecklistText, parseMoxfield } from "./urlImport.js";

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

describe("parseMoxfield", () => {
  it("reads v3 boards with exact printings and foils", () => {
    const deck = parseMoxfield({
      name: "Atraxa Superfriends",
      format: "commander",
      boards: {
        commanders: { count: 1, cards: { a: { quantity: 1, finish: "nonFoil", card: { name: "Atraxa, Praetors' Voice", set: "2xm", cn: "190", scryfall_id: "s-atraxa" } } } },
        mainboard: {
          count: 2,
          cards: {
            b: { quantity: 1, finish: "foil", card: { name: "Sol Ring", set: "cmm", cn: "410", scryfall_id: "s-sol" } },
            c: { quantity: 0, card: { name: "Ghost" } },
          },
        },
        sideboard: { count: 0, cards: {} },
        maybeboard: { count: 1, cards: { d: { quantity: 1, card: { name: "Maybe Card" } } } },
      },
    });
    expect(deck).toMatchObject({ source: "moxfield", name: "Atraxa Superfriends", format: "commander", commanders: ["Atraxa, Praetors' Voice"] });
    expect(deck.entries).toEqual([
      { name: "Atraxa, Praetors' Voice", quantity: 1, section: "commander", scryfallId: "s-atraxa", setCode: "2xm", collectorNumber: "190", foil: false },
      { name: "Sol Ring", quantity: 1, section: "mainboard", scryfallId: "s-sol", setCode: "cmm", collectorNumber: "410", foil: true },
    ]);
  });

  it("still reads the older v2 shape", () => {
    const deck = parseMoxfield({
      name: "Burn",
      format: "modern",
      mainboard: { "Lightning Bolt": { quantity: 4, card: { name: "Lightning Bolt" } } },
      sideboard: { Smash: { quantity: 2, card: { name: "Smash to Smithereens" } } },
    });
    expect(deck.format).toBe("modern");
    expect(deck.entries.map((e) => [e.name, e.quantity, e.section])).toEqual([
      ["Lightning Bolt", 4, "mainboard"],
      ["Smash to Smithereens", 2, "sideboard"],
    ]);
  });
});

describe("parseArchidekt", () => {
  it("reads sections from categories and skips the maybeboard", () => {
    const deck = parseArchidekt({
      name: "Kinnan Combo",
      deckFormat: 3,
      categories: [
        { name: "Commander", includedInDeck: true },
        { name: "Ramp", includedInDeck: true },
        { name: "Maybeboard", includedInDeck: false },
      ],
      cards: [
        { quantity: 1, modifier: "Normal", categories: ["Commander"], card: { uid: "u-kinnan", collectorNumber: "194", edition: { editioncode: "iko" }, oracleCard: { name: "Kinnan, Bonder Prodigy" } } },
        { quantity: 1, modifier: "Foil", categories: ["Ramp"], card: { uid: "u-sol", collectorNumber: "1", edition: { editioncode: "c21" }, oracleCard: { name: "Sol Ring" } } },
        { quantity: 1, modifier: "Normal", categories: ["Maybeboard"], card: { oracleCard: { name: "Not In Deck" } } },
      ],
    });
    expect(deck).toMatchObject({ source: "archidekt", name: "Kinnan Combo", format: "commander", commanders: ["Kinnan, Bonder Prodigy"] });
    expect(deck.entries).toEqual([
      { name: "Kinnan, Bonder Prodigy", quantity: 1, section: "commander", scryfallId: "u-kinnan", setCode: "iko", collectorNumber: "194", foil: false },
      { name: "Sol Ring", quantity: 1, section: "mainboard", scryfallId: "u-sol", setCode: "c21", collectorNumber: "1", foil: true },
    ]);
  });
});
