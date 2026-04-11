// apps/web/src/app/decks/[id]/deck-helpers.ts

export interface RichCard {
  id: string;
  cardName: string;
  quantity: number;
  section: string;
  price: number | null;
  variant?: {
    imageUri: string | null;
    typeLine: string | null;
    manaCost: string | null;
    colors: string[] | null;
    cmc: number | null;
    rarity: string | null;
  } | null;
}

export type GroupBy = "section" | "type" | "color" | "cmc";
export type ViewMode = "list" | "art" | "artname";
export type SortBy = "name" | "price-desc" | "price-asc" | "cmc";

export interface CardGroup {
  key: string;
  label: string;
  color: string;
  cards: RichCard[];
  count: number;
}

export interface DeckStats {
  totalCards: number;
  uniqueCards: number;
  totalValue: number;
  avgCmc: number;
  manaCurve: { cmc: string; count: number }[];
  colorCounts: { color: string; label: string; hex: string; count: number }[];
  typeCounts: { type: string; color: string; count: number }[];
  rarityCounts: { rarity: string; color: string; count: number }[];
}

export const SECTION_ORDER = ["commander", "mainboard", "sideboard", "companion"];
export const SECTION_LABEL: Record<string, string> = {
  commander: "Commander",
  mainboard: "Mainboard",
  sideboard: "Sideboard",
  companion: "Companion",
};

export const TYPE_ORDER = [
  "Commander", "Creature", "Planeswalker", "Instant",
  "Sorcery", "Artifact", "Enchantment", "Land", "Other",
];
export const TYPE_COLORS: Record<string, string> = {
  Commander: "#a855f7", Creature: "#22c55e", Planeswalker: "#f59e0b",
  Instant: "#00d4ff", Sorcery: "#3b82f6", Artifact: "#94a3b8",
  Enchantment: "#ec4899", Land: "#78716c", Other: "#6b7280",
};

export const MTG_COLORS = [
  { color: "W", label: "White", hex: "#F9FAF4" },
  { color: "U", label: "Blue",  hex: "#0E68AB" },
  { color: "B", label: "Black", hex: "#6B6B6B" },
  { color: "R", label: "Red",   hex: "#D3202A" },
  { color: "G", label: "Green", hex: "#00733E" },
];

const RARITY_COLORS: Record<string, string> = {
  common: "#94a3b8", uncommon: "#b0c4de", rare: "#f59e0b", mythic: "#ef4444", special: "#a855f7",
};

export function getCardType(typeLine: string | null | undefined): string {
  if (!typeLine) return "Other";
  if (typeLine.includes("Land")) return "Land";
  if (typeLine.includes("Creature")) return "Creature";
  if (typeLine.includes("Planeswalker")) return "Planeswalker";
  if (typeLine.includes("Instant")) return "Instant";
  if (typeLine.includes("Sorcery")) return "Sorcery";
  if (typeLine.includes("Artifact")) return "Artifact";
  if (typeLine.includes("Enchantment")) return "Enchantment";
  return "Other";
}

