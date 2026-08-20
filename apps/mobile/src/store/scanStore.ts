import { create } from "zustand";
import type { ScanCandidate } from "../lib/api";
import { commitScanToCollection } from "../lib/scanCommit";

export interface PendingScan {
  key: string;
  candidate: ScanCandidate;
  quantity: number;
  matchMethod: "hash" | "ocr" | "api";
  added: boolean;
  addedAt?: number;
}

interface ScanState {
  pending: PendingScan[];
  isScanning: boolean;
  autoAddToCollection: boolean;
  hashIndexReady: boolean;
  detectedName: string | null;
  detectedPrice: string | null;
  lastMatchMethod: "hash" | "ocr" | null;
  lastAddedName: string | null;
  lastAddedAt: number | null;

  addPending: (candidate: ScanCandidate, matchMethod?: "hash" | "ocr" | "api") => Promise<void>;
  incrementQty: (key: string) => void;
  decrementQty: (key: string) => void;
  markAdded: (key: string) => void;
  clearAdded: () => void;
  setDetectedName: (name: string | null) => void;
  setDetectedPrice: (price: string | null) => void;
  setScanning: (v: boolean) => void;
  setHashIndexReady: (v: boolean) => void;
  setAutoAddToCollection: (v: boolean) => void;
  reset: () => void;
}

export const useScanStore = create<ScanState>((set, get) => ({
  pending: [],
  isScanning: true,
  autoAddToCollection: true,
  hashIndexReady: false,
  detectedName: null,
  detectedPrice: null,
  lastMatchMethod: null,
  lastAddedName: null,
  lastAddedAt: null,

  async addPending(candidate, matchMethod = "api") {
    const existing = get().pending.find(
      (p) => p.candidate.variantId === candidate.variantId && !p.added
    );

    let key: string;

    if (existing) {
      key = existing.key;
      set((s) => ({
        pending: s.pending.map((p) =>
          p.key === existing.key ? { ...p, quantity: p.quantity + 1 } : p
        ),
        lastMatchMethod: matchMethod === "api" ? s.lastMatchMethod : matchMethod,
      }));
    } else {
      key = `${candidate.variantId}-${Date.now()}`;
      set((s) => ({
        pending: [
          {
            key,
            candidate,
            quantity: 1,
            matchMethod,
            added: false,
          },
          ...s.pending,
        ],
        lastMatchMethod: matchMethod === "api" ? s.lastMatchMethod : matchMethod,
      }));
    }

    if (get().autoAddToCollection) {
      try {
        await commitScanToCollection(candidate.variantId, 1);
        get().markAdded(key);
      } catch {
        // Manual add via tray still available
      }
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
    const entry = get().pending.find((p) => p.key === key);
    set((s) => ({
      pending: s.pending.map((p) =>
        p.key === key ? { ...p, added: true, addedAt: Date.now() } : p
      ),
      lastAddedName: entry?.candidate.name ?? s.lastAddedName,
      lastAddedAt: Date.now(),
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

  setHashIndexReady(v) {
    set({ hashIndexReady: v });
  },

  setAutoAddToCollection(v) {
    set({ autoAddToCollection: v });
  },

  reset() {
    set({
      pending: [],
      detectedName: null,
      detectedPrice: null,
      lastMatchMethod: null,
      isScanning: true,
    });
  },
}));
