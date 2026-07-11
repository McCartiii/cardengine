import { describe, expect, it } from "vitest";
import { asCardId, type DeckCardLine } from "@cardengine/engine";
import { MTG_FORMATS, MtgRulesEngine } from "../src/index.js";

const engine = new MtgRulesEngine();

function card(name: string, quantity: number, board: DeckCardLine["board"] = "main"): DeckCardLine {
  return { cardId: asCardId(name), quantity, board };
}

function validate(cards: DeckCardLine[], formatId: string) {
  const format = MTG_FORMATS[formatId];
  if (!format) throw new Error(`unknown format: ${formatId}`);
  return engine.validateDeck({ deck: { game: "mtg", formatId, cards }, format });
}

/** 4x of `n` distinct spells + islands to fill to `total` cards. */
function standardShell(spells: number, total = 60): DeckCardLine[] {
  const lines: DeckCardLine[] = [];
  for (let i = 0; i < spells; i++) lines.push(card(`Spell ${i}`, 4));
  lines.push(card("Island", total - spells * 4));
  return lines;
}

describe("MtgRulesEngine — 60-card formats", () => {
  it("passes a legal standard deck", () => {
    const result = validate(standardShell(9), "standard");
    expect(result.violations).toEqual([]);
    expect(result.isLegal).toBe(true);
  });

  it("flags a deck below the minimum size", () => {
    const result = validate([card("Island", 59)], "standard");
    expect(result.isLegal).toBe(false);
    expect(result.violations.some((v) => v.code === "deck.main_size_min")).toBe(true);
  });

  it("flags more than 4 copies of a card", () => {
    const result = validate([card("Lightning Bolt", 5), card("Mountain", 55)], "modern");
    expect(result.isLegal).toBe(false);
    expect(result.violations.some((v) => v.code === "deck.copies_per_card")).toBe(true);
  });

  it("exempts basic lands (incl. snow-covered) from the copy limit", () => {
    const result = validate(
      [card("Snow-Covered Island", 30), card("Island", 30)],
      "modern"
    );
    expect(result.violations).toEqual([]);
  });

  it('exempts "any number" cards like Relentless Rats', () => {
    const result = validate([card("Relentless Rats", 36), card("Swamp", 24)], "modern");
    expect(result.violations).toEqual([]);
  });

  it("flags an oversized sideboard", () => {
    const cards = [...standardShell(9), card("Duress", 16, "side")];
    const result = validate(cards, "standard");
    expect(result.isLegal).toBe(false);
    expect(result.violations.some((v) => v.code === "deck.side_size_max")).toBe(true);
  });

  it("flags a banned card and reports which one", () => {
    const cards = [card("Oko, Thief of Crowns", 4), ...standardShell(9, 44)];
    const result = validate(cards, "standard");
    expect(result.isLegal).toBe(false);
    const banned = result.violations.find((v) => v.code === "deck.banned_card");
    expect(banned?.cardId).toBe(asCardId("Oko, Thief of Crowns"));
  });

  it("allows exactly 1 copy of a vintage restricted card, flags 2+", () => {
    const one = validate([card("Brainstorm", 1), card("Island", 59)], "vintage");
    expect(one.violations.filter((v) => v.code === "deck.restricted_card")).toEqual([]);

    const two = validate([card("Brainstorm", 2), card("Island", 58)], "vintage");
    expect(two.isLegal).toBe(false);
    expect(two.violations.some((v) => v.code === "deck.restricted_card")).toBe(true);
  });
});

describe("MtgRulesEngine — commander", () => {
  /** 99 distinct singleton cards + commander mapped onto the main board. */
  function commanderDeck(): DeckCardLine[] {
    const lines: DeckCardLine[] = [card("Krenko, Mob Boss", 1)];
    for (let i = 0; i < 60; i++) lines.push(card(`Goblin ${i}`, 1));
    lines.push(card("Mountain", 39));
    return lines;
  }

  it("passes a legal 100-card singleton deck", () => {
    const result = validate(commanderDeck(), "commander");
    expect(result.violations).toEqual([]);
    expect(result.isLegal).toBe(true);
  });

  it("flags a deck that is not exactly 100 cards", () => {
    const deck = commanderDeck().slice(0, -1); // drop the Mountains → 61 cards
    const result = validate(deck, "commander");
    expect(result.isLegal).toBe(false);
    expect(result.violations.some((v) => v.code === "deck.main_size_exact")).toBe(true);
  });

  it("flags duplicate non-basic cards (singleton)", () => {
    const deck = commanderDeck().map((l) =>
      l.cardId === asCardId("Goblin 0") ? { ...l, quantity: 2 } : l
    );
    // still 100 cards? no — 101; drop one Mountain to keep size legal
    const sized = deck.map((l) =>
      l.cardId === asCardId("Mountain") ? { ...l, quantity: 38 } : l
    );
    const result = validate(sized, "commander");
    expect(result.isLegal).toBe(false);
    expect(result.violations.some((v) => v.code === "deck.copies_per_card")).toBe(true);
  });

  it("allows any number of basic lands", () => {
    const result = validate(commanderDeck(), "commander");
    expect(result.violations.filter((v) => v.code === "deck.copies_per_card")).toEqual([]);
  });

  it("flags cards on the commander ban list", () => {
    const deck = commanderDeck().map((l) =>
      l.cardId === asCardId("Goblin 0") ? card("Golos, Tireless Pilgrim", 1) : l
    );
    const result = validate(deck, "commander");
    expect(result.isLegal).toBe(false);
    const banned = result.violations.find((v) => v.code === "deck.banned_card");
    expect(banned?.cardId).toBe(asCardId("Golos, Tireless Pilgrim"));
  });
});

describe("MTG_FORMATS — coverage for every API-supported format", () => {
  // Keep in sync with SUPPORTED_FORMATS in apps/api/src/routes/decks.ts.
  const API_FORMATS = [
    "commander", "standard", "modern", "pioneer", "legacy",
    "vintage", "pauper", "oathbreaker", "brawl", "historic", "explorer",
  ];

  it.each(API_FORMATS)("has a bundle for %s", (id) => {
    expect(MTG_FORMATS[id], `missing FormatBundle for "${id}"`).toBeDefined();
    expect(MTG_FORMATS[id]!.id).toBe(id);
  });

  it("singleton formats enforce 1 copy per card", () => {
    for (const id of ["commander", "oathbreaker", "brawl"]) {
      expect(MTG_FORMATS[id]!.rules.maxCopiesPerCard, id).toBe(1);
    }
  });
});
