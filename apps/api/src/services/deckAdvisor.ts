import { prisma } from "../db.js";
import {
  fetchEdhrecCommander,
  sanitizeCommanderName,
  type EdhrecCardEntry,
} from "./edhrec.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DeckSuggestion {
  commander: {
    name: string;
    variantId: string;
    imageUri: string | null;
    colorIdentity: string[];
  };
  ownedCardsInIdentity: number;
  edhrecDecks: number;
  themes: string[];
  estimatedBudgetToComplete: number;
}

export interface CardRecommendation {
  name: string;
  variantId: string | null;
  synergy: number;
  inclusionRate: number;
  owned: boolean;
  priceUsd: number | null;
  imageUri: string | null;
  typeLine: string | null;
  manaCost: string | null;
  category: string;
  reason: string;
}

export interface SwapSuggestion {
  cut: {
    name: string;
    synergy: number;
    inclusionRate: number;
    reason: string;
  };
  add: {
    name: string;
    variantId: string | null;
    synergy: number;
    inclusionRate: number;
    owned: boolean;
    priceUsd: number | null;
    imageUri: string | null;
  };
  netSynergyGain: number;
  category: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Classify a card's role from its type line and oracle text.
 */
function classifyCardType(primaryType: string): string {
  const t = primaryType.toLowerCase();
  if (t.includes("creature")) return "creature";
  if (t.includes("instant")) return "instant";
  if (t.includes("sorcery")) return "sorcery";
  if (t.includes("artifact")) return "artifact";
  if (t.includes("enchantment")) return "enchantment";
  if (t.includes("planeswalker")) return "planeswalker";
  if (t.includes("land")) return "land";
  if (t.includes("battle")) return "battle";
  return "other";
}

/**
 * Check if a card's color identity is a subset of the commander's color identity.
 */
function isWithinColorIdentity(
  cardColors: string[],
  commanderColors: string[]
): boolean {
  const cmdSet = new Set(commanderColors.map((c) => c.toUpperCase()));
  return cardColors.every((c) => cmdSet.has(c.toUpperCase()));
}

/**
 * Build the set of owned variant IDs and card names from collection events.
 * Performs a single DB round-trip for events + one for name resolution.
 */
async function getOwnedCollection(
  userId: string
): Promise<{ variantIds: Set<string>; names: Set<string> }> {
  const events = await prisma.collectionEvent.findMany({
    where: { userId },
    select: { type: true, variantId: true, payload: true },
  });

  const quantities = new Map<string, number>();
  for (const e of events) {
    const qty = quantities.get(e.variantId) ?? 0;
    const payload = e.payload as Record<string, unknown>;
    const eventQty = (payload.quantity as number) ?? 1;
    if (e.type === "add") {
      quantities.set(e.variantId, qty + eventQty);
    } else if (e.type === "remove") {
      quantities.set(e.variantId, qty - eventQty);
    }
  }

  const variantIds = new Set(
    [...quantities.entries()].filter(([, q]) => q > 0).map(([vid]) => vid)
  );

  if (variantIds.size === 0) return { variantIds, names: new Set() };

  const variants = await prisma.cardVariant.findMany({
    where: { variantId: { in: [...variantIds] } },
    select: { name: true },
  });

  return { variantIds, names: new Set(variants.map((v) => v.name.toLowerCase())) };
}

// ── Suggest Decks ──────────────────────────────────────────────────────────────

/**
 * Find potential commander decks the user could build from their collection.
 */
export async function suggestDecks(userId: string): Promise<DeckSuggestion[]> {
  // Get all owned variant IDs
  const { variantIds: ownedVariantIds } = await getOwnedCollection(userId);
  if (ownedVariantIds.size === 0) return [];

  const ownedIds = [...ownedVariantIds];

  // Find legendary creatures in user's collection
  const legendaryCreatures = await prisma.cardVariant.findMany({
    where: {
      variantId: { in: ownedIds },
      game: "mtg",
      typeLine: { contains: "Legendary", mode: "insensitive" },
    },
    select: {
      variantId: true,
      name: true,
      cardId: true,
      imageUri: true,
      colorIdentity: true,
      typeLine: true,
    },
  });

  // Filter to creatures only (Legendary Creature, Legendary Artifact Creature, etc.)
  const commanders = legendaryCreatures.filter((c) =>
    c.typeLine?.toLowerCase().includes("creature")
  );

  if (commanders.length === 0) return [];

  // Deduplicate by cardId (same card, different printings)
  const seenCardIds = new Set<string>();
  const uniqueCommanders = commanders.filter((c) => {
    if (seenCardIds.has(c.cardId)) return false;
    seenCardIds.add(c.cardId);
    return true;
  });

  // Get all owned cards with their color identities
  const allOwnedCards = await prisma.cardVariant.findMany({
    where: { variantId: { in: ownedIds }, game: "mtg" },
    select: {
      variantId: true,
      name: true,
      colorIdentity: true,
    },
  });

  // Score each commander
  const suggestions: DeckSuggestion[] = [];

  for (const cmdr of uniqueCommanders.slice(0, 20)) {
    const cmdIdentity = (cmdr.colorIdentity as string[]) ?? [];

    // Count owned cards within this commander's color identity
    const cardsInIdentity = allOwnedCards.filter((card) => {
      const cardIdentity = (card.colorIdentity as string[]) ?? [];
      return isWithinColorIdentity(cardIdentity, cmdIdentity);
    });

    // Try to get EDHREC data (non-blocking, graceful fallback)
    let edhrecDecks = 0;
    let themes: string[] = [];
    let avgPrice = 0;

    try {
      const edhrecData = await fetchEdhrecCommander(cmdr.name);
      if (edhrecData) {
        edhrecDecks = edhrecData.num_decks_avg;
        themes = edhrecData.themes.slice(0, 5);
        avgPrice = edhrecData.avg_price;
      }
    } catch {
      // EDHREC unavailable — continue without it
    }

    // Estimate budget: average deck price minus estimated owned card value
    const ownedRatio = Math.min(cardsInIdentity.length / 99, 1);
    const estimatedBudget = Math.max(0, avgPrice * (1 - ownedRatio * 0.7));

    suggestions.push({
      commander: {
        name: cmdr.name,
        variantId: cmdr.variantId,
        imageUri: cmdr.imageUri,
        colorIdentity: cmdIdentity,
      },
      ownedCardsInIdentity: cardsInIdentity.length,
      edhrecDecks,
      themes,
      estimatedBudgetToComplete: Math.round(estimatedBudget * 100) / 100,
    });
  }

  // Sort by number of owned cards (more = easier to build)
  suggestions.sort((a, b) => {
    // Primary: owned cards count
    const ownedDiff = b.ownedCardsInIdentity - a.ownedCardsInIdentity;
    if (ownedDiff !== 0) return ownedDiff;
    // Secondary: EDHREC popularity
    return b.edhrecDecks - a.edhrecDecks;
  });

  return suggestions.slice(0, 10);
}

// ── Card Recommendations ───────────────────────────────────────────────────────

export interface RecsInput {
  commanderName: string;
  currentCards: string[];
  userId?: string;
  budget?: number;
}

/**
 * Get card recommendations for a commander deck.
 */
export async function getRecommendations(
  input: RecsInput
): Promise<CardRecommendation[]> {
  const { commanderName, currentCards, userId, budget } = input;

  // Fetch EDHREC data
  const edhrecData = await fetchEdhrecCommander(commanderName);
  if (!edhrecData || edhrecData.cardlists.length === 0) {
    return [];
  }

  // Build set of current card names (lowercased)
  const currentSet = new Set(currentCards.map((n) => n.toLowerCase()));

  // Get owned card names if user is authenticated
  let ownedNames = new Set<string>();
  if (userId) {
    ({ names: ownedNames } = await getOwnedCollection(userId));
  }

  // Filter EDHREC recommendations: exclude cards already in the deck
  const candidates = edhrecData.cardlists.filter(
    (card) => !currentSet.has(card.name.toLowerCase())
  );

  // Resolve card names to local DB for variant IDs, prices, images
  const candidateNames = candidates.map((c) => c.name);
  const dbCards =
    candidateNames.length > 0
      ? await prisma.cardVariant.findMany({
          where: {
            game: "mtg",
            name: { in: candidateNames, mode: "insensitive" },
          },
          select: {
            variantId: true,
            name: true,
            imageUri: true,
            typeLine: true,
            manaCost: true,
          },
        })
      : [];

  // Build name -> best DB card map (prefer non-foil)
  const dbMap = new Map<
    string,
    { variantId: string; imageUri: string | null; typeLine: string | null; manaCost: string | null }
  >();
  for (const c of dbCards) {
    const key = c.name.toLowerCase();
    const existing = dbMap.get(key);
    if (!existing || existing.variantId.endsWith("-foil")) {
      dbMap.set(key, {
        variantId: c.variantId,
        imageUri: c.imageUri,
        typeLine: c.typeLine,
        manaCost: c.manaCost,
      });
    }
  }

  // Batch price lookup
  const variantIds = [...dbMap.values()].map((v) => v.variantId);
  const prices =
    variantIds.length > 0
      ? await prisma.priceCache.findMany({
          where: {
            variantId: { in: variantIds },
            market: "tcgplayer",
            kind: "market",
            currency: "USD",
          },
        })
      : [];
  const priceMap = new Map<string, number>();
  for (const p of prices) {
    priceMap.set(p.variantId, p.amount);
  }

  // Build recommendations
  const recommendations: CardRecommendation[] = [];

  for (const card of candidates) {
    const nameLower = card.name.toLowerCase();
    const dbCard = dbMap.get(nameLower);
    const priceUsd = dbCard ? (priceMap.get(dbCard.variantId) ?? null) : null;
    const owned = ownedNames.has(nameLower);

    // Budget filtering
    if (budget !== undefined && priceUsd !== null && priceUsd > budget && !owned) {
      continue;
    }

    const category = classifyCardType(card.primary_type);
    const synergyPct = Math.round(card.synergy * 100);
    const inclusionPct = Math.round(card.inclusion * 100);

    let reason: string;
    if (card.synergy > 0.2) {
      reason = `High synergy (+${synergyPct}%) - in ${inclusionPct}% of ${sanitizeCommanderName(commanderName)} decks`;
    } else if (card.inclusion > 0.5) {
      reason = `Staple - appears in ${inclusionPct}% of decks`;
    } else {
      reason = `Synergy: +${synergyPct}%, inclusion: ${inclusionPct}%`;
    }

    // Score for sorting: synergy + collection bonus
    const score = card.synergy + (owned ? 0.2 : 0);

    recommendations.push({
      name: card.name,
      variantId: dbCard?.variantId ?? null,
      synergy: card.synergy,
      inclusionRate: card.inclusion,
      owned,
      priceUsd,
      imageUri:
        dbCard?.imageUri ??
        card.image_uris?.[0]?.normal ??
        null,
      typeLine: dbCard?.typeLine ?? null,
      manaCost: dbCard?.manaCost ?? null,
      category,
      reason,
    });
  }

  // Sort: owned first, then by synergy descending
  recommendations.sort((a, b) => {
    if (a.owned !== b.owned) return a.owned ? -1 : 1;
    return b.synergy - a.synergy;
  });

  return recommendations.slice(0, 50);
}

// ── Swap Suggestions ───────────────────────────────────────────────────────────

export interface SwapsInput {
  commanderName: string;
  currentCards: string[];
  userId?: string;
  budget?: number;
}

/**
 * Suggest cards to swap in/out of a deck based on EDHREC data.
 */
export async function getSwapSuggestions(
  input: SwapsInput
): Promise<SwapSuggestion[]> {
  const { commanderName, currentCards, userId, budget } = input;

  // Fetch EDHREC data
  const edhrecData = await fetchEdhrecCommander(commanderName);
  if (!edhrecData || edhrecData.cardlists.length === 0) {
    return [];
  }

  // Build EDHREC lookup by card name
  const edhrecMap = new Map<string, EdhrecCardEntry>();
  for (const card of edhrecData.cardlists) {
    edhrecMap.set(card.name.toLowerCase(), card);
  }

  // Get owned card names
  let ownedNames = new Set<string>();
  if (userId) {
    ({ names: ownedNames } = await getOwnedCollection(userId));
  }

  const currentSet = new Set(currentCards.map((n) => n.toLowerCase()));

  // Identify weak cards in the current deck (low synergy or not in EDHREC data)
  interface CutCandidate {
    name: string;
    synergy: number;
    inclusionRate: number;
    category: string;
    reason: string;
  }

  const cutCandidates: CutCandidate[] = [];

  for (const cardName of currentCards) {
    const nameLower = cardName.toLowerCase();
    const edhrecEntry = edhrecMap.get(nameLower);

    // Skip basic lands and the commander itself
    if (nameLower === commanderName.toLowerCase()) continue;
    if (
      nameLower.startsWith("plains") ||
      nameLower.startsWith("island") ||
      nameLower.startsWith("swamp") ||
      nameLower.startsWith("mountain") ||
      nameLower.startsWith("forest")
    )
      continue;

    if (!edhrecEntry) {
      // Card not in EDHREC data at all — potential cut
      cutCandidates.push({
        name: cardName,
        synergy: 0,
        inclusionRate: 0,
        category: "other",
        reason: "Not commonly played in this commander's decks",
      });
    } else if (edhrecEntry.synergy < 0 || edhrecEntry.inclusion < 0.1) {
      cutCandidates.push({
        name: cardName,
        synergy: edhrecEntry.synergy,
        inclusionRate: edhrecEntry.inclusion,
        category: classifyCardType(edhrecEntry.primary_type),
        reason:
          edhrecEntry.synergy < 0
            ? `Negative synergy (${Math.round(edhrecEntry.synergy * 100)}%)`
            : `Low inclusion (${Math.round(edhrecEntry.inclusion * 100)}%)`,
      });
    }
  }

  // Sort cuts by worst synergy first
  cutCandidates.sort((a, b) => a.synergy - b.synergy);

  // Identify best cards NOT in the deck
  const addCandidates = edhrecData.cardlists
    .filter((card) => !currentSet.has(card.name.toLowerCase()))
    .sort((a, b) => b.synergy - a.synergy);

  // Resolve DB info for add candidates
  const addNames = addCandidates.slice(0, 30).map((c) => c.name);
  const addDbCards =
    addNames.length > 0
      ? await prisma.cardVariant.findMany({
          where: {
            game: "mtg",
            name: { in: addNames, mode: "insensitive" },
          },
          select: { variantId: true, name: true, imageUri: true },
        })
      : [];
  const addDbMap = new Map<
    string,
    { variantId: string; imageUri: string | null }
  >();
  for (const c of addDbCards) {
    const key = c.name.toLowerCase();
    if (!addDbMap.has(key) || addDbMap.get(key)!.variantId.endsWith("-foil")) {
      addDbMap.set(key, { variantId: c.variantId, imageUri: c.imageUri });
    }
  }

  // Batch price lookup for add candidates
  const addVariantIds = [...addDbMap.values()].map((v) => v.variantId);
  const addPrices =
    addVariantIds.length > 0
      ? await prisma.priceCache.findMany({
          where: {
            variantId: { in: addVariantIds },
            market: "tcgplayer",
            kind: "market",
            currency: "USD",
          },
        })
      : [];
  const addPriceMap = new Map<string, number>();
  for (const p of addPrices) {
    addPriceMap.set(p.variantId, p.amount);
  }

  // Pair cuts with adds by category when possible
  const swaps: SwapSuggestion[] = [];
  const usedAdds = new Set<string>();

  for (const cut of cutCandidates.slice(0, 15)) {
    // Find the best add candidate, preferring same category
    let bestAdd: EdhrecCardEntry | null = null;

    // First pass: same category
    for (const add of addCandidates) {
      const addLower = add.name.toLowerCase();
      if (usedAdds.has(addLower)) continue;
      if (classifyCardType(add.primary_type) === cut.category) {
        const dbInfo = addDbMap.get(addLower);
        const price = dbInfo ? (addPriceMap.get(dbInfo.variantId) ?? null) : null;
        if (budget !== undefined && price !== null && price > budget && !ownedNames.has(addLower)) {
          continue;
        }
        bestAdd = add;
        break;
      }
    }

    // Second pass: any category
    if (!bestAdd) {
      for (const add of addCandidates) {
        const addLower = add.name.toLowerCase();
        if (usedAdds.has(addLower)) continue;
        const dbInfo = addDbMap.get(addLower);
        const price = dbInfo ? (addPriceMap.get(dbInfo.variantId) ?? null) : null;
        if (budget !== undefined && price !== null && price > budget && !ownedNames.has(addLower)) {
          continue;
        }
        bestAdd = add;
        break;
      }
    }

    if (!bestAdd) continue;

    const addLower = bestAdd.name.toLowerCase();
    usedAdds.add(addLower);

    const dbInfo = addDbMap.get(addLower);
    const price = dbInfo ? (addPriceMap.get(dbInfo.variantId) ?? null) : null;

    swaps.push({
      cut: {
        name: cut.name,
        synergy: cut.synergy,
        inclusionRate: cut.inclusionRate,
        reason: cut.reason,
      },
      add: {
        name: bestAdd.name,
        variantId: dbInfo?.variantId ?? null,
        synergy: bestAdd.synergy,
        inclusionRate: bestAdd.inclusion,
        owned: ownedNames.has(addLower),
        priceUsd: price,
        imageUri:
          dbInfo?.imageUri ??
          bestAdd.image_uris?.[0]?.normal ??
          null,
      },
      netSynergyGain: bestAdd.synergy - cut.synergy,
      category: cut.category !== "other" ? cut.category : classifyCardType(bestAdd.primary_type),
    });
  }

  // Sort by net synergy gain descending
  swaps.sort((a, b) => b.netSynergyGain - a.netSynergyGain);

  return swaps.slice(0, 10);
}
