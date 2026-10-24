import { describe, expect, it } from "vitest";
import { changeFromPoints, sortCollection, typeRank, type SortableCard } from "./collectionSort";

const card = (name: string, over: Partial<SortableCard> = {}): SortableCard => ({
  name,
  typeLine: null,
  rarity: null,
  quantity: 1,
  priceUsd: null,
  lineValue: null,
  changePct: null,
  addedAt: null,
  ...over,
});

const names = (cards: SortableCard[]) => cards.map((c) => c.name);

describe("sortCollection", () => {
  it("sorts by unit price, highest first by default, missing prices last", () => {
    const cards = [card("A", { priceUsd: 5 }), card("B"), card("C", { priceUsd: 50 })];
    expect(names(sortCollection(cards, "price"))).toEqual(["C", "A", "B"]);
    expect(names(sortCollection(cards, "price", "asc"))).toEqual(["A", "C", "B"]);
  });

  it("sorts by price change, biggest gainers first, cards without history last", () => {
    const cards = [card("Down", { changePct: -12 }), card("None"), card("Up", { changePct: 8 })];
    expect(names(sortCollection(cards, "change"))).toEqual(["Up", "Down", "None"]);
    expect(names(sortCollection(cards, "change", "asc"))).toEqual(["Down", "Up", "None"]);
  });

  it("groups by type in deck-list order, then by name", () => {
    const cards = [
      card("Land", { typeLine: "Basic Land — Island" }),
      card("Zombie", { typeLine: "Creature — Zombie" }),
      card("Ring", { typeLine: "Legendary Artifact" }),
      card("Golem", { typeLine: "Artifact Creature — Golem" }),
    ];
    expect(names(sortCollection(cards, "type"))).toEqual(["Golem", "Zombie", "Ring", "Land"]);
  });

  it("sorts newest additions first", () => {
    const cards = [card("Old", { addedAt: "2025-01-01T00:00:00Z" }), card("New", { addedAt: "2026-01-01T00:00:00Z" })];
    expect(names(sortCollection(cards, "added"))).toEqual(["New", "Old"]);
  });

  it("sorts rarity from mythic down", () => {
    const cards = [card("C", { rarity: "common" }), card("M", { rarity: "mythic" }), card("R", { rarity: "rare" })];
    expect(names(sortCollection(cards, "rarity"))).toEqual(["M", "R", "C"]);
  });
});

describe("typeRank", () => {
  it("reads only the front of the type line", () => {
    expect(typeRank("Creature — Human Wizard")).toBeLessThan(typeRank("Instant"));
    expect(typeRank("Enchantment — Saga")).toBeGreaterThan(typeRank("Artifact"));
  });
});

describe("changeFromPoints", () => {
  const day = (d: number) => new Date(Date.UTC(2026, 0, d));

  it("measures oldest to newest", () => {
    expect(changeFromPoints([{ at: day(5), amount: 12 }, { at: day(1), amount: 10 }])).toBeCloseTo(20);
  });

  it("needs two prices at least half a day apart", () => {
    expect(changeFromPoints([{ at: day(1), amount: 10 }])).toBeNull();
    expect(changeFromPoints([{ at: day(1), amount: 10 }, { at: day(1), amount: 11 }])).toBeNull();
  });
});
