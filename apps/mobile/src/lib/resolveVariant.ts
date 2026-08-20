import { getDb } from "./localDb";
import { getCardDetail, type ScanCandidate } from "./api";

/** Resolve a variantId to a ScanCandidate from local SQLite or API. */
export async function resolveVariantToCandidate(
  variantId: string,
  matchType: string,
  score: number
): Promise<ScanCandidate | null> {
  try {
    const database = await getDb();
    const row = await database.getFirstAsync<{
      variantId: string;
      cardId: string;
      name: string;
      setId: string | null;
      collectorNumber: string | null;
      imageUri: string | null;
      manaCost: string | null;
      typeLine: string | null;
      rarity: string | null;
    }>(`SELECT * FROM cards WHERE variantId = ? LIMIT 1`, [variantId]);

    if (row) {
      return {
        variantId: row.variantId,
        cardId: row.cardId,
        name: row.name,
        setId: row.setId,
        collectorNumber: row.collectorNumber,
        imageUri: row.imageUri,
        manaCost: row.manaCost,
        typeLine: row.typeLine,
        rarity: row.rarity,
        score,
        matchType,
        prices: [],
      };
    }
  } catch {
    // fall through to API
  }

  try {
    const { card } = await getCardDetail(variantId);
    const marketPrice = card.storePricing?.[0]?.prices?.find((p) => p.currency === "USD");
    return {
      variantId: card.variantId,
      cardId: card.variantId,
      name: card.name,
      setId: card.setId,
      collectorNumber: card.collectorNumber,
      imageUri: card.imageUri,
      manaCost: card.manaCost,
      typeLine: card.typeLine,
      rarity: card.rarity,
      score,
      matchType,
      prices: marketPrice
        ? [{ market: "tcgplayer", kind: "market", currency: "USD", amount: marketPrice.amount }]
        : [],
    };
  } catch {
    return null;
  }
}
