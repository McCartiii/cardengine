import { describe, it, expect } from "vitest";
import { collectionOverview, searchCollection } from "./collectionInsights.js";

const h = (name: string, opts: Record<string, unknown> = {}) => ({
  name,
  setId: "abc",
  finish: "nonfoil",
  rarity: "rare",
  typeLine: "Creature — Elf",
  manaCost: "{G}",
  colorIdentity: ["G"],
  quantity: 1,
  priceUsd: 1,
  changePct: null as number | null,
  ...opts,
});

const holdings = [
  h("Llanowar Elves", { quantity: 4, priceUsd: 0.25, changePct: 50 }),
  h("Meren of Clan Nel Toth", { typeLine: "Legendary Creature — Human Shaman", colorIdentity: ["B", "G"], priceUsd: 2, changePct: -10 }),
  h("The One Ring", { typeLine: "Legendary Artifact", colorIdentity: [], priceUsd: 60, changePct: 12.5 }),
  h("Counterspell", { typeLine: "Instant", colorIdentity: ["U"], priceUsd: 1.2 }),
];

describe("collectionOverview", () => {
  it("totals value and lists top cards, movers and commanders", () => {
    const o = collectionOverview(holdings as never);
    expect(o.totalCards).toBe(7);
    expect(o.uniqueCards).toBe(4);
    expect(o.totalValueUsd).toBe(64.2);
    expect(o.mostValuable[0]).toMatchObject({ name: "The One Ring", value: 60 });
    // Cheap cards are left out of movers; percent and dollar change are given.
    expect(o.biggestGainers7d.map((c) => c.name)).toEqual(["The One Ring"]);
    expect(o.biggestGainers7d[0].change7dUsd).toBeCloseTo(6.67, 2);
    expect(o.biggestLosers7d.map((c) => c.name)).toEqual(["Meren of Clan Nel Toth"]);
    expect(o.possibleCommanders).toEqual([{ name: "Meren of Clan Nel Toth", colorIdentity: "BG", priceUsd: 2 }]);
    expect(o.cardsByColorIdentity).toMatchObject({ G: 5, B: 1, U: 1, colorless: 1 });
  });
});

describe("searchCollection", () => {
  it("filters by type, colors and price, and sorts", () => {
    expect(searchCollection(holdings as never, { type: "creature", withinColors: "G" }).cards.map((c) => c.name)).toEqual(["Llanowar Elves"]);
    expect(searchCollection(holdings as never, { withinColors: "BG", sort: "name" }).cards.map((c) => c.name)).toEqual([
      "Llanowar Elves",
      "Meren of Clan Nel Toth",
      "The One Ring",
    ]);
    expect(searchCollection(holdings as never, { minPrice: 1, sort: "price" }).cards.map((c) => c.name)).toEqual([
      "The One Ring",
      "Meren of Clan Nel Toth",
      "Counterspell",
    ]);
    expect(searchCollection(holdings as never, { sort: "loss", limit: 1 }).cards[0].name).toBe("Meren of Clan Nel Toth");
  });
});
