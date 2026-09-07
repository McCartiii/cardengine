export const RETAIL_PRICE_KINDS = ["market", "foil", "etched"] as const;

export type RetailPriceKind = (typeof RETAIL_PRICE_KINDS)[number];
export type CardFinish = "nonfoil" | "foil" | "etched";

const MARKET_ALIASES: Record<string, string> = {
  "tcg player": "tcgplayer",
  tcgplayer: "tcgplayer",
  cardmarket: "cardmarket",
  "card market": "cardmarket",
  cardhoarder: "mtgo",
  mtgo: "mtgo",
  "card kingdom": "cardkingdom",
  cardkingdom: "cardkingdom",
  cardsphere: "cardsphere",
  "mana pool": "manapool",
  manapool: "manapool",
};

export function normalizeMarket(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ");
  return MARKET_ALIASES[normalized] ?? normalized.replace(/\s+/g, "");
}

export function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeRetailPriceKind(value: string): RetailPriceKind {
  switch (value.trim().toLowerCase()) {
    case "normal":
    case "nonfoil":
    case "non-foil":
    case "market":
      return "market";
    case "foil":
      return "foil";
    case "etched":
      return "etched";
    default:
      throw new Error(`Unsupported retail price kind: ${value}`);
  }
}

export function finishForPriceKind(kind: string): CardFinish | null {
  if (kind === "market") return "nonfoil";
  if (kind === "foil" || kind === "etched") return kind;
  return null;
}

export function preferredPriceKind(variantId: string): RetailPriceKind {
  return variantId.endsWith("-foil") ? "foil" : "market";
}

export function priceKindForHolding(
  variantId: string,
  finish?: unknown
): RetailPriceKind {
  if (typeof finish === "string") {
    try {
      return normalizeRetailPriceKind(finish);
    } catch {
      // Preserve legacy events with an unknown payload instead of dropping value.
    }
  }
  return preferredPriceKind(variantId);
}

export function defaultCurrencyForMarket(market: string): string {
  switch (normalizeMarket(market)) {
    case "cardmarket":
      return "EUR";
    case "mtgo":
      return "TIX";
    default:
      return "USD";
  }
}

export function currencySymbol(currency: string): string {
  switch (normalizeCurrency(currency)) {
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    default:
      return "";
  }
}
