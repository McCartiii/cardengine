import { prisma } from "../db.js";
import { finishForPriceKind, priceKindForHolding } from "../lib/pricing.js";
import { changeFromPoints } from "../lib/collectionSort.js";

// How far back the collection price change looks.
export const CHANGE_WINDOW_DAYS = 7;

export function holdingFromEvent(
  variantId: string,
  payload: { finish?: unknown; kind?: unknown }
) {
  const priceKind = priceKindForHolding(
    variantId,
    payload.finish ?? payload.kind
  );
  return {
    id: `${variantId}:${priceKind}`,
    variantId,
    priceKind,
  };
}

export interface HoldingQuery {
  q?: string;
  market: string;
  kind: string;
  currency: string;
}

export type CollectionHolding = Awaited<ReturnType<typeof loadCollectionHoldings>>[number];

/**
 * Everything a user owns, one row per printing and finish, with the current
 * price and the change over the last week. Unsorted.
 */
export async function loadCollectionHoldings(userId: string, query: HoldingQuery) {
  const events = await prisma.collectionEvent.findMany({
    where: { userId },
    select: { variantId: true, payload: true, type: true, at: true },
    orderBy: { at: "asc" },
  });

  const qtys = new Map<string, number>();
  const holdings = new Map<
    string,
    { id: string; variantId: string; priceKind: "market" | "foil" | "etched" }
  >();
  const firstAdded = new Map<string, Date>();
  for (const e of events) {
    const payload = e.payload as {
      qty?: number;
      quantity?: number;
      finish?: unknown;
      kind?: unknown;
    };
    const holding = holdingFromEvent(e.variantId, payload);
    const delta =
      e.type === "add"
        ? (payload.qty ?? payload.quantity ?? 1)
        : -(payload.qty ?? payload.quantity ?? 1);
    holdings.set(holding.id, holding);
    qtys.set(holding.id, (qtys.get(holding.id) ?? 0) + delta);
    if (!firstAdded.has(holding.id)) firstAdded.set(holding.id, e.at);
  }

  const owned = [...qtys.entries()].filter(([, q]) => q > 0);
  const variantIds = [
    ...new Set(
      owned.flatMap(([id]) => {
        const variantId = holdings.get(id)?.variantId;
        return variantId ? [variantId] : [];
      })
    ),
  ];
  if (variantIds.length === 0) return [];

  const variants = await prisma.cardVariant.findMany({
    where: {
      variantId: { in: variantIds },
      ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
    },
  });

  const prices = await prisma.priceCache.findMany({
    where: {
      variantId: { in: variantIds },
      market: query.market,
      currency: query.currency,
      ...(query.kind === "auto"
        ? { kind: { in: ["market", "foil", "etched"] } }
        : { kind: query.kind }),
    },
  });
  const pricesByVariant = new Map<string, typeof prices>();
  for (const price of prices) {
    const entries = pricesByVariant.get(price.variantId) ?? [];
    entries.push(price);
    pricesByVariant.set(price.variantId, entries);
  }

  // Price change over the last week, from each holding's own price kind.
  const since = new Date(Date.now() - CHANGE_WINDOW_DAYS * 86_400_000);
  const recentPoints = await prisma.pricePoint.findMany({
    where: { variantId: { in: variantIds }, market: query.market, currency: query.currency, at: { gte: since } },
    select: { variantId: true, kind: true, amount: true, at: true },
  });
  const pointsByVariantKind = new Map<string, Array<{ at: Date; amount: number }>>();
  for (const p of recentPoints) {
    const k = `${p.variantId}|${p.kind}`;
    const arr = pointsByVariantKind.get(k) ?? [];
    arr.push({ at: p.at, amount: p.amount });
    pointsByVariantKind.set(k, arr);
  }

  const variantsById = new Map(variants.map((variant) => [variant.variantId, variant]));
  return owned.flatMap(([holdingId, qty]) => {
    const holding = holdings.get(holdingId);
    const v = holding ? variantsById.get(holding.variantId) : null;
    if (!holding || !v) return [];
    const preferredKind =
      query.kind === "auto" ? holding.priceKind : query.kind;
    const price =
      pricesByVariant
        .get(v.variantId)
        ?.find((entry) => entry.kind === preferredKind)?.amount ?? null;
    return [{
      holdingId,
      variantId: v.variantId,
      finish: finishForPriceKind(holding.priceKind),
      name: v.name,
      imageUri: v.imageUri,
      setId: v.setId,
      collectorNumber: v.collectorNumber,
      rarity: v.rarity,
      typeLine: v.typeLine,
      manaCost: v.manaCost,
      colors: v.colors,
      colorIdentity: v.colorIdentity,
      quantity: qty,
      priceUsd: price,
      lineValue: price != null ? price * qty : null,
      changePct: changeFromPoints(pointsByVariantKind.get(`${v.variantId}|${preferredKind}`) ?? []),
      addedAt: firstAdded.get(holdingId)?.toISOString() ?? null,
    }];
  });
}
