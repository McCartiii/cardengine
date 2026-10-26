import { describe, expect, it } from "vitest";
import { hasCriteria, inPriceRange, searchFilterSchema, searchWhere } from "./searchFilters.js";

const parse = (q: Record<string, string>) => searchFilterSchema.parse(q);

describe("search filters", () => {
  it("parses and normalizes", () => {
    const f = parse({ q: "  bolt ", colors: "ru", rarity: "Rare, mythic", minPrice: "1" });
    expect(f).toMatchObject({ q: "bolt", colors: "RU", rarity: ["rare", "mythic"], minPrice: 1 });
    expect(() => parse({ colors: "X" })).toThrow();
    expect(() => parse({ rarity: "legendary" })).toThrow();
  });

  it("needs something to search for", () => {
    expect(hasCriteria(parse({}))).toBe(false);
    expect(hasCriteria(parse({ q: "  " }))).toBe(false);
    expect(hasCriteria(parse({ type: "creature" }))).toBe(true);
    expect(hasCriteria(parse({ maxPrice: "5" }))).toBe(true);
  });

  it("builds the where clause", () => {
    expect(searchWhere(parse({ q: "elf", type: "creature", colors: "GW", rarity: "rare", set: "MH3" }), "mtg")).toEqual({
      game: "mtg",
      AND: [
        { name: { contains: "elf", mode: "insensitive" } },
        { typeLine: { contains: "creature", mode: "insensitive" } },
        { rarity: { in: ["rare"] } },
        { setId: { equals: "MH3", mode: "insensitive" } },
        { colors: { array_contains: ["G"] } },
        { colors: { array_contains: ["W"] } },
      ],
    });
    expect(searchWhere(parse({ colors: "C" }), "mtg").AND).toEqual([{ colors: { equals: [] } }]);
    // colorless plus a color means just the color
    expect(searchWhere(parse({ colors: "CU" }), "mtg").AND).toEqual([{ colors: { array_contains: ["U"] } }]);
  });

  it("applies price bounds", () => {
    const f = parse({ minPrice: "1", maxPrice: "10" });
    expect(inPriceRange(5, f)).toBe(true);
    expect(inPriceRange(0.5, f)).toBe(false);
    expect(inPriceRange(11, f)).toBe(false);
    expect(inPriceRange(null, f)).toBe(false);
    expect(inPriceRange(null, parse({ q: "x" }))).toBe(true);
  });
});
