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
  onApplyAll?: () => void;
  applyingAll?: boolean;
  addedCards: Set<string>;
  totalCards: number;
}

const TIER_ACCENT: Record<string, string> = {
  "Win Conditions": "border-rose-400/35 bg-gradient-to-r from-rose-500/10 to-red-500/5",
  "Core Engine": "border-amber-400/35 bg-gradient-to-r from-amber-500/10 to-orange-500/5",
  "Strong Includes": "border-teal-400/35 bg-gradient-to-r from-teal-500/10 to-cyan-500/5",
  "Flex Slots": "border-slate-500/35 bg-gradient-to-r from-slate-500/10 to-slate-700/10",
  "Cuts": "border-rose-500/35 bg-gradient-to-r from-rose-500/10 to-slate-700/10",
};

export function CardGallery({ tiers, cardDetails, onAddCard, onApplyAll, applyingAll, addedCards, totalCards }: CardGalleryProps) {
  if (tiers.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {onApplyAll && totalCards > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-2.5">
          <div>
            <p className="text-xs font-semibold text-teal-200">Ready to load into editor</p>
            <p className="text-[10px] text-teal-200/70">{totalCards} unique cards proposed</p>
          </div>
          <button
            type="button"
            onClick={onApplyAll}
            disabled={applyingAll}
            className="shrink-0 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-white transition-colors"
          >
            {applyingAll ? "Applying…" : "Apply full deck"}
          </button>
        </div>
      )}
      <div className="flex flex-col gap-6">
      {tiers.map((tier) => (
        <section key={tier.name} className="rounded-2xl border border-slate-700/50 bg-slate-900/55 p-3">
          <div
            className={`relative overflow-hidden flex items-center gap-2 mb-3 px-3 py-2 rounded-xl border ${TIER_ACCENT[tier.name] ?? "border-slate-600/30 bg-slate-700/10"}`}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            <span className="text-sm font-bold text-slate-100 tracking-tight">{tier.name}</span>
            <span className="text-xs text-slate-300/80 bg-slate-800/60 border border-slate-600/40 rounded-full px-2 py-0.5">
              {tier.cards.length} cards
            </span>
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
        </section>
      ))}
      </div>
    </div>
  );
}
