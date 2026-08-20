/**
 * Deterministic RC-style bracket rules injected into the deck agent system prompt.
 * These are product constraints the model must treat as hard guardrails for Commander.
 */

export type CommanderBracket = 1 | 2 | 3 | 4 | 5;

const BRACKET_RULES: Record<CommanderBracket, readonly string[]> = {
  1: [
    "Power: Exhibition / precon-plus. Favor janky synergies, durdle-friendly value, and clear telegraphed win lines.",
    "Avoid cEDH-tier fast mana density (multiple free rocks, turbo rituals) unless the user explicitly lists them in keyCards.",
    "No two-card deterministic wins, no Thoracle-style oracle lines, no hard stax locks (e.g. heavy Rule of Law stacks + soft locks).",
    "Mass land denial, extra turns chains, and hand attack should be absent or single copies with clear table consent flavor.",
    "Interaction: mostly creature combat and splashy spells; keep tutors to a minimum (0–2).",
    "If the user's blueprint asks for higher power than this bracket, emit STATUS: ESCALATE — bracket vs blueprint conflict — and stop until clarified.",
  ],
  2: [
    "Power: Upgraded casual. Synergistic decks with a few strong cards are fine; still not a cEDH arms race.",
    "Combos: only slow or telegraphed combos (high mana, board-based); avoid compact two-card wins unless user explicitly requests combo in blueprint.",
    "Fast mana: light — a few signets/rocks OK; avoid a full turbo package.",
    "Stax: light — occasional hatebears OK; no hard prison locks.",
    "Tutors: low to moderate (about 3–6) — prefer redundancy over tutors.",
    "If blueprint demands tournament combos at this bracket, emit STATUS: ESCALATE — and stop.",
  ],
  3: [
    "Power: Focused tuned Commander. Strong synergies, efficient interaction, and real win lines.",
    "Combos: allowed if not fully optimized cEDH speed; prefer resilient multi-piece wins.",
    "Fast mana: moderate — sensible rocks, not a full cEDH suite unless justified by strategy and blueprint.",
    "Stax: situational — targeted stax OK; avoid hard locks unless blueprint asks for stax.",
    "Tutors: moderate — deck should be consistent but not every tutor in the game.",
    "Respect table norms: still avoid mass land denial unless blueprint explicitly allows it.",
  ],
  4: [
    "Power: High — near-optimized. Efficient mana, strong interaction, and fast closing lines.",
    "Combos: compact combos allowed when they fit the commander; prioritize resilience and interaction density.",
    "Fast mana: high — multiple rocks/rituals acceptable where appropriate.",
    "Stax: allowed in measured doses; still build a coherent deck, not random misery.",
    "Tutors: high — consistency is expected.",
    "Mass land denial / extra turns: only if it fits the archetype and blueprint; default lean.",
  ],
  5: [
    "Power: cEDH / fully competitive. Optimize mana, interaction, and win rate.",
    "Combos: compact efficient wins are expected when appropriate to colors/strategy.",
    "Fast mana: max out sensible fast mana for the color identity unless budget forbids.",
    "Stax / stifle: allowed as meta-appropriate packages.",
    "Tutors: high — play the best tutors the budget allows.",
    "Still obey legality, color identity, blueprint must-include/avoid, and budget ceilings unless user overrides in text.",
  ],
};

export function getCommanderBracketContract(bracket: CommanderBracket): string {
  const lines = BRACKET_RULES[bracket];
  return lines.map((l) => `- ${l}`).join("\n");
}
