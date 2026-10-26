// Card search filters: colors, type, rarity and set narrow the catalog query;
// price bounds apply after prices are joined.
import { z } from "zod";

export const RARITIES = ["common", "uncommon", "rare", "mythic"] as const;

export const searchFilterSchema = z.object({
  q: z.string().trim().max(200).default(""),
  /** Card colors, e.g. "WU" (has white and blue) or "C" (colorless). */
  colors: z
    .string()
    .regex(/^[WUBRGC]{1,6}$/i)
    .transform((s) => s.toUpperCase())
    .optional(),
  /** A word in the type line, e.g. "creature" or "dragon". */
  type: z.string().trim().min(2).max(40).optional(),
  /** Comma-separated rarities. */
  rarity: z
    .string()
    .transform((s) => s.split(",").map((r) => r.trim().toLowerCase()).filter(Boolean))
    .pipe(z.array(z.enum(RARITIES)).min(1))
    .optional(),
  set: z.string().trim().min(2).max(10).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
});

export type SearchFilters = z.infer<typeof searchFilterSchema>;

export const hasPriceBounds = (f: SearchFilters) => f.minPrice != null || f.maxPrice != null;

/** True when there's something to search for. */
export const hasCriteria = (f: SearchFilters) =>
  f.q.length > 0 || !!f.colors || !!f.type || !!f.rarity?.length || !!f.set || hasPriceBounds(f);

/** The Prisma `where` for a cardVariant search. */
export function searchWhere(f: SearchFilters, game: string) {
  const and: Record<string, unknown>[] = [];
  if (f.q) and.push({ name: { contains: f.q, mode: "insensitive" } });
  if (f.type) and.push({ typeLine: { contains: f.type, mode: "insensitive" } });
  if (f.rarity?.length) and.push({ rarity: { in: f.rarity } });
  if (f.set) and.push({ setId: { equals: f.set, mode: "insensitive" } });
  if (f.colors) {
    const colored = [...new Set(f.colors.replace(/C/g, ""))];
    if (colored.length) for (const c of colored) and.push({ colors: { array_contains: [c] } });
    else and.push({ colors: { equals: [] } });
  }
  return { game, AND: and };
}

/** Whether a price passes the bounds. Cards without a price only pass when there are none. */
export function inPriceRange(price: number | null | undefined, f: SearchFilters): boolean {
  if (!hasPriceBounds(f)) return true;
  if (price == null || price <= 0) return false;
  if (f.minPrice != null && price < f.minPrice) return false;
  if (f.maxPrice != null && price > f.maxPrice) return false;
  return true;
}
