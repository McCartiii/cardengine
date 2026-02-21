import { normalizeCardName, normalizeCollectorNumber, normalizeSetCode } from "./normalize.js";

export interface ScanCandidate {
  variantId: string;
  cardId: string;
  printingId: string;
  name: string;
  setId: string;
  collectorNumber: string;
  confidence: number;
  imageUri?: string;
}

export interface CardIndex {
  search(input: {
    name?: string;
    collectorNumber?: string;
    setCode?: string;
    limit?: number;
  }): ScanCandidate[];
}

export class InMemoryCardIndex implements CardIndex {
  private cards: ScanCandidate[];

  constructor(cards: ScanCandidate[]) {
    this.cards = cards;
  }

  search(input: {
    name?: string;
    collectorNumber?: string;
    setCode?: string;
    limit?: number;
  }): ScanCandidate[] {
    const limit = input.limit ?? 3;
    const normName = input.name ? normalizeCardName(input.name).toLowerCase() : undefined;
    const normCN = input.collectorNumber ? normalizeCollectorNumber(input.collectorNumber) : undefined;
    const normSet = input.setCode ? normalizeSetCode(input.setCode) : undefined;

    const scored = this.cards.map((card) => {
      let score = 0;
      if (normName) {
        const cardNameLower = card.name.toLowerCase();
        if (cardNameLower === normName) {
          score += 60;
        } else if (cardNameLower.startsWith(normName)) {
          score += 40;
        } else if (cardNameLower.includes(normName)) {
          score += 25;
        } else {
          const dist = editDistance(normName, cardNameLower);
          if (dist <= 2) score += 35 - dist * 10;
          else if (dist <= 4) score += 10;
        }
      }
      if (normCN && card.collectorNumber.toUpperCase() === normCN) {
        score += 25;
      }
      if (normSet && card.setId.toUpperCase() === normSet) {
        score += 15;
      }
      return { card: { ...card, confidence: score }, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.card);
  }
}

function editDistance(a: string, b: string): number {
  if (a.length > 40 || b.length > 40) return 999;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}
