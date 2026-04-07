import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db.js", () => ({
  prisma: {
    cardVariant: { findMany: vi.fn() },
    priceCache: { findMany: vi.fn() },
    metaSnapshot: { findUnique: vi.fn() },
    collectionEvent: { findMany: vi.fn() },
  },
}));

import { buildGetCardDetails, buildGetCollection } from "./deckAgentTools.js";
import { prisma } from "../db.js";

beforeEach(() => vi.clearAllMocks());

describe("buildGetCardDetails", () => {
  it("returns card details from local DB with price", async () => {
    vi.mocked(prisma.cardVariant.findMany).mockResolvedValue([
      { variantId: "abc", name: "Sol Ring", imageUri: "https://img.example.com/sol.jpg", typeLine: "Artifact", manaCost: "{1}" } as any,
    ]);
    vi.mocked(prisma.priceCache.findMany).mockResolvedValue([
      { variantId: "abc", amount: 2.5 } as any,
    ]);

    const getCardDetails = buildGetCardDetails();
    const result = await getCardDetails(["Sol Ring"]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Sol Ring");
    expect(result[0].priceUsd).toBe(2.5);
    expect(result[0].imageUri).toBe("https://img.example.com/sol.jpg");
  });

  it("returns Scryfall fallback image when card not in DB", async () => {
    vi.mocked(prisma.cardVariant.findMany).mockResolvedValue([]);
    vi.mocked(prisma.priceCache.findMany).mockResolvedValue([]);

    const getCardDetails = buildGetCardDetails();
    const result = await getCardDetails(["Nonexistent Card"]);

    expect(result[0].variantId).toBeNull();
    expect(result[0].imageUri).toContain("api.scryfall.com");
  });

  it("returns empty array for empty input", async () => {
    const getCardDetails = buildGetCardDetails();
    const result = await getCardDetails([]);
    expect(result).toEqual([]);
  });
});

describe("buildGetCollection", () => {
  it("returns owned card names after applying add/remove events", async () => {
    vi.mocked(prisma.collectionEvent.findMany).mockResolvedValue([
      { type: "add", variantId: "abc", payload: { quantity: 2 } } as any,
      { type: "remove", variantId: "abc", payload: { quantity: 1 } } as any,
    ]);
    vi.mocked(prisma.cardVariant.findMany).mockResolvedValue([
      { name: "Sol Ring", variantId: "abc" } as any,
    ]);

    const getCollection = buildGetCollection();
    const result = await getCollection("user-123");

    expect(result).toContainEqual({ name: "sol ring", variantId: "abc" });
  });

  it("excludes cards with net quantity <= 0", async () => {
    vi.mocked(prisma.collectionEvent.findMany).mockResolvedValue([
      { type: "add", variantId: "abc", payload: { quantity: 1 } } as any,
      { type: "remove", variantId: "abc", payload: { quantity: 1 } } as any,
    ]);
    vi.mocked(prisma.cardVariant.findMany).mockResolvedValue([]);

    const getCollection = buildGetCollection();
    const result = await getCollection("user-123");

    expect(result).toHaveLength(0);
    // cardVariant.findMany should not be called since variantIds is empty
    expect(prisma.cardVariant.findMany).not.toHaveBeenCalled();
  });
});
