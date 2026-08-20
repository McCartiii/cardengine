"use client";

import { useState } from "react";
import type { ParsedCard } from "@/lib/deckAgentStream";

const IMPORTANCE_STYLES: Record<ParsedCard["importance"], string> = {
  critical: "bg-gradient-to-r from-rose-500/20 to-red-500/20 text-rose-200 border-rose-400/40",
  high: "bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-200 border-amber-400/40",
  flex: "bg-slate-700/50 text-slate-300 border-slate-500/40",
};

const IMPORTANCE_LABELS: Record<ParsedCard["importance"], string> = {
  critical: "Critical",
  high: "High Impact",
  flex: "Flex Slot",
};

interface CardPanelProps {
  card: ParsedCard;
  priceUsd?: number | null;
  imageUri?: string | null;
  onAdd?: (cardName: string) => void;
  added?: boolean;
}

export function CardPanel({ card, priceUsd, imageUri, onAdd, added }: CardPanelProps) {
  const [imgError, setImgError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const scryfallFallback = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image&version=normal`;
  const imgSrc = imgError ? scryfallFallback : (imageUri ?? scryfallFallback);

  return (
    <div className="group relative overflow-hidden flex gap-3 p-3 rounded-2xl bg-slate-900/75 border border-slate-700/60 hover:border-teal-400/45 transition-all duration-200 shadow-[0_10px_24px_rgba(0,0,0,0.25)]">
      <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.12),transparent_45%)]" />
      <div className="flex-shrink-0 w-16 rounded-xl overflow-hidden bg-slate-800 border border-slate-700/60">
        <img
          src={imgSrc}
          alt={card.name}
          className="w-full object-cover"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      </div>

      <div className="relative flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-100 truncate tracking-tight">{card.name}</h4>
            {priceUsd != null && (
              <span className="text-xs text-teal-200/90 font-medium">${priceUsd.toFixed(2)}</span>
            )}
          </div>
          <span
            className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${IMPORTANCE_STYLES[card.importance]}`}
          >
            {IMPORTANCE_LABELS[card.importance]}
          </span>
        </div>

        <p className="mt-1.5 text-xs text-slate-300/95 leading-relaxed line-clamp-2">
          {card.reason}
        </p>

        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-xs text-cyan-300 hover:text-cyan-200 transition-colors"
        >
          {expanded ? "▲ Hide tip" : "▼ How to play"}
        </button>

        {expanded && (
          <p className="mt-1.5 text-xs text-slate-300/80 leading-relaxed italic">
            {card.gameplay}
          </p>
        )}

        <button
          onClick={() => onAdd?.(card.name)}
          disabled={added}
          className={[
            "mt-2 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all duration-150 border",
            added
              ? "bg-teal-600/25 text-teal-200 border-teal-500/30 cursor-default"
              : "bg-gradient-to-r from-teal-600/25 to-cyan-600/25 text-teal-100 hover:from-teal-500/35 hover:to-cyan-500/35 border-teal-500/40",
          ].join(" ")}
        >
          {added ? "✓ Added" : "+ Add to Deck"}
        </button>
      </div>
    </div>
  );
}
