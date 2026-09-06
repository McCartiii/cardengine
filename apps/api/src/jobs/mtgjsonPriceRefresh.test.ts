import { describe, expect, it } from "vitest";
import { mtgjsonPriceTesting } from "./mtgjsonPriceRefresh.js";

const { latestPoint, rowsForVariant, scryfallIdFromVariant } =
  mtgjsonPriceTesting;

describe("MTGJSON price normalization", () => {
  it("maps base and foil-only variant IDs to their Scryfall ID", () => {
    const id = "f9a32f17-49c4-4654-a087-1ba474f37377";
    expect(scryfallIdFromVariant(`scryfall:${id}`)).toBe(id);
    expect(scryfallIdFromVariant(`scryfall:${id}-foil`)).toBe(id);
    expect(scryfallIdFromVariant("manual:sol-ring")).toBeNull();
  });

  it("selects the newest dated price point", () => {
    expect(
      latestPoint(
        { "2026-09-04": 1.25, "2026-09-05": 1.5 },
        "2026-09-05"
      )
    ).toEqual({ date: "2026-09-05", amount: 1.5 });
  });

  it("keeps provider, currency, finish, and list type distinct", () => {
    const rows = rowsForVariant(
      "scryfall:test",
      {
        paper: {
          tcgplayer: {
            currency: "USD",
            retail: {
              normal: { "2026-09-05": 2.5 },
              foil: { "2026-09-05": 5 },
            },
            buylist: {
              normal: { "2026-09-05": 1.2 },
            },
          },
          cardmarket: {
            currency: "EUR",
            retail: {
              normal: { "2026-09-05": 2.1 },
            },
          },
        },
      },
      "2026-09-05"
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          market: "tcgplayer",
          kind: "market",
          currency: "USD",
          amount: 2.5,
        }),
        expect.objectContaining({
          market: "tcgplayer",
          kind: "foil",
          amount: 5,
        }),
        expect.objectContaining({
          market: "tcgplayer",
          kind: "buylist-market",
          amount: 1.2,
        }),
        expect.objectContaining({
          market: "cardmarket",
          kind: "market",
          currency: "EUR",
          amount: 2.1,
        }),
      ])
    );
  });
});
