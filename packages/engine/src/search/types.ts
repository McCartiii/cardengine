import type { CardId, GameId, PrintingId, VariantId } from "../identity/types.js";

/**
 * A denormalized card record suitable for local indexing and search.
 * Both mobile (SQLite FTS) and web (IndexedDB) will store records in this shape.
 */
export interface CardRecord {
  variantId: VariantId;
  printingId: PrintingId;
  cardId: CardId;
  game: GameId;
  name: string;
  oracleText?: string;
  typeLine?: string;
  setId: string;
  collectorNumber: string;
  rarity?: "common" | "uncommon" | "rare" | "mythic" | (string & {});
  colors?: string[];
  colorIdentity?: string[];
  cmc?: number;
  manaCost?: string;
  isFoil?: boolean;
  isAlternateArt?: boolean;
  imageUri?: string;
  priceUsd?: number;
  priceEur?: number;
}
