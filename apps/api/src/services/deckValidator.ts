import { asCardId } from "@cardengine/engine";
import { MTG_FORMATS, MtgRulesEngine } from "@cardengine/mtg-adapter";
import { prisma } from "../db.js";
import { lintCommanderProposal } from "./commanderBracketLint.js";
import type { CommanderBracket } from "./commanderBracketProfile.js";
import type { DeckBlueprint, DeckFormat } from "./deckAgentPrompts.js";

const rulesEngine = new MtgRulesEngine();

export interface DeckValidationIssue {
  severity: "error" | "warn";
  code: string;
  message: string;
  cards?: string[];
}

export interface DeckValidationInput {
  format: DeckFormat;
  bracket?: CommanderBracket;
  commander?: string;
  budget?: number;
  blueprint?: DeckBlueprint;
  /** One entry per copy (constructed) or per card (commander). */
  cardNames: string[];
  sideboardNames?: string[];
}

export interface DeckValidationResult {
  valid: boolean;
  issues: DeckValidationIssue[];
  metrics: {
    mainCount: number;
    sideCount: number;
    deckSizeIncludingCommander: number;
    estimatedPriceUsd: number | null;
    unknownCards: string[];
    duplicateCards: string[];
  };
  repairHints: string[];
  bracketLint?: ReturnType<typeof lintCommanderProposal>;
}

interface ResolvedCard {
  name: string;
  colorIdentity: string[];
  priceUsd: number | null;
}

function norm(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/\s+/g, " ");
}

function isWithinColorIdentity(cardColors: string[], commanderColors: string[]): boolean {
  const cmdSet = new Set(commanderColors.map((c) => c.toUpperCase()));
  return cardColors.every((c) => cmdSet.has(c.toUpperCase()));
}

function aggregateCounts(names: string[]): Map<string, { displayName: string; qty: number }> {
  const counts = new Map<string, { displayName: string; qty: number }>();
  for (const raw of names) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = norm(trimmed);
    const hit = counts.get(key);
    if (hit) hit.qty += 1;
    else counts.set(key, { displayName: trimmed, qty: 1 });
  }
  return counts;
}

async function resolveCards(names: string[]): Promise<Map<string, ResolvedCard>> {
  const uniqueKeys = [...new Set(names.map(norm).filter(Boolean))];
  if (uniqueKeys.length === 0) return new Map();

  const variants = await prisma.cardVariant.findMany({
    where: {
      game: "mtg",
      OR: uniqueKeys.map((n) => ({ name: { equals: n, mode: "insensitive" as const } })),
    },
    select: {
      name: true,
      variantId: true,
      colorIdentity: true,
    },
  });

  const byName = new Map<string, { variantId: string; colorIdentity: string[] }>();
  for (const v of variants) {
    const key = norm(v.name);
    if (!byName.has(key) || byName.get(key)!.variantId.endsWith("-foil")) {
      byName.set(key, {
        variantId: v.variantId,
        colorIdentity: (v.colorIdentity as string[] | null) ?? [],
      });
    }
  }

  const variantIds = [...byName.values()].map((v) => v.variantId);
  const prices =
    variantIds.length > 0
      ? await prisma.priceCache.findMany({
          where: { variantId: { in: variantIds }, market: "tcgplayer", kind: "market", currency: "USD" },
        })
      : [];
  const priceMap = new Map(prices.map((p) => [p.variantId, p.amount]));

  const resolved = new Map<string, ResolvedCard>();
  for (const key of uniqueKeys) {
    const db = byName.get(key);
    if (!db) continue;
    resolved.set(key, {
      name: variants.find((v) => norm(v.name) === key)?.name ?? key,
      colorIdentity: db.colorIdentity,
      priceUsd: priceMap.get(db.variantId) ?? null,
    });
  }
  return resolved;
}

