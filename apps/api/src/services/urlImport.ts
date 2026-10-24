export interface ParsedDeckEntry {
  name: string;
  quantity: number;
  section: "mainboard" | "sideboard" | "commander" | "companion";
  /** Exact printing, when the source says which one. */
  scryfallId?: string;
  setCode?: string;
  collectorNumber?: string;
  foil?: boolean;
}

/** A deck pulled from another site, with what we can learn about it. */
export interface ImportedDeck {
  source: UrlType;
  name: string | null;
  format: string | null;
  commanders: string[];
  entries: ParsedDeckEntry[];
}

export type UrlType = "moxfield" | "archidekt" | "mtggoldfish";

export function detectUrlType(url: string): UrlType | null {
  if (url.includes("moxfield.com/decks/")) return "moxfield";
  if (url.includes("archidekt.com/decks/")) return "archidekt";
  if (url.includes("mtggoldfish.com/deck/")) return "mtggoldfish";
  return null;
}

/**
 * Parse plain-text MTG decklist into structured entries.
 * Handles: "4 Lightning Bolt", "// Sideboard", "COMMANDER:", "DECK:" section markers.
 */
export function parseDecklistText(text: string): ParsedDeckEntry[] {
  const entries: ParsedDeckEntry[] = [];
  let currentSection: ParsedDeckEntry["section"] = "mainboard";

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//")) {
      const stripped = line.replace(/^\/\/\s*/, "").toLowerCase().trim();
      if (stripped === "sideboard") currentSection = "sideboard";
      else if (stripped === "commander") currentSection = "commander";
      continue;
    }

    const sectionMatch = /^(COMMANDER|DECK|MAINBOARD|SIDEBOARD|COMPANION):$/i.exec(line.trim());
    if (sectionMatch) {
      const key = sectionMatch[1].toLowerCase();
      if (key === "commander") currentSection = "commander";
      else if (key === "deck" || key === "mainboard") currentSection = "mainboard";
      else if (key === "sideboard") currentSection = "sideboard";
      else if (key === "companion") currentSection = "companion";
      continue;
    }

    const match = line.match(/^(\d+)x?\s+(.+)$/);
    if (!match) continue;
    const [, qty, name] = match;
    entries.push({ name: name.trim(), quantity: parseInt(qty, 10), section: currentSection });
  }

  return entries;
}

/**
 * Fetch a deck from a supported URL and return parsed entries.
 * Throws on network error or unsupported URL.
 */
export async function importDeckFromUrl(url: string): Promise<ParsedDeckEntry[]> {
  return (await fetchDeckFromUrl(url)).entries;
}

const HEADERS = { "User-Agent": "CardEngine/1.0 (contact@cardengine.app)", Accept: "application/json" };

