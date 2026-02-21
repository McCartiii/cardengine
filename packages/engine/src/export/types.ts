import type { Deck } from "../rules/types.js";

export interface ExportBlob {
  kind: "collection" | "deck" | "unknown";
  version: number;
  createdAt: string;
  data: unknown;
}

export interface DecklistImportResult {
  deck: Deck;
  warnings: string[];
}
