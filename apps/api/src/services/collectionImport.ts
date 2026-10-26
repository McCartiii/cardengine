// Matches imported rows to cards in the catalog: by Scryfall ID, then set and
// collector number, then name (in the given set when there is one).
import { prisma } from "../db.js";
import type { Finish, ImportEntry } from "../lib/collectionCsv.js";

export interface MatchedCard {
  variantId: string;
  name: string;
  imageUri: string | null;
  finish: Finish;
  quantity: number;
}

export interface ImportMatch {
  matched: MatchedCard[];
  unmatched: ImportEntry[];
}

type Variant = { variantId: string; name: string; setId: string | null; collectorNumber: string | null; imageUri: string | null };

const CHUNK = 500;
const chunks = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK));
const isFoilId = (id: string) => id.endsWith("-foil");
const lower = (s: string) => s.trim().toLowerCase();
const select = { variantId: true, name: true, setId: true, collectorNumber: true, imageUri: true } as const;

/** The plain printing over its "-foil" twin; finish is tracked separately. */
function better(a: Variant | undefined, b: Variant): Variant {
  if (!a) return b;
  return isFoilId(a.variantId) && !isFoilId(b.variantId) ? b : a;
}

export async function matchImport(entries: ImportEntry[], game = "mtg"): Promise<ImportMatch> {
  const byScryfall = new Map<string, Variant>();
  const bySetNumber = new Map<string, Variant>();
  const byName = new Map<string, Variant[]>();

  const sids = [...new Set(entries.flatMap((e) => (e.scryfallId ? [e.scryfallId] : [])))];
  for (const ids of chunks(sids)) {
    const rows = await prisma.cardVariant.findMany({
      where: { variantId: { in: ids.flatMap((id) => [`scryfall:${id}`, `scryfall:${id}-foil`]) } },
      select,
    });
    for (const v of rows) {
      const sid = v.variantId.slice(9).replace(/-foil$/, "");
      byScryfall.set(sid, better(byScryfall.get(sid), v));
    }
  }

  const printed = entries.filter((e) => !(e.scryfallId && byScryfall.has(e.scryfallId)) && e.setCode && e.collectorNumber);
  for (const part of chunks(printed)) {
    const rows = await prisma.cardVariant.findMany({
      where: { game, OR: part.map((e) => ({ setId: e.setCode!, collectorNumber: e.collectorNumber! })) },
      select,
    });
    for (const v of rows) {
      const k = `${lower(v.setId ?? "")}|${lower(v.collectorNumber ?? "")}`;
      bySetNumber.set(k, better(bySetNumber.get(k), v));
    }
  }

  const found = (e: ImportEntry) =>
    (e.scryfallId && byScryfall.get(e.scryfallId)) ||
    (e.setCode && e.collectorNumber && bySetNumber.get(`${e.setCode}|${lower(e.collectorNumber)}`)) ||
    undefined;

  // Everything else by name; two-faced cards may be listed by their front face.
  const names = [...new Set(entries.filter((e) => !found(e)).map((e) => e.name.trim()))];
  for (const part of chunks(names)) {
    const rows = await prisma.cardVariant.findMany({
      where: { game, OR: [{ name: { in: part, mode: "insensitive" } }, ...part.filter((n) => !n.includes("//")).map((n) => ({ name: { startsWith: `${n} // `, mode: "insensitive" as const } }))] },
      select,
    });
    for (const v of rows) {
      for (const key of new Set([lower(v.name), lower(v.name.split(" // ")[0])])) {
        byName.set(key, [...(byName.get(key) ?? []), v]);
      }
    }
  }

  const merged = new Map<string, MatchedCard>();
  const unmatched: ImportEntry[] = [];
  for (const e of entries) {
    let v = found(e);
    if (!v) {
      const options = byName.get(lower(e.name)) ?? [];
      const inSet = e.setCode ? options.filter((o) => lower(o.setId ?? "") === e.setCode) : [];
      v = (inSet.length ? inSet : options).reduce<Variant | undefined>((best, o) => better(best, o), undefined);
    }
    if (!v) {
      unmatched.push(e);
      continue;
    }
    const k = `${v.variantId}|${e.finish}`;
    const prev = merged.get(k);
    if (prev) prev.quantity += e.quantity;
    else merged.set(k, { variantId: v.variantId, name: v.name, imageUri: v.imageUri, finish: e.finish, quantity: e.quantity });
  }
  return { matched: [...merged.values()], unmatched };
}
