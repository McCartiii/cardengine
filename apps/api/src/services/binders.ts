// A user's binders: the main collection (implicit, id "main") plus any they
// made. Wishlists hold cards someone wants, so they don't count as owned.
import { prisma } from "../db.js";
import { MAIN_BINDER, loadCollectionHoldings, type HoldingQuery } from "./collectionHoldings.js";

export const BINDER_KINDS = ["trade", "wishlist", "custom"] as const;
export type BinderKind = (typeof BINDER_KINDS)[number] | "collection";
export const MAX_BINDERS = 20;

export interface BinderInfo {
  id: string;
  name: string;
  kind: BinderKind;
}

export const MAIN_BINDER_INFO: BinderInfo = { id: MAIN_BINDER, name: "Collection", kind: "collection" };

export async function listBinders(userId: string): Promise<BinderInfo[]> {
  const rows = await prisma.binder.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  return [MAIN_BINDER_INFO, ...rows.map((b) => ({ id: b.id, name: b.name, kind: b.kind as BinderKind }))];
}

/** Binders whose cards the user owns (everything but wishlists). */
export function ownedIds(binders: BinderInfo[]): Set<string> {
  return new Set(binders.filter((b) => b.kind !== "wishlist").map((b) => b.id));
}

/**
 * Which binders a `binder` query means: one binder, "owned" (all but
 * wishlists) or "all". Null when it names a binder that isn't theirs.
 */
export function selectBinders(binders: BinderInfo[], binder: string): Set<string> | null {
  if (binder === "all") return new Set(binders.map((b) => b.id));
  if (binder === "owned") return ownedIds(binders);
  return binders.some((b) => b.id === binder) ? new Set([binder]) : null;
}

/** Everything the user owns across binders (wishlists left out), e.g. for the AI. */
export async function loadOwnedHoldings(userId: string, query: HoldingQuery = { market: "tcgplayer", kind: "auto", currency: "USD" }) {
  return loadCollectionHoldings(userId, query, ownedIds(await listBinders(userId)));
}
