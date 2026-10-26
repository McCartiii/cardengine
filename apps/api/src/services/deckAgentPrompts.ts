import { rulesFor } from "./deckCheck.js";

export type AgentMode = "build" | "upgrade" | "modify";

export interface AgentContext {
  bracket: 1 | 2 | 3 | 4 | 5;
  budget: number;
  format: string;
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
  const upgradeWords = ["upgrade", "improve", "better", "optimize", "strengthen", "enhance", "stronger", "power up"];
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

const isCommanderFormat = (format: string) => rulesFor(format).identity;

const OUTPUT_FORMAT = `
## Output format

The app parses your answer line by line, so write only these lines (no markdown, no prose between them):

STATUS: <short progress note for the player>
TIER: <tier name>
CARD: <exact English card name>          (for several copies, e.g. basic lands: "CARD: 12x Forest")
REASON: <one sentence: its role here>
GAMEPLAY: <one sentence: when to cast it, key interaction>
IMPORTANCE: <critical|high|flex>

REASON and GAMEPLAY are optional: give both for critical cards, REASON for high, and nothing for flex cards and lands, so a full list stays short.

For upgrade and change answers, write each swap as:
CUT: <card in the deck>
CUT_REASON: <why it's weak here>
ADD: <card to bring in>
ADD_REASON: <why it's better>
NET_SYNERGY: <+X.XX or -X.XX, your estimate of the improvement>

Order tiers: Win Conditions, Core Engine, Strong Includes, Flex Slots, Lands. End with "STATUS: Done."`;

const CORRECTIONS = `
## Corrections

After you answer, the app checks every card against its catalog and the format rules. If it finds problems it will tell you; answer only with fixes, using:
REPLACE: <card from your answer>
WITH: <new card>
WHY: <one sentence>
REMOVE: <card from your answer>
and CARD lines (under a TIER line) for cards to add. Then "STATUS: Done."`;

function formatRules(ctx: AgentContext): string {
  const rules = rulesFor(ctx.format);
  if (rules.identity) {
    return `Format: ${rules.label}. ${rules.mainSize} cards plus the commander, singleton except basic lands, every card within the commander's color identity and legal in ${rules.label}.`;
  }
  return `Format: ${rules.label}. Exactly ${rules.mainSize} main-deck cards, at most 4 copies of any card except basic lands, every card legal in ${rules.label}. No sideboard.`;
}

function budgetLine(ctx: AgentContext, mode: AgentMode): string {
  if (ctx.budget <= 0) return "No budget limit.";
  return mode === "build"
    ? `Budget: $${ctx.budget} for the whole deck. get_card_details gives each card's cheapest printing; keep the total under budget.`
    : `Budget: $${ctx.budget} to spend on the cards you add.`;
}

export function buildSystemPrompt(mode: AgentMode, ctx: AgentContext): string {
  const commanderFormat = isCommanderFormat(ctx.format);
  const power = commanderFormat
    ? `Target power: Bracket ${ctx.bracket} (${BRACKET_LABELS[ctx.bracket]}).`
    : "Target power: a strong, tuned list for the current metagame.";
  const collection = ctx.userId
    ? "The player is signed in: call get_collection and prefer cards they own when they fit; say so in REASON."
    : "";
  const deck = (ctx.deckCards ?? []).length
    ? `\nCurrent deck (${ctx.deckCards!.length} entries): ${ctx.deckCards!.join("; ")}`
    : "";
  const commander = ctx.commander ? `Commander: ${ctx.commander}.` : "";

  const header = `You are an expert Magic: The Gathering deck builder working inside a collection app. Your picks are checked against real card data, so use the tools rather than memory for names, colors, legality and prices.

${formatRules(ctx)}
${commander}
${power}
${budgetLine(ctx, mode)}
${collection}${deck}`;

  const task =
    mode === "build"
      ? `## Task: build the complete deck.
Research first (fetch_edhrec for a commander; search_web or get_meta_snapshot when power or recency matters), then confirm your full list with get_card_details before answering. Cover win conditions, ramp, card draw, interaction and lands in sensible numbers for the format and power level. List every card exactly once (use "Nx" for basics) so the total is exactly ${rulesFor(ctx.format).mainSize}.`
      : mode === "upgrade"
        ? `## Task: upgrade this deck.
Find its weakest cards for its strategy and power target (EDHREC synergy and inclusion help for Commander), and pair each cut with a clearly better add of a similar role. Confirm the adds with get_card_details. Give 8-15 swaps, best first. Cuts must be cards in the deck; adds must not already be in it.`
        : `## Task: change the deck as the player asks.
Make only the changes the request needs, as swaps (CUT/ADD), plus CARD lines only for pure additions. Confirm the adds with get_card_details. If the request would replace more than about a third of the deck, write only:
STATUS: ESCALATE — This changes most of the deck. Do you want a full rebuild, or should I push the current strategy as far as it goes in this direction?`;

  return `${header}

${task}
${OUTPUT_FORMAT}
${CORRECTIONS}`;
}

/** The message that sends the checker's findings back to the model. */
export function correctionPrompt(issues: string[]): string {
  return `The app checked your answer and found these problems:\n${issues.map((i) => `- ${i}`).join("\n")}\n\nFix them now, using REPLACE/WITH/WHY, REMOVE and CARD lines only (check new picks with get_card_details first), then "STATUS: Done."`;
}
