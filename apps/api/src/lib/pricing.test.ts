import { describe, expect, it } from "vitest";
import {
  defaultCurrencyForMarket,
  finishForPriceKind,
  normalizeCurrency,
  normalizeMarket,
  normalizeRetailPriceKind,
  priceKindForHolding,
  preferredPriceKind,
} from "./pricing.js";

describe("pricing normalization", () => {
  it("normalizes market display names to stable slugs", () => {
    expect(normalizeMarket("TCGplayer")).toBe("tcgplayer");
    expect(normalizeMarket("Card Market")).toBe("cardmarket");
    expect(normalizeMarket("Card Kingdom")).toBe("cardkingdom");
  });

  it("keeps the legacy market kind as canonical nonfoil pricing", () => {
    expect(normalizeRetailPriceKind("normal")).toBe("market");
    expect(normalizeRetailPriceKind("non-foil")).toBe("market");
    expect(normalizeRetailPriceKind("foil")).toBe("foil");
    expect(finishForPriceKind("market")).toBe("nonfoil");
  });

  it("infers the legacy foil-only variant finish safely", () => {
    expect(preferredPriceKind("scryfall:abc")).toBe("market");
    expect(preferredPriceKind("scryfall:abc-foil")).toBe("foil");
    expect(priceKindForHolding("scryfall:abc", "foil")).toBe("foil");
    expect(priceKindForHolding("scryfall:abc", "nonfoil")).toBe("market");
    expect(priceKindForHolding("scryfall:abc", "etched")).toBe("etched");
    expect(priceKindForHolding("scryfall:abc-foil", "unknown")).toBe("foil");
  });

  it("normalizes currency and chooses market-native defaults", () => {
    expect(normalizeCurrency("usd")).toBe("USD");
    expect(defaultCurrencyForMarket("Cardmarket")).toBe("EUR");
    expect(defaultCurrencyForMarket("TCGplayer")).toBe("USD");
  });
});