/** Fetch a deck from Moxfield, Archidekt or MTGGoldfish with its name, format and commanders. */
export async function fetchDeckFromUrl(url: string): Promise<ImportedDeck> {
  const type = detectUrlType(url);
  if (!type) throw new Error(`Unsupported deck URL: ${url}`);

  if (type === "moxfield") {
    const deckId = url.split("/decks/")[1]?.split(/[/?#]/)[0];
    if (!deckId) throw new Error("Cannot parse Moxfield deck ID from URL");
    // v3 is current; v2 still answers for some decks.
    for (const version of ["v3", "v2"]) {
      const res = await fetch(`https://api2.moxfield.com/${version}/decks/all/${deckId}`, { headers: HEADERS });
      if (res.ok) return parseMoxfield((await res.json()) as Record<string, unknown>);
      if (res.status === 404 && version === "v2") throw new Error("Moxfield deck not found. Is it public?");
    }
    throw new Error("Moxfield didn't answer. Try again, or paste the deck's export text instead.");
  }

  if (type === "archidekt") {
    const deckId = url.split("/decks/")[1]?.split(/[/?#]/)[0];
    if (!deckId) throw new Error("Cannot parse Archidekt deck ID from URL");
    const res = await fetch(`https://archidekt.com/api/decks/${deckId}/`, { headers: HEADERS });
    if (res.status === 404) throw new Error("Archidekt deck not found. Is it public?");
    if (!res.ok) throw new Error(`Archidekt API error: ${res.status}`);
    return parseArchidekt((await res.json()) as Record<string, unknown>);
  }

  const deckId = url.split("/deck/")[1]?.split(/[#?]/)[0];
  if (!deckId) throw new Error("Cannot parse MTGGoldfish deck ID from URL");
  const res = await fetch(`https://www.mtggoldfish.com/deck/download/${deckId}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`MTGGoldfish download error: ${res.status}`);
  const entries = parseDecklistText(await res.text());
  return { source: "mtggoldfish", name: null, format: null, commanders: [], entries };
}

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/**
 * Moxfield's deck JSON. v3 nests boards as `boards.mainboard.cards`; v2 has
 * top-level `mainboard`, `commanders`, … maps. Each card carries its name,
 * set, collector number and Scryfall id.
 */
export function parseMoxfield(data: Json): ImportedDeck {
  const boards = (data.boards as Json | undefined) ?? data;
  const zone = (key: string): Json | undefined => {
    const z = boards[key] as Json | undefined;
    return (z?.cards as Json | undefined) ?? z;
  };
  const entries: ParsedDeckEntry[] = [];
  const add = (key: string, section: ParsedDeckEntry["section"]) => {
    for (const raw of Object.values(zone(key) ?? {})) {
      const c = raw as Json;
      const card = (c.card as Json | undefined) ?? {};
      const name = str(card.name);
      const quantity = typeof c.quantity === "number" ? c.quantity : 0;
      if (!name || quantity <= 0) continue;
      entries.push({
        name,
        quantity,
        section,
        scryfallId: str(card.scryfall_id),
        setCode: str(card.set),
        collectorNumber: str(card.cn),
        foil: c.finish === "foil" || c.isFoil === true,
      });
    }
  };
  add("commanders", "commander");
  add("companions", "companion");
  add("mainboard", "mainboard");
  add("sideboard", "sideboard");
  return {
    source: "moxfield",
    name: str(data.name) ?? null,
    format: normalizeFormat(str(data.format)),
    commanders: entries.filter((e) => e.section === "commander").map((e) => e.name),
    entries,
  };
}

// Archidekt identifies formats by number.
const ARCHIDEKT_FORMATS: Record<number, string> = {
  1: "standard",
  2: "modern",
  3: "commander",
  4: "legacy",
  5: "vintage",
  6: "pauper",
  13: "brawl",
  14: "oathbreaker",
  15: "pioneer",
  16: "historic",
  19: "explorer",
};

/** Archidekt's deck JSON: one list of cards, sections given by category names. */
export function parseArchidekt(data: Json): ImportedDeck {
  const cards = (data.cards as Json[] | undefined) ?? [];
  // Categories marked "not in deck" (e.g. Maybeboard) are left out.
  const excluded = new Set(
    ((data.categories as Json[] | undefined) ?? []).filter((c) => c.includedInDeck === false).map((c) => String(c.name).toLowerCase())
  );
  const entries: ParsedDeckEntry[] = [];
  for (const c of cards) {
    const categories = ((c.categories as string[] | undefined) ?? []).map((x) => x.toLowerCase());
    if (categories.some((x) => excluded.has(x) || x === "maybeboard")) continue;
    const card = (c.card as Json | undefined) ?? {};
    const oracle = (card.oracleCard as Json | undefined) ?? {};
    const name = str(oracle.name) ?? str(card.name);
    const quantity = typeof c.quantity === "number" ? c.quantity : 0;
    if (!name || quantity <= 0) continue;
    const section: ParsedDeckEntry["section"] = categories.includes("commander")
      ? "commander"
      : categories.includes("companion")
        ? "companion"
        : categories.includes("sideboard")
          ? "sideboard"
          : "mainboard";
    entries.push({
      name,
      quantity,
      section,
      scryfallId: str(card.uid),
      setCode: str((card.edition as Json | undefined)?.editioncode),
      collectorNumber: str(card.collectorNumber),
      foil: String(c.modifier ?? "").toLowerCase() === "foil",
    });
  }
  return {
    source: "archidekt",
    name: str(data.name) ?? null,
    format: typeof data.deckFormat === "number" ? (ARCHIDEKT_FORMATS[data.deckFormat] ?? null) : null,
    commanders: entries.filter((e) => e.section === "commander").map((e) => e.name),
    entries,
  };
}

function normalizeFormat(format: string | undefined): string | null {
  if (!format) return null;
  const f = format.toLowerCase();
  if (f === "edh") return "commander";
  return f;
}