function buildRepairHints(issues: DeckValidationIssue[]): string[] {
  const hints: string[] = [];
  for (const issue of issues) {
    if (issue.severity !== "error") continue;
    switch (issue.code) {
      case "deck.size":
        hints.push(issue.message);
        break;
      case "deck.duplicate":
        hints.push(`Remove duplicate entries: ${(issue.cards ?? []).join(", ")}.`);
        break;
      case "deck.unknown":
        hints.push(`Fix or replace unknown card names: ${(issue.cards ?? []).slice(0, 8).join(", ")}.`);
        break;
      case "deck.color_identity":
        hints.push(`Replace off-color cards: ${(issue.cards ?? []).slice(0, 8).join(", ")}.`);
        break;
      case "deck.budget":
        hints.push(issue.message);
        break;
      case "blueprint.key_cards":
        hints.push(`Include required key cards: ${(issue.cards ?? []).join(", ")}.`);
        break;
      case "blueprint.avoid_cards":
        hints.push(`Remove must-avoid cards: ${(issue.cards ?? []).join(", ")}.`);
        break;
      case "bracket.lint":
        hints.push(issue.message);
        break;
      default:
        hints.push(issue.message);
    }
  }
  return [...new Set(hints)];
}

/**
 * Deterministic validation for agent-proposed deck lists.
 */
