import type { VariantId } from "../identity/types.js";
import type { VariantHoldings } from "../collection/ledger.js";

export type CurrencyCode = "USD" | "EUR" | (string & {});
export type MarketId = "tcgplayer" | "cardmarket" | (string & {});

export interface Money {
  amount: number;
  currency: CurrencyCode;
}

export interface PricePoint {
  at: string;
  market: MarketId;
  variantId: VariantId;
  kind: "market" | "low" | "mid" | "high";
  value: Money;
}

export interface PriceSnapshot {
  market: MarketId;
  at: string;
  points: PricePoint[];
}

export interface PricingProvider {
  readonly market: MarketId;
  getLatestPrices(input: {
    variantIds: VariantId[];
    currency?: CurrencyCode;
  }): Promise<PriceSnapshot>;
}

export interface PriceCacheRecord {
  variantId: VariantId;
  market: MarketId;
  kind: PricePoint["kind"];
  value: Money;
  updatedAt: string;
}

export interface CollectionValueResult {
  total: Money;
  missingPrices: VariantId[];
}

export function computeCollectionValue(input: {
  holdings: Iterable<VariantHoldings>;
  prices: PriceCacheRecord[];
  market: string;
  kind: "market" | "low" | "mid" | "high";
  currency: string;
}): CollectionValueResult {
  const priceMap = new Map<VariantId, number>();
  for (const p of input.prices) {
    if (p.market !== input.market) continue;
    if (p.kind !== input.kind) continue;
    if (p.value.currency !== input.currency) continue;
    priceMap.set(p.variantId, p.value.amount);
  }

  let totalAmount = 0;
  const missing: VariantId[] = [];

  for (const h of input.holdings) {
    const unit = priceMap.get(h.variantId);
    if (unit == null) {
      if (h.totalQuantity > 0) missing.push(h.variantId);
      continue;
    }
    totalAmount += unit * h.totalQuantity;
  }

  return {
    total: { amount: totalAmount, currency: input.currency },
    missingPrices: missing,
  };
}
