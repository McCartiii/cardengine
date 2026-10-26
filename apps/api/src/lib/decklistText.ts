// Reads a pasted decklist: "4 Lightning Bolt", "4x Bolt (2XM) 117 *F*",
// section headings like "Sideboard" or "Commander (1)", comments.

export interface DecklistLine {
  cardName: string;
  quantity: number;
  section: "mainboard" | "sideboard" | "commander" | "companion";
  /** False when the line had no count, so it may be a stray heading or note. */
  counted: boolean;
}

const HEADINGS: Record<string, DecklistLine["section"] | "maybe"> = {
  main: "mainboard",
  mainboard: "mainboard",
  maindeck: "mainboard",
  deck: "mainboard",
  sideboard: "sideboard",
  sb: "sideboard",
  commander: "commander",
  commanders: "commander",
  companion: "companion",
  maybeboard: "maybe",
  maybe: "maybe",
  considering: "maybe",
};

// A whole line that's a heading: "Sideboard", "SIDEBOARD:", "Commander (1)", "// Sideboard"
const HEADING = /^(?:\/\/\s*)?([a-z]+)\s*:?\s*(?:\(\d+\))?$/i;
// "4 Name", "4x Name", "Name", with an optional "(SET) 123", "[SET]" and "*F*"
const CARD = /^(?:(\d+)\s*[xX]?\s+)?(.+?)(?:\s+[([][A-Za-z0-9]{2,6}[)\]](?:\s+[\w★-]+)?)?(?:\s+\*[A-Z]+\*)?$/;

export function parseDecklistText(text: string): DecklistLine[] {
  const out: DecklistLine[] = [];
  let section: DecklistLine["section"] | "maybe" = "mainboard";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(HEADING);
    if (heading && HEADINGS[heading[1].toLowerCase()]) {
      section = HEADINGS[heading[1].toLowerCase()];
      continue;
    }
    if (line.startsWith("//") || line.startsWith("#")) continue;
    if (section === "maybe") continue;
    const m = line.match(CARD);
    const name = m?.[2]?.trim();
    if (!m || !name || name.length < 2) continue;
    const quantity = m[1] ? parseInt(m[1], 10) : 1;
    if (!(quantity > 0)) continue;
    out.push({ cardName: name, quantity: Math.min(quantity, 99), section, counted: !!m[1] });
  }
  return out;
}