export async function validateDeckProposal(input: DeckValidationInput): Promise<DeckValidationResult> {
  const issues: DeckValidationIssue[] = [];
  const mainNames = input.cardNames.filter((n) => n.trim().length > 0);
  const sideNames = (input.sideboardNames ?? []).filter((n) => n.trim().length > 0);

  const mainCounts = aggregateCounts(mainNames);
  const sideCounts = aggregateCounts(sideNames);

  const duplicateCards: string[] = [];
  if (input.format === "commander") {
    for (const [, { displayName, qty }] of mainCounts) {
      if (qty > 1) duplicateCards.push(displayName);
    }
    if (duplicateCards.length) {
      issues.push({
        severity: "error",
        code: "deck.duplicate",
        message: "Commander is singleton — remove duplicate card entries.",
        cards: duplicateCards,
      });
    }
  }

  const commanderNorm = input.commander ? norm(input.commander) : null;
  const includesCommander =
    commanderNorm != null && [...mainCounts.keys()].some((k) => k === commanderNorm);

  const deckSizeIncludingCommander =
    mainCounts.size + (commanderNorm && !includesCommander ? 1 : 0);

  if (input.format === "commander") {
    if (deckSizeIncludingCommander !== 100) {
      issues.push({
        severity: "error",
        code: "deck.size",
        message: `Commander decks must be exactly 100 cards including the commander (got ${deckSizeIncludingCommander}).`,
      });
    }
    if (commanderNorm && !includesCommander && mainCounts.size === 99) {
      // OK — commander supplied separately
    } else if (!commanderNorm && !includesCommander) {
      issues.push({
        severity: "warn",
        code: "deck.commander_missing",
        message: "No commander specified — include commander in cardNames or pass commander parameter.",
      });
    }
  }

  const allNamesForResolve = [...mainNames];
  if (commanderNorm && !includesCommander && input.commander) {
    allNamesForResolve.push(input.commander);
  }
  const resolved = await resolveCards(allNamesForResolve);

  const unknownCards: string[] = [];
  for (const key of mainCounts.keys()) {
    if (!resolved.has(key)) unknownCards.push(mainCounts.get(key)!.displayName);
  }
  if (commanderNorm && !resolved.has(commanderNorm) && input.commander) {
    unknownCards.push(input.commander);
  }
  if (unknownCards.length) {
    issues.push({
      severity: "error",
      code: "deck.unknown",
      message: `${unknownCards.length} card name(s) could not be resolved in the database.`,
      cards: unknownCards.slice(0, 20),
    });
  }

  if (input.format === "commander" && commanderNorm) {
    const cmd = resolved.get(commanderNorm);
    if (cmd) {
      const offColor: string[] = [];
      for (const [key, { displayName }] of mainCounts) {
        if (key === commanderNorm) continue;
        const card = resolved.get(key);
        if (card && !isWithinColorIdentity(card.colorIdentity, cmd.colorIdentity)) {
          offColor.push(displayName);
        }
      }
      if (offColor.length) {
        issues.push({
          severity: "error",
          code: "deck.color_identity",
          message: "Cards outside the commander's color identity.",
          cards: offColor.slice(0, 15),
        });
      }
    }
  }

  const bundle = MTG_FORMATS[input.format];
  if (bundle) {
    const deckLines: Array<{ cardId: ReturnType<typeof asCardId>; quantity: number; board: "main" | "side" }> = [];
    for (const [, { displayName, qty }] of mainCounts) {
      deckLines.push({ cardId: asCardId(displayName), quantity: qty, board: "main" });
    }
    if (commanderNorm && !includesCommander && input.commander) {
      deckLines.push({ cardId: asCardId(input.commander), quantity: 1, board: "main" });
    }
    for (const [, { displayName, qty }] of sideCounts) {
      deckLines.push({ cardId: asCardId(displayName), quantity: qty, board: "side" });
    }

    const legal = rulesEngine.validateDeck({
      deck: { cards: deckLines.map((l) => ({ cardId: l.cardId, quantity: l.quantity, board: l.board })) },
      format: bundle,
    });

    for (const v of legal.violations) {
      if (v.severity === "error") {
        issues.push({
          severity: "error",
          code: v.code,
          message: v.message,
          cards: v.cardId ? [String(v.cardId)] : undefined,
        });
      }
    }
  }

  let estimatedPriceUsd: number | null = null;
  if (resolved.size > 0) {
    let total = 0;
    let priced = 0;
    for (const [, { displayName, qty }] of mainCounts) {
      const card = resolved.get(norm(displayName));
      if (card?.priceUsd != null) {
        total += card.priceUsd * qty;
        priced += qty;
      }
    }
    if (commanderNorm && !includesCommander) {
      const cmd = resolved.get(commanderNorm);
      if (cmd?.priceUsd != null) total += cmd.priceUsd;
    }
    estimatedPriceUsd = Math.round(total * 100) / 100;
    if (input.budget != null && input.budget > 0 && total > input.budget * 1.08) {
      issues.push({
        severity: "error",
        code: "deck.budget",
        message: `Estimated deck price $${total.toFixed(2)} exceeds budget $${input.budget} (>${Math.round(input.budget * 1.08)} with 8% slack).`,
      });
    } else if (input.budget != null && input.budget > 0 && total > input.budget) {
      issues.push({
        severity: "warn",
        code: "deck.budget_warn",
        message: `Estimated deck price $${total.toFixed(2)} is slightly over budget $${input.budget}.`,
      });
    }
    if (priced === 0 && mainCounts.size > 5) {
      issues.push({
        severity: "warn",
        code: "deck.price_unknown",
        message: "Could not price most cards — budget check is incomplete.",
      });
    }
  }

  if (input.blueprint?.keyCards?.length) {
    const present = new Set([...mainCounts.keys(), ...(commanderNorm ? [commanderNorm] : [])]);
    const missing = input.blueprint.keyCards.filter((k) => !present.has(norm(k)));
    if (missing.length) {
      issues.push({
        severity: "error",
        code: "blueprint.key_cards",
        message: "Blueprint must-include cards are missing from the list.",
        cards: missing,
      });
    }
  }

  if (input.blueprint?.avoidCards?.length) {
    const present = new Set(mainCounts.keys());
    const forbidden = input.blueprint.avoidCards.filter((k) => present.has(norm(k)));
    if (forbidden.length) {
      issues.push({
        severity: "error",
        code: "blueprint.avoid_cards",
        message: "Blueprint must-avoid cards are present.",
        cards: forbidden,
      });
    }
  }

  let bracketLint: ReturnType<typeof lintCommanderProposal> | undefined;
  if (input.format === "commander" && input.bracket) {
    const lintNames = [...mainNames];
    if (commanderNorm && !includesCommander && input.commander) lintNames.push(input.commander);
    bracketLint = lintCommanderProposal({ bracket: input.bracket, cardNames: lintNames });
    for (const f of bracketLint.findings) {
      if (f.severity === "fail") {
        issues.push({
          severity: "error",
          code: "bracket.lint",
          message: f.message,
          cards: f.cards,
        });
      } else if (f.severity === "warn") {
        issues.push({
          severity: "warn",
          code: "bracket.lint",
          message: f.message,
          cards: f.cards,
        });
      }
    }
  }

  const valid = !issues.some((i) => i.severity === "error");
  const repairHints = buildRepairHints(issues);

  return {
    valid,
    issues,
    metrics: {
      mainCount: mainCounts.size,
      sideCount: sideCounts.size,
      deckSizeIncludingCommander,
      estimatedPriceUsd,
      unknownCards,
      duplicateCards,
    },
    repairHints,
    bracketLint,
  };
}
