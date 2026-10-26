// Checks the deck agent's picks against the card catalog and the format's
// rules, so mistakes go back to the model to fix instead of to the player.
import type { AgentResult } from "./agentOutput.js";
import { normalizeCardName } from "../lib/cardName.js";
import type { CardFact } from "./cardFacts.js";

export type AgentFormat =
  | "commander" | "brawl" | "oathbreaker"
  | "standard" | "pioneer" | "modern" | "legacy" | "vintage" | "pauper" | "historic" | "explorer";

export interface FormatRules {
  /** Cards in the main deck, not counting the commander(s). */
  mainSize: number;
  singleton: boolean;
  /** Cards must fit the commander's color identity. */
  identity: boolean;
  label: string;
}

export function rulesFor(format: string, commanderCount = 1): FormatRules {
  switch (format) {
    case "commander":
      return { mainSize: 100 - Math.max(1, commanderCount), singleton: true, identity: true, label: "Commander" };
    case "brawl":
      return { mainSize: 59, singleton: true, identity: true, label: "Brawl" };
    case "oathbreaker":
      // The oathbreaker and its signature spell sit outside the 58.
      return { mainSize: 58, singleton: true, identity: true, label: "Oathbreaker" };
    default:
      return { mainSize: 60, singleton: false, identity: false, label: format.charAt(0).toUpperCase() + format.slice(1) };
  }
}

export interface DeckCheckInput {
  mode: "build" | "upgrade" | "modify";
  format: string;
  result: AgentResult;
  facts: Map<string, CardFact>;
  commanders: CardFact[];
  /** Total budget for a build; spend on additions for an upgrade or change. 0 = none. */
  budget: number;
  deckCards: string[];
}

export interface DeckCheck {
  ok: boolean;
  issues: string[];
  /** Cards in a build, or additions in an upgrade. */
  cardCount: number;
  totalPrice: number;
}

const BUDGET_SLACK = 1.05;

const fmt = (n: number) => `$${n.toFixed(2)}`;

export function isBasicOrAnyNumber(fact: CardFact | undefined, name: string): boolean {
  if (fact?.typeLine && /\bBasic\b/.test(fact.typeLine)) return true;
  if (fact?.oracleText && /a deck can have any number of cards named/i.test(fact.oracleText)) return true;
  return /^(snow-covered )?(plains|island|swamp|mountain|forest)$|^wastes$/i.test(name.trim());
}

function outsideIdentity(fact: CardFact, identity: Set<string>): string[] {
  return fact.colorIdentity.filter((c) => !identity.has(c));
}

export function checkDeck(input: DeckCheckInput): DeckCheck {
  const { mode, format, result, facts, commanders, deckCards } = input;
  const rules = rulesFor(format, commanders.length || 1);
  const issues: string[] = [];
  if (result.escalated) return { ok: true, issues, cardCount: 0, totalPrice: 0 };

  const fact = (name: string) => facts.get(normalizeCardName(name));
  const identity = new Set(commanders.flatMap((c) => c.colorIdentity));
  const checkIdentity = rules.identity && commanders.length > 0;
  const commanderNames = new Set(commanders.map((c) => normalizeCardName(c.name)));
  const inDeck = new Set(deckCards.map(normalizeCardName));

  // The cards this answer puts into the deck.
  const added =
    mode === "build"
      ? result.cards.map((c) => ({ name: c.name, quantity: c.quantity }))
      : [
          ...result.swaps.map((s) => ({ name: s.add.name, quantity: 1 })),
          ...result.cards.map((c) => ({ name: c.name, quantity: c.quantity })),
        ];

  const unknown = new Set<string>();
  for (const { name } of added) {
    const f = fact(name);
    if (!f) {
      unknown.add(name);
      continue;
    }
    if (checkIdentity) {
      const off = outsideIdentity(f, identity);
      if (off.length) issues.push(`${f.name} has color identity ${f.colorIdentity.join("")}, outside the commander's ${[...identity].join("") || "colorless"} identity.`);
    }
    const legal = f.legalities?.[format];
    if (legal === "banned") issues.push(`${f.name} is banned in ${rules.label}.`);
    else if (legal === "not_legal") issues.push(`${f.name} is not legal in ${rules.label}.`);
    if (mode === "build" && commanderNames.has(normalizeCardName(f.name))) {
      issues.push(`${f.name} is the commander; don't list it in the 99.`);
    }
  }
  for (const name of unknown) issues.push(`"${name}" doesn't match any real card. Check the exact English name.`);

  // Copies.
  const copies = new Map<string, { name: string; n: number }>();
  for (const { name, quantity } of added) {
    const key = normalizeCardName(fact(name)?.name ?? name);
    const entry = copies.get(key) ?? { name: fact(name)?.name ?? name, n: 0 };
    entry.n += quantity;
    copies.set(key, entry);
  }
  for (const [key, { name, n }] of copies) {
    if (isBasicOrAnyNumber(fact(name), name)) continue;
    const already = mode !== "build" && inDeck.has(key) ? 1 : 0;
    const max = rules.singleton ? 1 : fact(name)?.legalities?.[format] === "restricted" ? 1 : 4;
    if (n + already > max) {
      issues.push(
        already
          ? `${name} is already in the deck.`
          : `${name} appears ${n} times; ${rules.label} allows ${max}.`
      );
    }
  }

  if (mode !== "build" && deckCards.length > 0) {
    for (const s of result.swaps) {
      if (!inDeck.has(normalizeCardName(s.cut.name)) && !inDeck.has(normalizeCardName(fact(s.cut.name)?.name ?? ""))) {
        issues.push(`${s.cut.name} is suggested as a cut but isn't in the deck.`);
      }
    }
  }

  const cardCount = added.reduce((n, c) => n + c.quantity, 0);
  if (mode === "build" && cardCount !== rules.mainSize) {
    issues.push(
      `The list has ${cardCount} cards; a ${rules.label} deck needs exactly ${rules.mainSize}${rules.identity ? " plus the commander" : ""}. ${
        cardCount < rules.mainSize ? `Add ${rules.mainSize - cardCount}.` : `Remove ${cardCount - rules.mainSize}.`
      }`
    );
  }

  const totalPrice = added.reduce((sum, c) => sum + (fact(c.name)?.priceUsd ?? 0) * c.quantity, 0);
  if (input.budget > 0 && totalPrice > input.budget * BUDGET_SLACK) {
    const priciest = added
      .map((c) => ({ name: fact(c.name)?.name ?? c.name, price: (fact(c.name)?.priceUsd ?? 0) * c.quantity }))
      .filter((c) => !isBasicOrAnyNumber(fact(c.name), c.name))
      .sort((a, b) => b.price - a.price)
      .slice(0, 5)
      .map((c) => `${c.name} ${fmt(c.price)}`)
      .join(", ");
    issues.push(
      `${mode === "build" ? "The deck" : "The additions"} cost ${fmt(totalPrice)}, over the ${fmt(input.budget)} budget. Most expensive: ${priciest}.`
    );
  }

  return { ok: issues.length === 0, issues, cardCount, totalPrice: Math.round(totalPrice * 100) / 100 };
}
