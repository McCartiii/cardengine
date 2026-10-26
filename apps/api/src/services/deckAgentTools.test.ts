import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db.js", () => ({
  prisma: {
    cardVariant: { findMany: vi.fn() },
    priceCache: { findMany: vi.fn() },
    pricePoint: { findMany: vi.fn() },
    metaSnapshot: { findUnique: vi.fn() },
    collectionEvent: { findMany: vi.fn() },
  },
}));

import { buildGetCardDetails, buildGetCollection, buildToolExecutor, ToolInputError } from "./deckAgentTools.js";
import { prisma } from "../db.js";

beforeEach(() => {
  vi.clearAllMocks();
  // Legality lookups go to Scryfall; keep tests offline.
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [{ name: "Sol Ring", legalities: { commander: "legal" } }] }))));
});

describe("buildGetCardDetails", () => {
  it("returns the cheapest printing with rules text, identity and legality", async () => {
    vi.mocked(prisma.cardVariant.findMany).mockResolvedValue([
      { variantId: "a", name: "Sol Ring", imageUri: "https://img/a.jpg", typeLine: "Artifact", manaCost: "{1}", oracleText: "{T}: Add {C}{C}.", cmc: 1, colorIdentity: [] },
      { variantId: "b", name: "Sol Ring", imageUri: "https://img/b.jpg", typeLine: "Artifact", manaCost: "{1}", oracleText: "{T}: Add {C}{C}.", cmc: 1, colorIdentity: [] },
    ] as never);
    vi.mocked(prisma.priceCache.findMany).mockResolvedValue([
      { variantId: "a", amount: 3 },
      { variantId: "b", amount: 1.5 },
    ] as never);

    const [sol] = await buildGetCardDetails("commander")(["sol ring"]);
    expect(sol).toMatchObject({ name: "Sol Ring", found: true, variantId: "b", priceUsd: 1.5, oracleText: "{T}: Add {C}{C}.", legality: "legal" });
  });

  it("marks unknown names as not found", async () => {
    vi.mocked(prisma.cardVariant.findMany).mockResolvedValue([]);
    vi.mocked(prisma.priceCache.findMany).mockResolvedValue([]);
    const [card] = await buildGetCardDetails()(["Nonexistent Card"]);
    expect(card).toMatchObject({ name: "Nonexistent Card", found: false, variantId: null, legality: "unknown" });
  });

  it("returns empty array for empty input", async () => {
    expect(await buildGetCardDetails()([])).toEqual([]);
  });
});

describe("buildGetCollection", () => {
  it("sums owned copies by name after adds and removes", async () => {
    vi.mocked(prisma.collectionEvent.findMany).mockResolvedValue([
      { type: "add", variantId: "abc", payload: { quantity: 2 }, at: new Date() },
      { type: "remove", variantId: "abc", payload: { quantity: 1 }, at: new Date() },
      { type: "add", variantId: "def", payload: { quantity: 1, finish: "foil" }, at: new Date() },
    ] as never);
    vi.mocked(prisma.cardVariant.findMany).mockResolvedValue([
      { name: "Sol Ring", variantId: "abc" },
      { name: "Sol Ring", variantId: "def" },
    ] as never);
    vi.mocked(prisma.priceCache.findMany).mockResolvedValue([]);
    vi.mocked(prisma.pricePoint.findMany).mockResolvedValue([]);

    expect(await buildGetCollection()("user-123")).toEqual([{ name: "Sol Ring", quantity: 2 }]);
  });
});

describe("buildToolExecutor", () => {
  it("rejects invalid input instead of running the tool", async () => {
    const run = buildToolExecutor({ userId: "u1" });
    await expect(run("get_card_details", { cardNames: "Sol Ring" })).rejects.toBeInstanceOf(ToolInputError);
    await expect(run("drop_tables", {})).rejects.toThrow(/Unknown tool/);
  });

  it("only reads the signed-in player's collection, whatever the model asks for", async () => {
    vi.mocked(prisma.collectionEvent.findMany).mockResolvedValue([]);
    await buildToolExecutor({ userId: "me" })("get_collection", { userId: "someone-else" });
    expect(prisma.collectionEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "me" } }));
  });

  it("has no collection without a signed-in player", async () => {
    expect(await buildToolExecutor({})("get_collection", {})).toEqual({ error: "No signed-in player" });
  });
});
