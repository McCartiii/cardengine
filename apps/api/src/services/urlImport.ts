export interface ParsedDeckEntry {
  name: string;
  quantity: number;
  section: "mainboard" | "sideboard" | "commander" | "companion";
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
      if (line.toLowerCase().includes("sideboard")) currentSection = "sideboard";
      if (line.toLowerCase().includes("commander")) currentSection = "commander";
      continue;
    }

    const sectionMarker = line.replace(":", "").toLowerCase();
    if (sectionMarker === "commander") { currentSection = "commander"; continue; }
    if (sectionMarker === "deck" || sectionMarker === "mainboard") { currentSection = "mainboard"; continue; }
    if (sectionMarker === "sideboard") { currentSection = "sideboard"; continue; }
    if (sectionMarker === "companion") { currentSection = "companion"; continue; }

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
  const type = detectUrlType(url);
  if (!type) throw new Error(`Unsupported deck URL: ${url}`);

  if (type === "moxfield") return importMoxfield(url);
  if (type === "archidekt") return importArchidekt(url);
  return importMtgGoldfish(url);
}

async function importMoxfield(url: string): Promise<ParsedDeckEntry[]> {
  const deckId = url.split("/decks/")[1]?.split(/[/?#]/)[0];
  if (!deckId) throw new Error("Cannot parse Moxfield deck ID from URL");

  const res = await fetch(`https://api2.moxfield.com/v3/decks/all/${deckId}`, {
    headers: { "User-Agent": "CardEngine/1.0 (contact@cardengine.app)" },
  });
  if (!res.ok) throw new Error(`Moxfield API error: ${res.status}`);

  const data = await res.json() as Record<string, unknown>;
  const entries: ParsedDeckEntry[] = [];

  function extractZone(zone: unknown, section: ParsedDeckEntry["section"]) {
    if (!zone || typeof zone !== "object") return;
    for (const [, card] of Object.entries(zone as Record<string, unknown>)) {
      const c = card as Record<string, unknown>;
      const name = (c.card as Record<string, unknown>)?.name as string;
      const qty = c.quantity as number;
      if (name && qty) entries.push({ name, quantity: qty, section });
    }
  }

  extractZone(data.mainboard, "mainboard");
  extractZone(data.sideboard, "sideboard");
  extractZone(data.commanders, "commander");
  extractZone(data.companions, "companion");

  return entries;
}

async function importArchidekt(url: string): Promise<ParsedDeckEntry[]> {
  const deckId = url.split("/decks/")[1]?.split(/[/#]/)[0];
  if (!deckId) throw new Error("Cannot parse Archidekt deck ID from URL");

  const res = await fetch(`https://archidekt.com/api/decks/${deckId}/`, {
    headers: { "User-Agent": "CardEngine/1.0 (contact@cardengine.app)" },
  });
  if (!res.ok) throw new Error(`Archidekt API error: ${res.status}`);

  const data = await res.json() as Record<string, unknown>;
  const cards = (data.cards as Array<Record<string, unknown>>) ?? [];

  return cards.map((c) => {
    const categories = (c.categories as string[]) ?? [];
    let section: ParsedDeckEntry["section"] = "mainboard";
    if (categories.some((cat) => cat.toLowerCase() === "commander")) section = "commander";
    else if (categories.some((cat) => cat.toLowerCase() === "sideboard")) section = "sideboard";

    const card = c.card as Record<string, unknown>;
    const oracleCard = card.oracleCard as Record<string, unknown>;
    return {
      name: oracleCard.name as string,
      quantity: c.quantity as number,
      section,
    };
  });
}

async function importMtgGoldfish(url: string): Promise<ParsedDeckEntry[]> {
  const deckId = url.split("/deck/")[1]?.split(/[#?]/)[0];
  if (!deckId) throw new Error("Cannot parse MTGGoldfish deck ID from URL");

  const res = await fetch(`https://www.mtggoldfish.com/deck/download/${deckId}`, {
    headers: { "User-Agent": "CardEngine/1.0 (contact@cardengine.app)" },
  });
  if (!res.ok) throw new Error(`MTGGoldfish download error: ${res.status}`);

  const text = await res.text();
  return parseDecklistText(text);
}
