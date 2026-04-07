"use client";

import { CardPanel } from "./CardPanel";
import type { ParsedCard } from "@/lib/deckAgentStream";

interface TierGroup {
  name: string;
  cards: ParsedCard[];
}

interface CardGalleryProps {
  tiers: TierGroup[];
  cardDetails: Map<string, { priceUsd?: number | null; imageUri?: string | null }>;
  onAddCard: (cardName: string) => void;
  addedCards: Set<string>;
}

const TIER_ACCENT: Record<string, string> = {
  "Win Conditions": "border-red-500/30 bg-red-500/5",
  "Core Engine": "border-amber-500/30 bg-amber-500/5",
  "Strong Includes": "border-teal-500/30 bg-teal-500/5",
  "Flex Slots": "border-slate-500/30 bg-slate-500/5",
  "Cuts": "border-rose-500/30 bg-rose-500/5",
};

export function CardGallery({ tiers, cardDetails, onAddCard, addedCards }: CardGalleryProps) {
  if (tiers.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      {tiers.map((tier) => (
        <div key={tier.name}>
          <div
            className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border ${TIER_ACCENT[tier.name] ?? "border-slate-600/30 bg-slate-700/10"}`}
          >
            <span className="text-sm font-bold text-slate-200">{tier.name}</span>
            <span className="text-xs text-slate-500">({tier.cards.length} cards)</span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {tier.cards.map((card) => {
              const details = cardDetails.get(card.name.toLowerCase());
              return (
                <CardPanel
                  key={card.name}
                  card={card}
                  priceUsd={details?.priceUsd}
                  imageUri={details?.imageUri}
                  onAdd={onAddCard}
                  added={addedCards.has(card.name)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
