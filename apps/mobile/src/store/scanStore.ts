import { create } from "zustand";
import type { ScanCandidate } from "../lib/api";

export interface PendingScan {
  /** Unique key for this pending scan session entry */
  key: string;
  candidate: ScanCandidate;
  quantity: number;
  /** Whether this has been committed to the server yet */
  added: boolean;
  addedAt?: number;
}

interface ScanState {
  pending: PendingScan[];
  isScanning: boolean;
  detectedName: string | null;
  detectedPrice: string | null;

  addPending: (candidate: ScanCandidate) => void;
  incrementQty: (key: string) => void;
  decrementQty: (key: string) => void;
  markAdded: (key: string) => void;
  clearAdded: () => void;
  setDetectedName: (name: string | null) => void;
  setDetectedPrice: (price: string | null) => void;
  setScanning: (v: boolean) => void;
  reset: () => void;
}

export const useScanStore = create<ScanState>((set, get) => ({
  pending: [],
  isScanning: true,
  detectedName: null,
  detectedPrice: null,

  addPending(candidate) {
    const existing = get().pending.find(
      (p) => p.candidate.variantId === candidate.variantId && !p.added
    );
    if (existing) {
      // Same card already pending — just bump quantity
      set((s) => ({
        pending: s.pending.map((p) =>
          p.key === existing.key ? { ...p, quantity: p.quantity + 1 } : p
        ),
      }));
    } else {
      const key = `${candidate.variantId}-${Date.now()}`;
      set((s) => ({
        pending: [{ key, candidate, quantity: 1, added: false }, ...s.pending],
      }));
    }
  },

  incrementQty(key) {
    set((s) => ({
      pending: s.pending.map((p) =>
        p.key === key ? { ...p, quantity: p.quantity + 1 } : p
      ),
    }));
  },

  decrementQty(key) {
    set((s) => ({
      pending: s.pending
        .map((p) => (p.key === key ? { ...p, quantity: p.quantity - 1 } : p))
        .filter((p) => p.quantity > 0),
    }));
  },

  markAdded(key) {
    set((s) => ({
      pending: s.pending.map((p) =>
        p.key === key ? { ...p, added: true, addedAt: Date.now() } : p
      ),
    }));
  },

  clearAdded() {
    set((s) => ({ pending: s.pending.filter((p) => !p.added) }));
  },

  setDetectedName(name) {
    set({ detectedName: name });
  },

  setDetectedPrice(price) {
    set({ detectedPrice: price });
  },

  setScanning(v) {
    set({ isScanning: v });
  },

  reset() {
    set({ pending: [], detectedName: null, detectedPrice: null, isScanning: true });
  },
}));
