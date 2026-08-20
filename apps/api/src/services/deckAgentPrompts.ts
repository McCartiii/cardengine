import { getCommanderBracketContract, type CommanderBracket } from "./commanderBracketProfile.js";

export type AgentMode = "build" | "upgrade" | "modify";
export type DeckFormat = "commander" | "standard" | "pioneer" | "modern" | "legacy" | "vintage" | "pauper";

/** Pilot playstyle knobs (Commander; ignored for constructed in UI but harmless if sent). */
export type PlaySpeedPref = "slow" | "balanced" | "fast";
export type ComboTolerancePref = "none" | "low" | "medium" | "high";
/** Appetite for mass LD, extra-turn chains, hard stax. */
export type TablePressurePref = "low" | "medium" | "high";

export interface DeckBlueprint {
  goals?: string[];
  keyCards?: string[];
  avoidCards?: string[];
  modelAfter?: string;
  playSpeed?: PlaySpeedPref;
  comboTolerance?: ComboTolerancePref;
  tablePressure?: TablePressurePref;
  /** Short freeform (deck vibe, pod agreement, house rules). */
  notes?: string;
}

export interface AgentContext {
  format: DeckFormat;
  bracket: 1 | 2 | 3 | 4 | 5;
  budget: number;
  commander?: string;
  deckCards?: string[];
  userId?: string;
  instruction: string;
  blueprint?: DeckBlueprint;
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

const FORMAT_LABELS: Record<DeckFormat, string> = {
  commander: "Commander (100-card singleton)",
  standard: "Standard (60-card + sideboard)",
  pioneer: "Pioneer (60-card + sideboard)",
  modern: "Modern (60-card + sideboard)",
  legacy: "Legacy (60-card + sideboard)",
  vintage: "Vintage (60-card + sideboard)",
  pauper: "Pauper (60-card + sideboard)",
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

function budgetGuidance(ctx: AgentContext): string {
  const slots = ctx.format === "commander" ? 99 : 75; // 60 main + 15 side (constructed)
  const perCard = Math.max(2, Math.round(ctx.budget / slots));
  return `Total deck budget: $${ctx.budget}. Typical per-slot ceiling (~$${perCard}) — stay near it for bulk picks; you may exceed briefly for a few lynchpin cards if the user names them or blueprint demands it.`;
}

function formatDeckBlueprint(blueprint?: DeckBlueprint): string {
  if (!blueprint) return "No structured blueprint provided.";
  const lines: string[] = [];
  if (blueprint.goals?.length) lines.push(`Goals: ${blueprint.goals.join(", ")}`);
  if (blueprint.keyCards?.length) lines.push(`Must-include key cards: ${blueprint.keyCards.join(", ")}`);
  if (blueprint.avoidCards?.length) lines.push(`Must-avoid cards: ${blueprint.avoidCards.join(", ")}`);
  if (blueprint.modelAfter?.trim()) lines.push(`Model this deck after: ${blueprint.modelAfter.trim()}`);
  if (blueprint.playSpeed) lines.push(`Play speed preference: ${blueprint.playSpeed}`);
  if (blueprint.comboTolerance) lines.push(`Combo tolerance (pilot): ${blueprint.comboTolerance}`);
  if (blueprint.tablePressure) lines.push(`Mass LD / extra turns / hard stax appetite: ${blueprint.tablePressure}`);
  if (blueprint.notes?.trim()) lines.push(`Pilot notes: ${blueprint.notes.trim()}`);
  return lines.length ? lines.join("\n") : "No structured blueprint provided.";
}

function commanderLintFooter(ctx: AgentContext): string {
  if (ctx.format !== "commander") {
    return `

## Deck quality gate (tool)
Before **STATUS: Done**, call **validate_deck** with \`format: "${ctx.format}"\`, your full maindeck \`cardNames\`, optional \`sideboardNames\`, and \`budget: ${ctx.budget}\`.
If \`valid\` is false, apply \`repairHints\` and re-validate — do not finish until errors are resolved or you emit an ESCALATE line.
`;
  }
  return `

## Deck quality gate (tool)
Before **STATUS: Done**, call **validate_deck** with:
- \`format: "commander"\`, \`bracket: ${ctx.bracket}\`, \`budget: ${ctx.budget}\`
- \`commander\`: ${ctx.commander ? `"${ctx.commander}"` : "commander name if known"}
- \`cardNames\`: full intended list — every unique **CARD:** (build) or all post-change names (upgrade/modify). Pass 99 cards if commander is separate; include commander in the list if you already counted it toward 100.
If \`valid\` is false, apply every \`repairHints\` entry (legality, size, color identity, budget, blueprint, bracket lint) and re-validate. Do not emit **STATUS: Done** while error-level issues remain unless you ESCALATE.
`;
}

function commanderBracketBlock(ctx: AgentContext): string {
  if (ctx.format !== "commander") return "";
  const b = ctx.bracket as CommanderBracket;
  const label = BRACKET_LABELS[b];
  return `## Commander bracket contract (HARD RULES)

You are building for **Bracket ${b}** — ${label}

These rules override casual interpretation of card strength. If the user's free-text instruction or blueprint would violate this bracket, emit exactly:
STATUS: ESCALATE — Bracket ${b} conflicts with instructions/blueprint. Ask how to resolve (raise bracket, relax a constraint, or proceed with bracket-legal interpretation).

Contract:
${getCommanderBracketContract(b)}
`;
}

export function buildSystemPrompt(mode: AgentMode, ctx: AgentContext): string {
  const bracketLabel = BRACKET_LABELS[ctx.bracket];
  const formatLabel = FORMAT_LABELS[ctx.format];
  const budgetLine = budgetGuidance(ctx);
  const collectionLine = ctx.userId
    ? "Call get_collection to see what the user owns. Prioritize owned cards — mark them clearly."
    : "No user collection available.";
  const blueprintLine = formatDeckBlueprint(ctx.blueprint);
  const bracketBlock = commanderBracketBlock(ctx);
  const deckStructureLine =
    ctx.format === "commander"
      ? "Build a full 99-card commander list with 35-38 lands, balanced ramp/draw/interaction, and clear win packages."
      : "Build a legal 60-card maindeck with a 15-card sideboard, matchup plan, and coherent curve for the selected format.";

  if (mode === "build") {
    return `You are an elite Magic: The Gathering deck architect with encyclopedic knowledge of all formats, card interactions, and competitive metagames.

## Task: Build a complete ${formatLabel} deck from scratch.

Target format: ${ctx.format}
${ctx.format === "commander" ? `Target power level: Bracket ${ctx.bracket} — ${bracketLabel}` : ""}
${budgetLine}
${collectionLine}

## Deck blueprint (pilot intent)
${blueprintLine}
${bracketBlock}
## Process
${(() => {
    const s: string[] = [];
    if (ctx.format === "commander") {
      s.push("Re-read the bracket contract above before choosing packages.");
      s.push("Call fetch_edhrec for the commander to understand the card pool and top synergies.");
      s.push(
        ctx.bracket >= 4
          ? `Call get_meta_snapshot("commander", ${ctx.bracket}) and search_web for recent cEDH/competitive builds.`
          : `Optionally call get_meta_snapshot("commander", ${ctx.bracket}) for cached meta context.`
      );
    } else {
      s.push("Call get_meta_snapshot for the format and bracket 0, then search_web for recent competitive lists and sideboard plans.");
      s.push(`Use search_web with targeted queries like "${ctx.format} top decks 2026 sideboard guide".`);
    }
    s.push("Call get_card_details on your final card list before outputting to verify names and prices.");
    s.push(deckStructureLine);
    s.push("Respect the budget hard. Sum up prices. If over budget, swap expensive cards for efficient budget alternatives.");
    s.push(
      "Honor blueprint constraints first: keyCards must be included unless illegal; avoidCards must not appear. Pilot playstyle fields (playSpeed, comboTolerance, tablePressure) refine choices inside the bracket — they never override the bracket contract."
    );
    return s.map((line, i) => `${i + 1}. ${line}`).join("\n");
  })()}

${OUTPUT_FORMAT}
${commanderLintFooter(ctx)}`;
  }

  if (mode === "upgrade") {
    const deckList = (ctx.deckCards ?? []).join(", ");
    return `You are an elite Magic: The Gathering deck upgrader. You analyze existing decks and identify the highest-impact improvements.

## Task: Upgrade the provided ${formatLabel} deck.

Current deck cards: ${deckList}
Target format: ${ctx.format}
${ctx.format === "commander" ? `Target power level: Bracket ${ctx.bracket} — ${bracketLabel}` : ""}
${budgetLine}
${collectionLine}

## Deck blueprint (pilot intent)
${blueprintLine}
${bracketBlock}
## Process
1. ${ctx.format === "commander" ? "Call fetch_edhrec for the commander to score every card in the current deck by synergy and inclusion rate." : `Call get_meta_snapshot("${ctx.format}", 0) and search_web for matchup data and sideboard trends.`}
2. Identify weak cards: low synergy, poor role fit, over-budget picks, or cards that underperform in current meta — and cards that **violate the bracket contract** (e.g. cEDH staples in Bracket 1–2 unless blueprint explicitly allows).
3. Find high-impact replacements from source data and web results.
4. Pair cuts with adds: match categories (creature → creature, draw → draw) where possible. Every add must keep the deck inside the bracket contract.
5. Call get_card_details to verify all add cards are real and within budget.
6. Output 10-15 cut/add pairs ordered by net synergy gain (highest first).

For each pair, explain concisely why the cut is weak and why the add is a clear upgrade.

${OUTPUT_FORMAT}
${commanderLintFooter(ctx)}`;
  }

  // modify
  const deckList = (ctx.deckCards ?? []).join(", ");
  return `You are an elite Magic: The Gathering deck tuner. You make precise, surgical changes to existing decks based on specific instructions.

## Task: Modify the provided ${formatLabel} deck based on the user's instruction.

Current deck cards: ${deckList}
Target format: ${ctx.format}
${ctx.format === "commander" ? `Target power level: Bracket ${ctx.bracket} — ${bracketLabel}` : ""}
${budgetLine}
${collectionLine}

## Deck blueprint (pilot intent)
${blueprintLine}
${bracketBlock}
## Process
1. Read the user's instruction carefully. Identify ONLY the cards that need to change.
2. If ≤8 cards are affected, make the changes and output only the affected cards as swaps.
3. If >30% of the deck would change, emit this exact line before doing anything:
   STATUS: ESCALATE — This change affects most of the deck. Do you want a full rebuild, or should I push the current strategy as far as possible with this direction?
   Then stop and wait.
4. If the instruction would break the Commander bracket contract, emit STATUS: ESCALATE — Bracket conflict — instead of illegal changes.
5. Call get_card_details to verify replacement card names and prices before outputting.
6. Keep every unchanged card exactly as-is.

${OUTPUT_FORMAT}
${commanderLintFooter(ctx)}`;
}
