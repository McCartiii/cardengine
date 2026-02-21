export interface MtgDeckStats {
  mainCount: number;
  sideCount: number;
  uniqueCardsMain: number;
}

export function computeMtgDeckStats(deck: {
  cards: Array<{ quantity: number; board?: string; cardId: string }>;
}): MtgDeckStats {
  const main = deck.cards.filter((c) => (c.board ?? "main") === "main");
  const side = deck.cards.filter((c) => (c.board ?? "main") === "side");
  const mainCount = main.reduce((acc, x) => acc + x.quantity, 0);
  const sideCount = side.reduce((acc, x) => acc + x.quantity, 0);
  const uniqueCardsMain = new Set(main.map((x) => x.cardId)).size;
  return { mainCount, sideCount, uniqueCardsMain };
}
