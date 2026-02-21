import { asCardId, type CardId, type DeckValidationResult, type FormatBundle, type RulesEngine } from "@cardengine/engine";

function sumQty(lines: Array<{ quantity: number }>): number {
  return lines.reduce((acc, x) => acc + x.quantity, 0);
}

const UNLIMITED_COPIES_CARDS = new Set<CardId>([
  asCardId("Plains"), asCardId("Island"), asCardId("Swamp"),
  asCardId("Mountain"), asCardId("Forest"),
  asCardId("Snow-Covered Plains"), asCardId("Snow-Covered Island"),
  asCardId("Snow-Covered Swamp"), asCardId("Snow-Covered Mountain"),
  asCardId("Snow-Covered Forest"), asCardId("Wastes"),
  asCardId("Rat Colony"), asCardId("Relentless Rats"),
  asCardId("Shadowborn Apostle"), asCardId("Persistent Petitioners"),
  asCardId("Dragon's Approach"), asCardId("Slime Against Humanity"),
]);

export class MtgRulesEngine implements RulesEngine {
  validateDeck(input: {
    deck: { cards: Array<{ cardId: CardId; quantity: number; board?: string }> };
    format: FormatBundle;
  }): DeckValidationResult {
    const { deck, format } = input;
    const violations: DeckValidationResult["violations"] = [];

    const main = deck.cards.filter((c) => (c.board ?? "main") === "main");
    const side = deck.cards.filter((c) => (c.board ?? "main") === "side");
    const mainCount = sumQty(main);
    const sideCount = sumQty(side);

    const { minMain, maxMain, exactMain, minSide, maxSide, maxCopiesPerCard, bannedCardIds, restrictedCardIds } = format.rules;

    if (typeof exactMain === "number" && mainCount !== exactMain) {
      violations.push({ code: "deck.main_size_exact", severity: "error", message: `Main deck must be exactly ${exactMain} cards (got ${mainCount}).` });
    } else {
      if (typeof minMain === "number" && mainCount < minMain) {
        violations.push({ code: "deck.main_size_min", severity: "error", message: `Main deck must be at least ${minMain} cards (got ${mainCount}).` });
      }
      if (typeof maxMain === "number" && mainCount > maxMain) {
        violations.push({ code: "deck.main_size_max", severity: "error", message: `Main deck must be at most ${maxMain} cards (got ${mainCount}).` });
      }
    }

    if (typeof minSide === "number" && sideCount < minSide) {
      violations.push({ code: "deck.side_size_min", severity: "error", message: `Sideboard must be at least ${minSide} cards (got ${sideCount}).` });
    }
    if (typeof maxSide === "number" && sideCount > maxSide) {
      violations.push({ code: "deck.side_size_max", severity: "error", message: `Sideboard must be at most ${maxSide} cards (got ${sideCount}).` });
    }

    if (typeof maxCopiesPerCard === "number") {
      const counts = new Map<CardId, number>();
      for (const line of main) {
        counts.set(line.cardId, (counts.get(line.cardId) ?? 0) + line.quantity);
      }
      for (const [cardId, qty] of counts) {
        if (UNLIMITED_COPIES_CARDS.has(cardId)) continue;
        if (qty > maxCopiesPerCard) {
          violations.push({ code: "deck.copies_per_card", severity: "error", message: `Too many copies of a card: ${qty} > ${maxCopiesPerCard}.`, cardId });
        }
      }
    }

    if (bannedCardIds?.length) {
      const banned = new Set(bannedCardIds);
      for (const line of deck.cards) {
        if (banned.has(line.cardId)) {
          violations.push({ code: "deck.banned_card", severity: "error", message: "Deck contains a banned card.", cardId: line.cardId });
        }
      }
    }

    if (restrictedCardIds?.length) {
      const restricted = new Set(restrictedCardIds);
      for (const line of deck.cards) {
        if (restricted.has(line.cardId) && line.quantity > 1) {
          violations.push({ code: "deck.restricted_card", severity: "error", message: "Deck contains too many copies of a restricted card.", cardId: line.cardId });
        }
      }
    }

    return { isLegal: violations.every((v) => v.severity !== "error"), violations };
  }
}
