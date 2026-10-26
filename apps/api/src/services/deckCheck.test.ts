import { describe, it, expect } from "vitest";
import { checkDeck, rulesFor } from "./deckCheck.js";
import { parseAgentText } from "./agentOutput.js";
import type { CardFact } from "./cardFacts.js";

function fact(name: string, opts: Partial<CardFact> = {}): CardFact {
  return {
    name,
    variantId: `v-${name}`,
    imageUri: null,
    typeLine: "Artifact",
    manaCost: "{1}",
    oracleText: null,
    cmc: 1,
    colorIdentity: [],
    priceUsd: 1,
    legalities: { commander: "legal", modern: "legal" },
    ...opts,
  };
}

function factsOf(...facts: CardFact[]) {
  return new Map(facts.map((f) => [f.name.toLowerCase(), f]));
}

const golgari = fact("Meren of Clan Nel Toth", { typeLine: "Legendary Creature", colorIdentity: ["B", "G"] });

function build(lines: string[]) {
  return parseAgentText(lines.join("\n"));
}

describe("rulesFor", () => {
  it("counts the 99 around one or two commanders", () => {
    expect(rulesFor("commander").mainSize).toBe(99);
    expect(rulesFor("commander", 2).mainSize).toBe(98);
    expect(rulesFor("modern")).toMatchObject({ mainSize: 60, singleton: false, identity: false });
  });
});

describe("checkDeck (build)", () => {
  const forest = fact("Forest", { typeLine: "Basic Land — Forest", colorIdentity: ["G"], priceUsd: 0.1 });
  const sol = fact("Sol Ring", { priceUsd: 2 });

  it("passes a complete, legal, on-budget list", () => {
    const result = build(["CARD: Sol Ring", "CARD: 98x Forest"]);
    const check = checkDeck({ mode: "build", format: "commander", result, facts: factsOf(sol, forest), commanders: [golgari], budget: 50, deckCards: [] });
    expect(check).toMatchObject({ ok: true, cardCount: 99 });
    expect(check.totalPrice).toBeCloseTo(11.8);
  });

  it("flags unknown names, off-color, banned, duplicates, the commander, count and budget", () => {
    const bolt = fact("Lightning Bolt", { colorIdentity: ["R"], priceUsd: 1 });
    const crypt = fact("Mana Crypt", { priceUsd: 180, legalities: { commander: "banned" } });
    const result = build([
      "CARD: Sol Ring",
      "CARD: Sol Ring",
      "CARD: Lightning Bolt",
      "CARD: Mana Crypt",
      "CARD: Meren of Clan Nel Toth",
      "CARD: Totally Fake Card",
      "CARD: 90x Forest",
    ]);
    const check = checkDeck({
      mode: "build",
      format: "commander",
      result,
      facts: factsOf(sol, bolt, crypt, forest, golgari),
      commanders: [golgari],
      budget: 100,
      deckCards: [],
    });
    const text = check.issues.join("\n");
    expect(check.ok).toBe(false);
    expect(text).toMatch(/Lightning Bolt has color identity R/);
    expect(text).toMatch(/Mana Crypt is banned in Commander/);
    expect(text).toMatch(/Sol Ring appears 2 times/);
    expect(text).toMatch(/Meren of Clan Nel Toth is the commander/);
    expect(text).toMatch(/"Totally Fake Card" doesn't match any real card/);
    expect(text).toMatch(/The list has 96 cards; a Commander deck needs exactly 99.*Add 3/);
    expect(text).toMatch(/over the \$100.00 budget\. Most expensive: Mana Crypt \$180.00/);
    // Basics are exempt from singleton.
    expect(text).not.toMatch(/Forest appears/);
  });

  it("allows four copies in constructed and respects 'any number' cards", () => {
    const bolt = fact("Lightning Bolt", { colorIdentity: ["R"] });
    const rats = fact("Relentless Rats", { oracleText: "A deck can have any number of cards named Relentless Rats." });
    const mountain = fact("Mountain", { typeLine: "Basic Land — Mountain" });
    const result = build(["CARD: 5x Lightning Bolt", "CARD: 20x Relentless Rats", "CARD: 35x Mountain"]);
    const check = checkDeck({ mode: "build", format: "modern", result, facts: factsOf(bolt, rats, mountain), commanders: [], budget: 0, deckCards: [] });
    expect(check.issues).toEqual(["Lightning Bolt appears 5 times; Modern allows 4."]);
  });
});

describe("checkDeck (upgrade)", () => {
  it("checks cuts are in the deck and adds aren't", () => {
    const remora = fact("Mystic Remora", { colorIdentity: ["U"] });
    const sol = fact("Sol Ring");
    const result = parseAgentText(
      ["CUT: Divination", "ADD: Sol Ring", "CUT: Not In Deck", "ADD: Mystic Remora"].join("\n")
    );
    const check = checkDeck({
      mode: "upgrade",
      format: "commander",
      result,
      facts: factsOf(sol, remora),
      commanders: [golgari],
      budget: 0,
      deckCards: ["Divination", "Sol Ring"],
    });
    expect(check.issues).toEqual([
      "Mystic Remora has color identity U, outside the commander's BG identity.",
      "Sol Ring is already in the deck.",
      "Not In Deck is suggested as a cut but isn't in the deck.",
    ]);
  });

  it("skips checks when the model escalates", () => {
    const result = parseAgentText("STATUS: ESCALATE — this changes most of the deck");
    expect(checkDeck({ mode: "modify", format: "commander", result, facts: new Map(), commanders: [], budget: 0, deckCards: ["A"] }).ok).toBe(true);
  });
});
