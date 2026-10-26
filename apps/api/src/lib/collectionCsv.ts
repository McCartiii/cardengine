// Reads collection exports from other apps (Moxfield, ManaBox, TCGplayer,
// Deckbox, Archidekt, Dragon Shield, ours) and plain card lists, and writes
// our own CSV. Pure: matching rows to cards happens in collectionImport.

export type Finish = "nonfoil" | "foil" | "etched";

export interface ImportEntry {
  /** 1-based line in the file, for "line 12: couldn't find …". */
  line: number;
  name: string;
  quantity: number;
  finish: Finish;
  setCode?: string;
  collectorNumber?: string;
  scryfallId?: string;
}

export interface ParsedImport {
  format: string;
  entries: ImportEntry[];
  /** Lines that had something on them but no card we could read. */
  skipped: number;
}

/** Splits CSV text into rows, handling quotes, escaped quotes and newlines in quotes. */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

// Header names each app uses, best first.
const ALIASES = {
  quantity: ["count", "quantity", "qty", "amount", "copies"],
  name: ["simplename", "cardname", "name", "card"],
  setCode: ["setcode", "editioncode", "edition", "set", "expansioncode"],
  collectorNumber: ["collectornumber", "cardnumber", "number", "cn", "collector"],
  finish: ["finish", "foil", "printing"],
  scryfallId: ["scryfallid", "scryfalluuid"],
} as const;

type Column = keyof typeof ALIASES;

function findColumns(header: string[]): Partial<Record<Column, number>> {
  const keys = header.map(norm);
  const out: Partial<Record<Column, number>> = {};
  for (const col of Object.keys(ALIASES) as Column[]) {
    for (const alias of ALIASES[col]) {
      const i = keys.indexOf(alias);
      if (i >= 0) {
        out[col] = i;
        break;
      }
    }
  }
  return out;
}

function detectFormat(header: string[]): string {
  const k = new Set(header.map(norm));
  if (k.has("binder") && k.has("scryfallid")) return "CardEngine";
  if (k.has("manaboxid")) return "ManaBox";
  if (k.has("foldername")) return "Dragon Shield";
  if (k.has("simplename") || k.has("productid") || k.has("tcgplayerid")) return "TCGplayer";
  if (k.has("tradelistcount") && k.has("edition") && !k.has("cardnumber")) return "Moxfield";
  if (k.has("tradelistcount")) return "Deckbox";
  if (k.has("editioncode") || k.has("archidektid")) return "Archidekt";
  return "CSV";
}

export function parseFinish(v: string | undefined): Finish {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return "nonfoil";
  if (s.includes("etched")) return "etched";
  if (/non|normal|regular|^no$|^false$|^0$/.test(s)) return "nonfoil";
  if (s.includes("foil") || s === "yes" || s === "true" || s === "1" || s === "y") return "foil";
  return "nonfoil";
}

/** Set codes are short; some apps put the full set name in "Edition", which we can't use. */
const asSetCode = (v: string | undefined) => {
  const s = (v ?? "").trim().toLowerCase();
  return /^[a-z0-9]{2,6}$/.test(s) ? s : undefined;
};

const asScryfallId = (v: string | undefined) => {
  const s = (v ?? "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) ? s : undefined;
};

// "4 Lightning Bolt", "4x Lightning Bolt (MH3) 123 *F*", "Sol Ring"
const LIST_LINE = /^(?:(\d+)\s*x?\s+)?(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)(?:\s+([\w★-]+))?)?(\s+\*(?:F|E)\*)?\s*$/;

function parseList(lines: string[]): ParsedImport {
  const entries: ImportEntry[] = [];
  let skipped = 0;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || /^(\/\/|#)/.test(line) || /^(deck|sideboard|commander|maybeboard|companion)\s*:?$/i.test(line)) return;
    const m = line.match(LIST_LINE);
    if (!m || !m[2] || m[2].length < 2) {
      skipped++;
      return;
    }
    entries.push({
      line: i + 1,
      name: m[2].trim(),
      quantity: Math.max(1, Math.min(9999, parseInt(m[1] ?? "1", 10))),
      finish: m[5]?.includes("E") ? "etched" : m[5] ? "foil" : "nonfoil",
      setCode: asSetCode(m[3]),
      collectorNumber: m[4],
    });
  });
  return { format: "Card list", entries, skipped };
}

/** Reads a file's text: a CSV export with a header row, or a plain card list. */
export function parseCollectionFile(text: string): ParsedImport {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/);
  // Dragon Shield starts with an Excel hint line.
  const start = /^"?sep=.?"?$/i.test(lines[0]?.trim() ?? "") ? 1 : 0;
  const first = lines[start] ?? "";
  const delimiter = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = parseCsv(lines.slice(start).join("\n"), delimiter);
  const header = rows[0] ?? [];
  const cols = findColumns(header);
  if (cols.name == null || header.length < 2) return parseList(lines);

  const entries: ImportEntry[] = [];
  let skipped = 0;
  const cell = (row: string[], c: Column) => (cols[c] != null ? row[cols[c]!]?.trim() : undefined);
  rows.slice(1).forEach((row, i) => {
    if (row.every((f) => !f.trim())) return;
    const name = cell(row, "name");
    const qty = parseInt(cell(row, "quantity") ?? "1", 10);
    if (!name || (cols.quantity != null && !(qty > 0))) {
      skipped++;
      return;
    }
    entries.push({
      line: start + i + 2,
      name,
      quantity: Math.min(9999, cols.quantity != null ? qty : 1),
      finish: parseFinish(cell(row, "finish")),
      setCode: asSetCode(cell(row, "setCode")),
      collectorNumber: cell(row, "collectorNumber") || undefined,
      scryfallId: asScryfallId(cell(row, "scryfallId")),
    });
  });
  return { format: detectFormat(header), entries, skipped };
}

// ── Export ────────────────────────────────────────────────────────────────────

export interface ExportRow {
  quantity: number;
  name: string;
  setId: string | null;
  collectorNumber: string | null;
  finish: Finish;
  variantId: string;
  price: number | null;
  binder: string;
}

const csvField = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Our CSV. The first columns match Moxfield's, so other apps can read it too. */
export function collectionToCsv(rows: ExportRow[]): string {
  const header = ["Count", "Name", "Edition", "Collector Number", "Foil", "Scryfall ID", "Price (USD)", "Binder"];
  const lines = rows.map((r) =>
    [
      r.quantity,
      r.name,
      r.setId ?? "",
      r.collectorNumber ?? "",
      r.finish === "nonfoil" ? "" : r.finish,
      r.variantId.startsWith("scryfall:") ? r.variantId.slice(9).replace(/-foil$/, "") : "",
      r.price != null ? r.price.toFixed(2) : "",
      r.binder,
    ]
      .map(csvField)
      .join(",")
  );
  return [header.join(","), ...lines].join("\r\n") + "\r\n";
}
