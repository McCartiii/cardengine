import { describe, expect, it } from "vitest";
import { manaSymbolCode } from "./ManaSymbols";

describe("manaSymbolCode", () => {
  it("maps mono-color and generic mana to Scryfall symbol filenames", () => {
    expect(manaSymbolCode("{W}")).toBe("W");
    expect(manaSymbolCode("{4}")).toBe("4");
  });

  it("maps hybrid and Phyrexian mana to Scryfall symbol filenames", () => {
    expect(manaSymbolCode("{W/U}")).toBe("WU");
    expect(manaSymbolCode("{W/P}")).toBe("WP");
    expect(manaSymbolCode("{2/B}")).toBe("2B");
  });

  it("maps special symbols to their canonical Scryfall filenames", () => {
    expect(manaSymbolCode("{∞}")).toBe("INFINITY");
    expect(manaSymbolCode("{½}")).toBe("HALF");
  });
});
