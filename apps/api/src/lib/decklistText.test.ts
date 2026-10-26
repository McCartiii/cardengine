import { describe, expect, it } from "vitest";
import { parseDecklistText } from "./decklistText.js";

const names = (t: string) => parseDecklistText(t).map((l) => `${l.quantity} ${l.cardName} [${l.section}]${l.counted ? "" : "?"}`);

describe("parseDecklistText", () => {
  it("reads counts, set codes and foil marks", () => {
    expect(names("4 Lightning Bolt\n4x Ragavan, Nimble Pilferer\n1 Sol Ring (C21) 263\n1 Rhystic Study [PCY] *F*\nCounterspell")).toEqual([
      "4 Lightning Bolt [mainboard]",
      "4 Ragavan, Nimble Pilferer [mainboard]",
      "1 Sol Ring [mainboard]",
      "1 Rhystic Study [mainboard]",
      "1 Counterspell [mainboard]?",
    ]);
  });

  it("follows headings, and doesn't mistake cards for them", () => {
    expect(
      names("Commander (1)\n1 Atraxa, Praetors' Voice\nDeck\n1 Commander's Sphere\nCommander's Sphere\nDeckhand\nSIDEBOARD:\n3 Fire // Ice\n// Maybeboard\n1 Maybe Card\nMainboard\n2 Island")
    ).toEqual([
      "1 Atraxa, Praetors' Voice [commander]",
      "1 Commander's Sphere [mainboard]",
      "1 Commander's Sphere [mainboard]?",
      "1 Deckhand [mainboard]?",
      "3 Fire // Ice [sideboard]",
      "2 Island [mainboard]",
    ]);
  });

  it("skips comments, blanks and zero counts", () => {
    expect(names("// my deck\n# notes\n\n0 Opt\n  \n2 Opt\r\n")).toEqual(["2 Opt [mainboard]"]);
  });
});
