import type { CommanderBracket } from "./commanderBracketProfile.js";

/**
 * Heuristic lint for Commander proposals. Not exhaustive — catches common
 * bracket-violation patterns so the agent can self-correct before STATUS: Done.
 */

export type LintSeverity = "info" | "warn" | "fail";

export interface LintFinding {
  severity: LintSeverity;
  code: string;
  message: string;
  cards?: string[];
}

function norm(n: string): string {
  return n
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/\s+/g, " ");
}

/** Fast mana & turbo enablers (Sol Ring intentionally excluded — common even at low brackets). */
const TURBO_MANA = new Set(
  [
    "Mana Crypt",
    "Jeweled Lotus",
    "Grim Monolith",
    "Mana Vault",
    "Mox Diamond",
    "Chrome Mox",
    "Ancient Tomb",
    "City of Traitors",
    "Dockside Extortionist",
  ].map((s) => norm(s))
);

const COMBO_KILL = new Set(
  [
    "Thassa's Oracle",
    "Demonic Consultation",
    "Tainted Pact",
    "Underworld Breach",
    "Lion's Eye Diamond",
    "Doomsday",
    "Ad Nauseam",
    "Necropotence",
    "Hermit Druid",
    "Protean Hulk",
    "Food Chain",
    "Isochron Scepter",
    "Dramatic Reversal",
  ].map((s) => norm(s))
);

const SOL_RING = norm("Sol Ring");

function collectHits(names: string[], set: Set<string>): string[] {
  const seen = new Set<string>();
  const hits: string[] = [];
  for (const raw of names) {
    const n = norm(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    if (set.has(n)) hits.push(raw.trim());
  }
  return hits;
}

function countTurbo(names: string[]): { count: number; hits: string[] } {
  const hits: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const n = norm(raw);
    if (!n || n === SOL_RING || seen.has(n)) continue;
    seen.add(n);
    if (TURBO_MANA.has(n)) hits.push(raw.trim());
  }
  return { count: hits.length, hits };
}

function nameSet(names: string[]): Set<string> {
  return new Set(names.map(norm).filter(Boolean));
}

/**
 * Lint a proposed card list for Commander. Call from the `lint_commander_deck` tool.
 */
export function lintCommanderProposal(args: {
  bracket: CommanderBracket;
  cardNames: string[];
}): { ok: boolean; findings: LintFinding[] } {
  const { bracket } = args;
  const names = args.cardNames.filter((n) => n.trim().length > 0);
  const findings: LintFinding[] = [];

  if (names.length === 0) {
    findings.push({
      severity: "warn",
      code: "EMPTY_LIST",
      message: "No card names supplied — cannot lint.",
    });
    return { ok: true, findings };
  }

  const turbo = countTurbo(names);
  const comboHits = collectHits(names, COMBO_KILL);
  const ns = nameSet(names);

  if (bracket <= 1) {
    if (turbo.hits.length > 0) {
      findings.push({
        severity: "fail",
        code: "B1_TURBO",
        message:
          "Bracket 1 (Exhibition): avoid fast mana / Dockside-tier packages. Remove or swap these unless the user explicitly named them in keyCards.",
        cards: turbo.hits,
      });
    }
    if (ns.has(norm("Thassa's Oracle")) && ns.has(norm("Demonic Consultation"))) {
      findings.push({
        severity: "fail",
        code: "B1_ORACLE_CONSULT",
        message: "Bracket 1: Thassa's Oracle + Demonic Consultation is a compact combo — not appropriate here.",
        cards: ["Thassa's Oracle", "Demonic Consultation"],
      });
    }
    if (ns.has(norm("Thassa's Oracle")) && ns.has(norm("Tainted Pact"))) {
      findings.push({
        severity: "fail",
        code: "B1_ORACLE_PACT",
        message: "Bracket 1: Thassa's Oracle + Tainted Pact is a compact combo — not appropriate here.",
        cards: ["Thassa's Oracle", "Tainted Pact"],
      });
    }
    if (comboHits.length >= 3) {
      findings.push({
        severity: "warn",
        code: "B1_COMBO_DENSITY",
        message: "Bracket 1: multiple high-tier combo enablers — verify the deck stays exhibition-level.",
        cards: comboHits.slice(0, 10),
      });
    }
  }

  if (bracket === 2) {
    if (turbo.count >= 5) {
      findings.push({
        severity: "fail",
        code: "B2_TURBO_DENSITY",
        message: "Bracket 2 (Core): too many fast-mana / turbo pieces for this bracket. Trim toward precon-plus density.",
        cards: turbo.hits,
      });
    } else if (turbo.count >= 3) {
      findings.push({
        severity: "warn",
        code: "B2_TURBO_WARN",
        message: "Bracket 2: fast mana is getting dense — consider cutting the weakest rocks.",
        cards: turbo.hits,
      });
    }
    if (ns.has(norm("Thassa's Oracle")) && ns.has(norm("Demonic Consultation"))) {
      findings.push({
        severity: "fail",
        code: "B2_ORACLE_CONSULT",
        message: "Bracket 2: Oracle + Consult is a compact cEDH-style line — use a slower win or escalate.",
        cards: ["Thassa's Oracle", "Demonic Consultation"],
      });
    }
  }

  if (bracket === 3) {
    if (turbo.count >= 9) {
      findings.push({
        severity: "warn",
        code: "B3_TURBO_HIGH",
        message: "Bracket 3: very high fast-mana density — ensure it matches the table and blueprint.",
        cards: turbo.hits,
      });
    }
  }

  const hasFail = findings.some((f) => f.severity === "fail");
  return { ok: !hasFail, findings };
}
