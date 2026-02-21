import type { CardId } from "../identity/types.js";

export interface DeckCardLine {
  cardId: CardId;
  variantId?: string;
  quantity: number;
  board?: "main" | "side" | "commander";
}

export interface Deck {
  game: string;
  formatId: string;
  cards: DeckCardLine[];
}

export type ViolationSeverity = "error" | "warning";

export interface RuleViolation {
  code: string;
  severity: ViolationSeverity;
  message: string;
  cardId?: CardId;
}

export interface DeckValidationResult {
  isLegal: boolean;
  violations: RuleViolation[];
}

export interface FormatBundle {
  id: string;
  game: string;
  name: string;
  updatedAt: string;
  rules: {
    minMain?: number;
    maxMain?: number;
    exactMain?: number;
    minSide?: number;
    maxSide?: number;
    maxCopiesPerCard?: number;
    bannedCardIds?: CardId[];
    restrictedCardIds?: CardId[];
    rotation?: {
      startsAt?: string;
      endsAt?: string;
      legalSetIds?: string[];
    };
    special?: Record<string, unknown>;
  };
}

export interface RulesEngine {
  validateDeck(input: { deck: Deck; format: FormatBundle }): DeckValidationResult;
}
