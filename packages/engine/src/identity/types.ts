export type GameId = "mtg" | "pokemon" | (string & {});

export type CardId = string & { readonly __brand: "CardId" };
export type PrintingId = string & { readonly __brand: "PrintingId" };
export type VariantId = string & { readonly __brand: "VariantId" };

export type SourceProviderId = "scryfall" | "pokemon-tcg-api" | (string & {});

export const asCardId = (value: string): CardId => value as CardId;
export const asPrintingId = (value: string): PrintingId => value as PrintingId;
export const asVariantId = (value: string): VariantId => value as VariantId;

export interface SourceRef {
  provider: SourceProviderId;
  id: string;
}

export interface CardIdentity {
  game: GameId;
  cardId: CardId;
  printingId: PrintingId;
  variantId: VariantId;
  source: {
    card: SourceRef;
    printing: SourceRef;
    variant?: SourceRef;
  };
}
