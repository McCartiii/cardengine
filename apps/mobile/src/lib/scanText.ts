// Reading a card from OCR text: the name from the title line, and on modern
// cards the set code, collector number and foil star from the small print
// in the bottom-left corner ("M 0386" over "MSH • EN", or "123/280 R").
import { SCANNER } from "./constants";

const TYPE_WORDS = /^(Instant|Sorcery|Artifact|Enchantment|Land|Creature|Planeswalker|Battle|Legendary|Tribal|Kindred)\b/i;
const LANGS = "EN|ES|FR|DE|IT|PT|JA|JP|KO|RU|ZHS|ZHT|CS|CT|PH";

/**
 * The most likely card name: the first line that reads like a title.
 * OCR often glues the mana cost onto the end of the name, so trailing
 * symbol noise is trimmed off first.
 */
export function extractCardName(rawText: string): string | null {
  const lines = rawText
    .split("\n")
    .map((l) =>
      l
        .trim()
        .replace(/(\s*\{[^}]*\})+$/, "")
        .replace(/[\s{}0-9()®©•*★]+$/, "")
        .trim()
    )
    .filter(Boolean);

  for (const line of lines) {
    if (line.length < SCANNER.MIN_NAME_LEN || line.length > SCANNER.MAX_NAME_LEN) continue;
    if (!/^[A-Za-z][A-Za-z ',\-]*$/.test(line)) continue;
    if (TYPE_WORDS.test(line)) continue;
    // A title has at least one word of three or more letters.
    if (!/[A-Za-z]{3,}/.test(line)) continue;
    return line;
  }
  return null;
}

export interface PrintInfo {
  setCode: string | null;
  collectorNumber: string | null;
  /** Foil printings mark the set line with a star instead of a dot. */
  foil: boolean;
}

/** Set code, collector number and foil mark from a card's small print, when legible. */
export function extractPrintInfo(rawText: string): PrintInfo {
  const text = rawText.replace(/\r/g, "");
  let setCode: string | null = null;
  let foil = false;

  // "MSH • EN", "MSH ★ EN", "MSH * EN", "MSH . EN" or plain "MSH EN".
  const setMatch = text.match(new RegExp(`\\b([A-Z0-9]{3,5})\\s*([•·★☆*.\\-]?)\\s*(?:${LANGS})\\b`));
  if (setMatch && /[A-Z]/.test(setMatch[1])) {
    setCode = setMatch[1];
    foil = setMatch[2] === "★" || setMatch[2] === "☆" || setMatch[2] === "*";
  }

  // "0386/0400" on 2020–2022 cards; a lone power/toughness like "4/4" is too short to match.
  const slash = text.match(/\b(\d{3,4})\s*\/\s*\d{3,4}\b/);
  // "M 0386" on 2023+ cards: a rarity letter, then the number.
  const rarityLetter = text.match(/(?:^|\s)[CURMLST]\s+(\d{3,4})\b/m);
  const raw = slash?.[1] ?? rarityLetter?.[1] ?? null;

  return { setCode, collectorNumber: raw ? raw.replace(/^0+(?=\d)/, "") : null, foil };
}
