// Deck analysis worked out on the phone from the deck's cards: mana curve,
// card types, colors needed against colors produced, how many cards fill
// each role (ramp, draw, removal, wipes), opening-hand land odds, and plain
// suggestions. Also the shuffling and drawing for the opening-hand tester.

export interface AnalysisCard {
  cardName: string;
  quantity: number;
  section: string;
  variant?: {
    manaCost: string | null;
    typeLine: string | null;
    cmc: number | null;
    oracleText?: string | null;
    imageUri?: string | null;
  } | null;
}

export type Color = "W" | "U" | "B" | "R" | "G";
export const COLORS: Color[] = ["W", "U", "B", "R", "G"];

export type Role = "ramp" | "draw" | "removal" | "wipe";

export interface RoleCheck {
  role: Role | "lands";
  label: string;
  count: number;
  /** Suggested range for this format. */
  min: number;
  max: number;
  status: "low" | "good" | "high";
}

export interface DeckAnalysis {
  /** Cards in the main deck (mainboard + commander), counting copies. */
  total: number;
  lands: number;
  nonLands: number;
  /** Average mana value of non-land cards. */
  averageMv: number;
  /** Non-land cards by mana value 0..6, then 7+; split into creatures and other spells. */
  curve: Array<{ mv: string; creatures: number; spells: number }>;
  types: Array<{ type: string; count: number }>;
  /** Colored mana symbols in costs, and lands that can make each color. */
  colors: Array<{ color: Color; pips: number; sources: number }>;
  roles: RoleCheck[];
  /** Chance a 7-card opening hand has 2 to 4 lands, and at least 1. */
  openingHand: { twoToFourLands: number; atLeastOneLand: number; library: number };
  /** Cards we couldn't find in the catalog, so they're left out of the numbers. */
  unknown: number;
  suggestions: string[];
}

const TYPE_ORDER = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land"];

export function primaryType(typeLine: string | null | undefined): string {
  const front = (typeLine ?? "").split(/—|\/\//)[0];
  return TYPE_ORDER.find((t) => front.includes(t)) ?? "Other";
}

export function isLand(typeLine: string | null | undefined): boolean {
  return /\bLand\b/.test((typeLine ?? "").split("//")[0]);
}

/** Colored pips in a mana cost; a hybrid symbol counts toward each of its colors. */
export function countPips(manaCost: string | null | undefined): Record<Color, number> {
  const out: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const sym of (manaCost ?? "").match(/\{[^}]+\}/g) ?? []) {
    for (const c of COLORS) if (sym.includes(c)) out[c] += 1;
  }
  return out;
}

const BASIC_COLOR: Record<string, Color> = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };

/** Colors a land can produce, from its basic types and its "Add {X}" text. */
export function landColors(typeLine: string | null | undefined, oracleText: string | null | undefined): Set<Color> {
  const out = new Set<Color>();
  for (const [basic, c] of Object.entries(BASIC_COLOR)) if ((typeLine ?? "").includes(basic)) out.add(c);
  const text = oracleText ?? "";
  if (/any color|mana of any type|any one color/i.test(text)) COLORS.forEach((c) => out.add(c));
  // Fetch lands find the basic types they name.
  if (/search your library for an? .*(Plains|Island|Swamp|Mountain|Forest)/i.test(text)) {
    for (const [basic, c] of Object.entries(BASIC_COLOR)) if (new RegExp(`search your library[^.]*${basic}`, "i").test(text)) out.add(c);
  }
  for (const add of text.match(/Add [^.]*/g) ?? []) for (const c of COLORS) if (add.includes(`{${c}}`)) out.add(c);
  return out;
}

