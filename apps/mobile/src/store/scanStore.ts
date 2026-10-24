import { create } from "zustand";
import type { ScanCandidate } from "../lib/api";

export type Finish = "nonfoil" | "foil";

export interface PendingScan {
  /** Unique key for this pending scan session entry */
  key: string;
  candidate: ScanCandidate;
  finish: Finish;
  quantity: number;
  /** Other printings and near matches, for "Wrong card?" */
  alternatives: ScanCandidate[];
  /** Whether this has been committed to the server yet */
  added: boolean;
  addedAt?: number;
}

/**
 * Where the scanner is: looking for a card, reading a name it has seen,
 * asking the server, matched (or not), shown in the status pill.
 */
export type ScanPhase = "searching" | "reading" | "identifying" | "matched" | "nomatch";

interface ScanState {
  pending: PendingScan[];
  phase: ScanPhase;
  detectedName: string | null;
  /** The entry the last match created or bumped, shown on the result card. */
  lastKey: string | null;

  addPending: (candidate: ScanCandidate, opts: { finish: Finish; alternatives: ScanCandidate[] }) => string;
  incrementQty: (key: string) => void;
  decrementQty: (key: string) => void;
  remove: (key: string) => void;
  replaceCandidate: (key: string, candidate: ScanCandidate) => void;
  setFinish: (key: string, finish: Finish) => void;
  /** Fills in prices and printings for an instant local match, unless the user has since picked another card. */
  enrich: (key: string, variantId: string, patch: Partial<ScanCandidate>, alternatives?: ScanCandidate[]) => void;
  markAdded: (keys: string[]) => void;
  clearAdded: () => void;
  setPhase: (phase: ScanPhase, detectedName?: string | null) => void;
  dismissResult: () => void;
  reset: () => void;
}

export const useScanStore = create<ScanState>((set, get) => ({
  pending: [],
  phase: "searching",
  detectedName: null,
  lastKey: null,

  addPending(candidate, { finish, alternatives }) {
    const existing = get().pending.find((p) => p.candidate.variantId === candidate.variantId && p.finish === finish && !p.added);
    if (existing) {
      // Same card and finish already pending: another copy.
      set((s) => ({
        lastKey: existing.key,
        pending: s.pending.map((p) => (p.key === existing.key ? { ...p, quantity: p.quantity + 1 } : p)),
      }));
      return existing.key;
    }
    const key = `${candidate.variantId}-${Date.now()}`;
    set((s) => ({ lastKey: key, pending: [{ key, candidate, finish, quantity: 1, alternatives, added: false }, ...s.pending] }));
    return key;
  },

  incrementQty(key) {
    set((s) => ({ pending: s.pending.map((p) => (p.key === key ? { ...p, quantity: p.quantity + 1 } : p)) }));
  },

  decrementQty(key) {
    set((s) => {
      const pending = s.pending.map((p) => (p.key === key ? { ...p, quantity: p.quantity - 1 } : p)).filter((p) => p.quantity > 0);
      return { pending, lastKey: pending.some((p) => p.key === s.lastKey) ? s.lastKey : null };
    });
  },

  remove(key) {
    set((s) => ({ pending: s.pending.filter((p) => p.key !== key), lastKey: s.lastKey === key ? null : s.lastKey }));
  },

  replaceCandidate(key, candidate) {
    set((s) => ({
      pending: s.pending.map((p) => {
        if (p.key !== key) return p;
        // Keep the old match in the list so the user can switch back.
        const alternatives = [p.candidate, ...p.alternatives.filter((a) => a.variantId !== candidate.variantId && a.variantId !== p.candidate.variantId)];
        return { ...p, candidate, alternatives };
      }),
    }));
  },

  enrich(key, variantId, patch, alternatives) {
    set((s) => ({
      pending: s.pending.map((p) => {
        if (p.key !== key || p.candidate.variantId !== variantId) return p;
        // The server may know the image and rarity; keep what we matched if it doesn't.
        const candidate = { ...p.candidate, ...patch, imageUri: patch.imageUri ?? p.candidate.imageUri, variantId, pricing: false };
        return { ...p, candidate, alternatives: alternatives?.length ? alternatives : p.alternatives };
      }),
    }));
  },

  setFinish(key, finish) {
    set((s) => ({ pending: s.pending.map((p) => (p.key === key ? { ...p, finish } : p)) }));
  },

  markAdded(keys) {
    const now = Date.now();
    set((s) => ({ pending: s.pending.map((p) => (keys.includes(p.key) ? { ...p, added: true, addedAt: now } : p)) }));
  },

  clearAdded() {
    set((s) => ({ pending: s.pending.filter((p) => !p.added), lastKey: null }));
  },

  setPhase(phase, detectedName) {
    set((s) => ({ phase, detectedName: detectedName === undefined ? s.detectedName : detectedName }));
  },

  dismissResult() {
    set({ lastKey: null });
  },

  reset() {
    set({ pending: [], phase: "searching", detectedName: null, lastKey: null });
  },
}));

/** USD price of a candidate in the given finish, if known. */
export function candidatePrice(candidate: ScanCandidate, finish: Finish): number | null {
  const kind = finish === "foil" ? "foil" : "market";
  return candidate.prices.find((p) => p.currency === "USD" && p.market === "tcgplayer" && p.kind === kind)?.amount
    ?? candidate.prices.find((p) => p.currency === "USD" && p.kind === kind)?.amount
    ?? null;
}
