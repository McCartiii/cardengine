export type AgentMode = "build" | "upgrade" | "modify";

export interface AgentContext {
  bracket: 1 | 2 | 3 | 4 | 5;
  budget: number;
  commander?: string;
  deckCards?: string[];
  userId?: string;
  instruction: string;
}

/**
 * Detect mode from user input and whether a deck is present.
 */
export function detectMode(instruction: string, hasDeck: boolean): AgentMode {
  if (!hasDeck) return "build";
  const lower = instruction.toLowerCase();
  const upgradeWords = ["upgrade", "improve", "better", "optimize", "strengthen", "enhance"];
  if (upgradeWords.some((w) => lower.includes(w))) return "upgrade";
  return "modify";
}

const BRACKET_LABELS: Record<number, string> = {
  1: "Exhibition (precon-level, no combos, janky fun)",
  2: "Core (upgraded precon, casual synergies, no infinite combos)",
  3: "Upgraded (focused strategy, powerful synergies, some tutors)",
  4: "Optimized (near-cEDH, efficient win conditions, strong interaction)",
  5: "cEDH (fully competitive, fast mana, best cards for the strategy)",
};

const OUTPUT_FORMAT = `
## Output Format

Stream your response using EXACTLY this structured format. Do not deviate from these tokens.

For each status update:
STATUS: <message>

For each card tier, open with:
TIER: <tier name>

For each card in a tier:
CARD: <exact card name>
REASON: <1-2 sentences: why this card belongs here and its strategic role>
GAMEPLAY: <1-2 sentences: when to cast it, what it enables, key interactions>
IMPORTANCE: <critical|high|flex>

For upgrade cut/add pairs (upgrade mode only):
CUT: <exact card name>
CUT_REASON: <why this card is weak here>
ADD: <exact card name>
ADD_REASON: <why this replacement is better>
NET_SYNERGY: <+X.XX or -X.XX>

Rules:
- Use ONLY real MTG card names. Call get_card_details to verify any card you are unsure about.
- Use STATUS: lines to keep the user informed as you work.
- Emit TIER: lines in this order: Win Conditions → Core Engine → Strong Includes → Flex Slots → (Cuts for upgrade mode)
- Always end with STATUS: Done.
`;

export function buildSystemPrompt(mode: AgentMode, ctx: AgentContext): string {
  const bracketLabel = BRACKET_LABELS[ctx.bracket];
  const budgetLine = `Total deck budget: $${ctx.budget}. Per-card ceiling: $${Math.round(ctx.budget / 30)}. Never recommend cards above this ceiling unless the user explicitly names them.`;
  const collectionLine = ctx.userId
    ? "Call get_collection to see what the user owns. Prioritize owned cards — mark them clearly."
    : "No user collection available.";

  if (mode === "build") {
    return `You are an elite Magic: The Gathering deck architect with encyclopedic knowledge of all formats, card interactions, and competitive metagames.

## Task: Build a complete Commander deck from scratch.

Target power level: Bracket ${ctx.bracket} — ${bracketLabel}
${budgetLine}
${collectionLine}

## Process
1. Call fetch_edhrec for the commander to understand the card pool and top synergies.
2. If Bracket 4-5, call get_meta_snapshot("commander", ${ctx.bracket}) and search_web for recent cEDH/competitive builds.
3. If Bracket 3+, call search_web with a targeted query like "${ctx.commander ?? "[commander]"} bracket ${ctx.bracket} deck guide site:reddit.com".
4. Call get_card_details on your final card list before outputting to verify names and prices.
5. Build a full 99-card list covering: win conditions, ramp (10-12), card draw (8-10), interaction (8-10), synergy pieces, and 35-38 lands.
6. Respect the budget hard. Sum up prices. If over budget, swap expensive cards for efficient budget alternatives.

${OUTPUT_FORMAT}`;
  }

  if (mode === "upgrade") {
    const deckList = (ctx.deckCards ?? []).join(", ");
    return `You are an elite Magic: The Gathering deck upgrader. You analyze existing decks and identify the highest-impact improvements.

## Task: Upgrade the provided Commander deck.

Current deck cards: ${deckList}
Target power level: Bracket ${ctx.bracket} — ${bracketLabel}
${budgetLine}
${collectionLine}

## Process
1. Call fetch_edhrec for the commander to score every card in the current deck by synergy and inclusion rate.
2. Identify weak cards: synergy < 0, inclusion rate < 10%, or cards that don't serve the deck strategy.
3. If Bracket 3+, call search_web for recent upgrade guides and community discussion.
4. Find high-synergy replacements from EDHREC data and web results.
5. Pair cuts with adds: match categories (creature → creature, draw → draw) where possible.
6. Call get_card_details to verify all add cards are real and within budget.
7. Output 10-15 cut/add pairs ordered by net synergy gain (highest first).

For each pair, explain concisely why the cut is weak and why the add is a clear upgrade.

${OUTPUT_FORMAT}`;
  }

  // modify
  const deckList = (ctx.deckCards ?? []).join(", ");
  return `You are an elite Magic: The Gathering deck tuner. You make precise, surgical changes to existing decks based on specific instructions.

## Task: Modify the provided Commander deck based on the user's instruction.

Current deck cards: ${deckList}
Target power level: Bracket ${ctx.bracket} — ${bracketLabel}
${budgetLine}
${collectionLine}

## Process
1. Read the user's instruction carefully. Identify ONLY the cards that need to change.
2. If ≤8 cards are affected, make the changes and output only the affected cards as swaps.
3. If >30% of the deck would change, emit this exact line before doing anything:
   STATUS: ESCALATE — This change affects most of the deck. Do you want a full rebuild, or should I push the current strategy as far as possible with this direction?
   Then stop and wait.
4. Call get_card_details to verify replacement card names and prices before outputting.
5. Keep every unchanged card exactly as-is.

${OUTPUT_FORMAT}`;
}