export function cardImageUrl(card: RichCard): string {
  if (card.variant?.imageUri) return card.variant.imageUri;
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.cardName)}&format=image&version=normal`;
}

export function sortCards(cards: RichCard[], sortBy: SortBy): RichCard[] {
  return [...cards].sort((a, b) => {
    switch (sortBy) {
      case "name":       return a.cardName.localeCompare(b.cardName);
      case "price-desc": return (b.price ?? 0) - (a.price ?? 0);
      case "price-asc":  return (a.price ?? 0) - (b.price ?? 0);
      case "cmc":        return (a.variant?.cmc ?? 0) - (b.variant?.cmc ?? 0);
    }
  });
}

export function groupCards(cards: RichCard[], groupBy: GroupBy): CardGroup[] {
  if (groupBy === "section") {
    const bySection = new Map<string, RichCard[]>();
    for (const card of cards) {
      const s = card.section ?? "mainboard";
      if (!bySection.has(s)) bySection.set(s, []);
      bySection.get(s)!.push(card);
    }
    return SECTION_ORDER
      .filter(s => bySection.has(s))
      .map(s => ({
        key: s,
        label: SECTION_LABEL[s] ?? s,
        color: "#0D9488",
        cards: bySection.get(s)!,
        count: bySection.get(s)!.reduce((n, c) => n + c.quantity, 0),
      }));
  }

  if (groupBy === "type") {
    const byType = new Map<string, RichCard[]>();
    for (const card of cards) {
      const t = card.section === "commander" ? "Commander" : getCardType(card.variant?.typeLine);
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t)!.push(card);
    }
    return TYPE_ORDER
      .filter(t => byType.has(t))
      .map(t => ({
        key: t,
        label: t,
        color: TYPE_COLORS[t] ?? "#6b7280",
        cards: byType.get(t)!,
        count: byType.get(t)!.reduce((n, c) => n + c.quantity, 0),
      }));
  }

  if (groupBy === "color") {
    const multi: RichCard[] = [];
    const colorless: RichCard[] = [];
    const byColor: Record<string, RichCard[]> = { W: [], U: [], B: [], R: [], G: [] };
    for (const card of cards) {
      const colors = card.variant?.colors ?? [];
      if (colors.length === 0) { colorless.push(card); continue; }
      if (colors.length > 1)   { multi.push(card); continue; }
      byColor[colors[0]]?.push(card);
    }
    const groups: CardGroup[] = [];
    for (const { color, label, hex } of MTG_COLORS) {
      if (byColor[color].length > 0) {
        groups.push({
          key: color, label, color: hex,
          cards: byColor[color],
          count: byColor[color].reduce((n, c) => n + c.quantity, 0),
        });
      }
    }
    if (multi.length > 0)
      groups.push({ key: "multi", label: "Multicolor", color: "#f59e0b", cards: multi, count: multi.reduce((n, c) => n + c.quantity, 0) });
    if (colorless.length > 0)
      groups.push({ key: "colorless", label: "Colorless", color: "#94a3b8", cards: colorless, count: colorless.reduce((n, c) => n + c.quantity, 0) });
    return groups;
  }

  // CMC grouping
  const byCmc = new Map<string, RichCard[]>();
  for (const card of cards) {
    const cmc = card.variant?.cmc ?? 0;
    const key = cmc >= 7 ? "7+" : String(Math.floor(cmc));
    if (!byCmc.has(key)) byCmc.set(key, []);
    byCmc.get(key)!.push(card);
  }
  const cmcOrder = ["0", "1", "2", "3", "4", "5", "6", "7+"];
  return cmcOrder
    .filter(k => byCmc.has(k))
    .map(k => ({
      key: k,
      label: k === "7+" ? "7+ CMC" : `${k} CMC`,
      color: "#0D9488",
      cards: byCmc.get(k)!,
      count: byCmc.get(k)!.reduce((n, c) => n + c.quantity, 0),
    }));
}

export function computeStats(cards: RichCard[], totalValue: number): DeckStats {
  const totalCards = cards.reduce((n, c) => n + c.quantity, 0);
  const uniqueCards = cards.length;

  const cardsWithCmc = cards.filter(c => c.variant?.cmc != null && !c.variant.typeLine?.includes("Land"));
  const avgCmc = cardsWithCmc.length > 0
    ? cardsWithCmc.reduce((sum, c) => sum + (c.variant!.cmc! * c.quantity), 0) /
      cardsWithCmc.reduce((n, c) => n + c.quantity, 0)
    : 0;

  // Mana curve (exclude lands)
  const cmcBuckets: Record<string, number> = {};
  for (const card of cards) {
    if (card.variant?.typeLine?.includes("Land")) continue;
    const cmc = card.variant?.cmc ?? 0;
    const key = cmc >= 7 ? "7+" : String(Math.floor(cmc));
    cmcBuckets[key] = (cmcBuckets[key] ?? 0) + card.quantity;
  }
  const manaCurve = ["0", "1", "2", "3", "4", "5", "6", "7+"].map(cmc => ({ cmc, count: cmcBuckets[cmc] ?? 0 }));

  // Color distribution (including colorless)
  const colorBuckets: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const card of cards) {
    if (card.variant?.typeLine?.includes("Land")) continue;
    const colors = card.variant?.colors ?? [];
    if (colors.length === 0) { colorBuckets.C += card.quantity; continue; }
    for (const c of colors) {
      if (c in colorBuckets) colorBuckets[c] += card.quantity;
    }
  }
  const ALL_COLORS = [
    ...MTG_COLORS,
    { color: "C", label: "Colorless", hex: "#94a3b8" },
  ];
  const colorCounts = ALL_COLORS
    .map(({ color, label, hex }) => ({ color, label, hex, count: colorBuckets[color] }))
    .filter(c => c.count > 0);

  // Type counts
  const typeBuckets: Record<string, number> = {};
  for (const card of cards) {
    const t = card.section === "commander" ? "Commander" : getCardType(card.variant?.typeLine);
    typeBuckets[t] = (typeBuckets[t] ?? 0) + card.quantity;
  }
  const typeCounts = TYPE_ORDER
    .filter(t => typeBuckets[t])
    .map(t => ({ type: t, color: TYPE_COLORS[t] ?? "#6b7280", count: typeBuckets[t] }));

  // Rarity counts
  const rarityBuckets: Record<string, number> = {};
  for (const card of cards) {
    const r = card.variant?.rarity ?? "common";
    rarityBuckets[r] = (rarityBuckets[r] ?? 0) + card.quantity;
  }
  const rarityCounts = ["mythic", "rare", "uncommon", "common"]
    .filter(r => rarityBuckets[r])
    .map(r => ({ rarity: r, color: RARITY_COLORS[r] ?? "#94a3b8", count: rarityBuckets[r] }));

  return { totalCards, uniqueCards, totalValue, avgCmc, manaCurve, colorCounts, typeCounts, rarityCounts };
}

// ── Deck Health Analysis ──────────────────────────────────────────────────────

export interface DeckIssue {
  severity: "critical" | "warning" | "good";
  text: string;
  action?: string; // label for the "Fix" button
}

export function analyzeDeckHealth(cards: RichCard[], format: string): DeckIssue[] {
  const issues: DeckIssue[] = [];
  const total = cards.reduce((n, c) => n + c.quantity, 0);
  const isCommander = format.toLowerCase() === "commander" || format.toLowerCase() === "historic-brawl";
  const targetSize = isCommander ? 100 : format.toLowerCase() === "brawl" || format.toLowerCase() === "oathbreaker" ? 60 : 60;

  // Card count
  if (total < targetSize) {
    const missing = targetSize - total;
    issues.push({ severity: "warning", text: `${missing} cards short of ${targetSize}`, action: "Fill" });
  }

  // Count types
  const typeSet = (typeLine: string | null | undefined) => typeLine?.toLowerCase() ?? "";
  let boardWipes = 0;
  let removal = 0;
  let rampCount = 0;
  let drawCount = 0;
  let landCount = 0;

  for (const card of cards) {
    const tl = typeSet(card.variant?.typeLine);
    if (tl.includes("land")) { landCount += card.quantity; continue; }
    // Rough heuristics based on type
    if (tl.includes("instant") || tl.includes("sorcery")) {
      removal += card.quantity; // rough proxy
    }
  }

  // Lands check
  const expectedLands = isCommander ? 36 : 24;
  if (landCount < expectedLands - 4 && total > 20) {
    issues.push({ severity: "warning", text: `Only ${landCount} lands — consider ${expectedLands}`, action: "Fix" });
  }

  // Check for interaction (very rough — look for instant/sorcery count)
  const instantsSorceries = cards.filter(c => {
    const tl = typeSet(c.variant?.typeLine);
    return tl.includes("instant") || tl.includes("sorcery");
  }).reduce((n, c) => n + c.quantity, 0);
  if (instantsSorceries < 5 && total > 30) {
    issues.push({ severity: "critical", text: "Very few instants/sorceries — low interaction", action: "Fix" });
  }

  // Ramp check (artifacts + mana dorks)
  const rampCards = cards.filter(c => {
    const tl = typeSet(c.variant?.typeLine);
    const cmc = c.variant?.cmc ?? 99;
    return (tl.includes("artifact") && cmc <= 3) || (tl.includes("creature") && cmc <= 2 && !tl.includes("land"));
  }).reduce((n, c) => n + c.quantity, 0);
  if (rampCards >= 8) {
    issues.push({ severity: "good", text: `Ramp looks solid — ${rampCards} sources detected` });
  } else if (rampCards < 5 && total > 30) {
    issues.push({ severity: "warning", text: `Only ${rampCards} ramp sources detected`, action: "Fix" });
  }

  // Card draw check
  const drawCards = cards.filter(c => {
    const tl = typeSet(c.variant?.typeLine);
    return tl.includes("enchantment") || (tl.includes("instant") && (c.variant?.cmc ?? 0) <= 3);
  }).reduce((n, c) => n + c.quantity, 0);
  if (drawCards >= 8) {
    issues.push({ severity: "good", text: `Card advantage looks healthy` });
  }

  // Avg CMC check
  const nonLands = cards.filter(c => !typeSet(c.variant?.typeLine).includes("land"));
  const avgCmc = nonLands.length > 0
    ? nonLands.reduce((s, c) => s + (c.variant?.cmc ?? 0) * c.quantity, 0) / nonLands.reduce((n, c) => n + c.quantity, 0)
    : 0;
  if (avgCmc > 3.8 && total > 30) {
    issues.push({ severity: "warning", text: `High average CMC (${avgCmc.toFixed(1)}) — may be slow`, action: "Fix" });
  }

  return issues;
}

export function computeHealthGrade(issues: DeckIssue[]): string {
  const crits = issues.filter(i => i.severity === "critical").length;
  const warns = issues.filter(i => i.severity === "warning").length;
  if (crits >= 2) return "D";
  if (crits === 1) return "C-";
  if (warns >= 3) return "C";
  if (warns === 2) return "B-";
  if (warns === 1) return "B+";
  return "A";
}