const ROLE_PATTERNS: Record<Role, RegExp[]> = {
  ramp: [
    /\bAdd (?:\{|one mana|two mana|three mana|X mana|an amount of)/i,
    /search your library for (?:up to \w+ )?(?:a |an |two )?(?:basic )?lands?\b/i,
    /put (?:a|up to \w+) (?:basic )?land cards? .*onto the battlefield/i,
    /you may play an additional land/i,
  ],
  draw: [/\bdraws? (?:a|an|two|three|four|X|that many|cards equal|\w+) cards?\b/i, /\bdraw cards? equal/i, /look at the top .* put .* into your hand/i],
  removal: [
    /\b(?:destroy|exile) target (?:creature|permanent|artifact|enchantment|planeswalker|nonland|attacking|tapped|creature or)/i,
    /deals? (?:\d+|X) damage to (?:any target|target creature|target planeswalker|each opponent's creatures)/i,
    /target creature gets -\d+\/-\d+|target creature gets -X\/-X/i,
    /return target (?:creature|nonland permanent|permanent) to its owner's hand/i,
    /counter target spell/i,
    /owner of target (?:creature|permanent|nonland permanent) shuffles it/i,
    /fights? (?:target|up to one target) creature/i,
  ],
  wipe: [/\b(?:destroy|exile) (?:all|each) (?:other )?(?:creatures|nonland permanents|permanents|artifacts|enchantments)/i, /all creatures get -/i, /deals? \d+ damage to each creature/i],
};

/** Which roles a non-land card plays, from its rules text. */
export function rolesOf(oracleText: string | null | undefined, typeLine?: string | null): Set<Role> {
  const out = new Set<Role>();
  if (isLand(typeLine)) return out;
  const text = oracleText ?? "";
  for (const role of Object.keys(ROLE_PATTERNS) as Role[]) {
    if (ROLE_PATTERNS[role].some((re) => re.test(text))) out.add(role);
  }
  // A wipe isn't also counted as spot removal.
  if (out.has("wipe")) out.delete("removal");
  return out;
}

/** Ways to choose k from n. */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Chance of exactly k successes when drawing `draws` from `size` cards containing `hits`. */
export function hypergeometric(size: number, hits: number, draws: number, k: number): number {
  const total = choose(size, draws);
  return total === 0 ? 0 : (choose(hits, k) * choose(size - hits, draws - k)) / total;
}

interface Targets {
  lands: [number, number];
  ramp: [number, number];
  draw: [number, number];
  removal: [number, number];
  wipe: [number, number];
}

// Rough community guidelines: commander decks lean on ramp and draw; 60-card decks on removal.
function targetsFor(format: string, averageMv: number, ramp: number): Targets {
  if (format === "commander" || format === "oathbreaker" || format === "brawl") {
    const big = format === "commander";
    // Lots of ramp lets a deck run a couple fewer lands.
    const lands: [number, number] = big ? (ramp >= 12 ? [33, 37] : [35, 38]) : [24, 27];
    return big
      ? { lands, ramp: [10, 16], draw: [10, 16], removal: [8, 14], wipe: [2, 5] }
      : { lands, ramp: [4, 8], draw: [5, 10], removal: [5, 10], wipe: [1, 3] };
  }
  const lands: [number, number] = averageMv < 2.2 ? [19, 22] : averageMv < 3 ? [22, 24] : [24, 27];
  return { lands, ramp: [0, 8], draw: [2, 10], removal: [6, 14], wipe: [0, 4] };
}

const ROLE_LABEL: Record<Role | "lands", string> = { lands: "Lands", ramp: "Ramp", draw: "Card draw", removal: "Removal", wipe: "Board wipes" };

export function analyzeDeck(cards: AnalysisCard[], format: string): DeckAnalysis {
  const main = cards.filter((c) => c.section === "mainboard" || c.section === "commander");
  const known = main.filter((c) => c.variant);
  const unknown = main.filter((c) => !c.variant).reduce((n, c) => n + c.quantity, 0);
  const total = main.reduce((n, c) => n + c.quantity, 0);

  let lands = 0;
  let mvSum = 0;
  let nonLands = 0;
  const curve = Array.from({ length: 8 }, (_, i) => ({ mv: i === 7 ? "7+" : String(i), creatures: 0, spells: 0 }));
  const types = new Map<string, number>();
  const pips: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const sources: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const roleCount: Record<Role, number> = { ramp: 0, draw: 0, removal: 0, wipe: 0 };

  // Colors the deck actually asks for, so "any color" sources only count toward those.
  for (const c of known) {
    if (isLand(c.variant!.typeLine)) continue;
    const p = countPips(c.variant!.manaCost);
    for (const col of COLORS) pips[col] += p[col] * c.quantity;
  }
  const used = COLORS.filter((col) => pips[col] > 0);
  const addSources = (made: Set<Color>, q: number) => {
    const anyColor = made.size === 5;
    for (const col of made) if (!anyColor || used.includes(col)) sources[col] += q;
  };

  for (const c of known) {
    const v = c.variant!;
    const q = c.quantity;
    const type = primaryType(v.typeLine);
    types.set(type, (types.get(type) ?? 0) + q);
    if (isLand(v.typeLine)) {
      lands += q;
      addSources(landColors(v.typeLine, v.oracleText), q);
      continue;
    }
    nonLands += q;
    const mv = Math.max(0, Math.round(v.cmc ?? 0));
    mvSum += mv * q;
    const bucket = curve[Math.min(7, mv)];
    if (type === "Creature") bucket.creatures += q;
    else bucket.spells += q;
    for (const role of rolesOf(v.oracleText, v.typeLine)) roleCount[role] += q;
    // Mana rocks and dorks also make colors.
    if (/\bAdd /.test(v.oracleText ?? "")) addSources(landColors(null, v.oracleText), q);
  }

  const averageMv = nonLands ? mvSum / nonLands : 0;
  const targets = targetsFor(format, averageMv, roleCount.ramp);
  const check = (role: Role | "lands", count: number): RoleCheck => {
    const [min, max] = targets[role];
    return { role, label: ROLE_LABEL[role], count, min, max, status: count < min ? "low" : count > max ? "high" : "good" };
  };
  const roles = [check("lands", lands), check("ramp", roleCount.ramp), check("draw", roleCount.draw), check("removal", roleCount.removal), check("wipe", roleCount.wipe)];

  // The commander starts in the command zone, so it isn't in the library.
  const library = cards.filter((c) => c.section === "mainboard").reduce((n, c) => n + c.quantity, 0);
  const libraryLands = cards
    .filter((c) => c.section === "mainboard" && isLand(c.variant?.typeLine))
    .reduce((n, c) => n + c.quantity, 0);
  const draws = Math.min(7, library);
  let twoToFour = 0;
  for (let k = 2; k <= 4; k++) twoToFour += hypergeometric(library, libraryLands, draws, k);
  const atLeastOne = 1 - hypergeometric(library, libraryLands, draws, 0);

  const colors = COLORS.filter((c) => pips[c] > 0).map((c) => ({ color: c, pips: pips[c], sources: sources[c] }));

  return {
    total,
    lands,
    nonLands,
    averageMv,
    curve,
    types: [...types.entries()].sort((a, b) => TYPE_ORDER.indexOf(a[0]) - TYPE_ORDER.indexOf(b[0])).map(([type, count]) => ({ type, count })),
    colors,
    roles,
    openingHand: { twoToFourLands: twoToFour, atLeastOneLand: atLeastOne, library },
    unknown,
    suggestions: suggest(roles, colors, averageMv, unknown),
  };
}

const COLOR_NAME: Record<Color, string> = { W: "white", U: "blue", B: "black", R: "red", G: "green" };

function suggest(roles: RoleCheck[], colors: DeckAnalysis["colors"], averageMv: number, unknown: number): string[] {
  const out: string[] = [];
  for (const r of roles) {
    if (r.status === "low") out.push(`${r.label}: ${r.count}. Most decks like this run ${r.min} to ${r.max}.`);
    if (r.status === "high" && r.role === "lands") out.push(`${r.count} lands is on the high side; ${r.min} to ${r.max} is typical.`);
  }
  // Compare each color's share of pips with its share of sources.
  const totalPips = colors.reduce((n, c) => n + c.pips, 0);
  const totalSources = colors.reduce((n, c) => n + c.sources, 0);
  if (totalPips > 0 && totalSources > 0) {
    for (const c of colors) {
      const need = c.pips / totalPips;
      const have = c.sources / totalSources;
      if (need >= 0.15 && have < need * 0.7) {
        out.push(`${Math.round(need * 100)}% of your colored mana symbols are ${COLOR_NAME[c.color]}, but only ${Math.round(have * 100)}% of your mana sources make it.`);
      }
    }
  }
  if (averageMv >= 4) out.push(`Average mana value is ${averageMv.toFixed(1)}. Consider trimming expensive spells or adding ramp.`);
  if (unknown > 0) out.push(`${unknown} ${unknown === 1 ? "card isn't" : "cards aren't"} in our catalog yet, so ${unknown === 1 ? "it's" : "they're"} left out of these numbers.`);
  return out;
}

// ── Opening hand tester ──────────────────────────────────────────────────────

export interface LibraryCard {
  /** Unique per copy, so duplicates can be told apart. */
  key: string;
  name: string;
  imageUri: string | null;
  land: boolean;
  mv: number;
}

/** One entry per copy in the main deck; the commander stays in the command zone. */
export function buildLibrary(cards: AnalysisCard[]): LibraryCard[] {
  return cards
    .filter((c) => c.section === "mainboard")
    .flatMap((c) =>
      Array.from({ length: c.quantity }, (_, i) => ({
        key: `${c.cardName}#${i}`,
        name: c.cardName,
        imageUri: c.variant?.imageUri ?? null,
        land: isLand(c.variant?.typeLine),
        mv: Math.round(c.variant?.cmc ?? 0),
      }))
    );
}

/** A shuffled copy (Fisher–Yates). */
export function shuffled<T>(items: T[], random: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
