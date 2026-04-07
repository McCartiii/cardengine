"use client";

import { useState } from "react";
import type { ParsedCard } from "@/lib/deckAgentStream";

const IMPORTANCE_STYLES: Record<ParsedCard["importance"], string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/40",
  high: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  flex: "bg-slate-600/40 text-slate-400 border-slate-500/40",
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
    <div className="group relative flex gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:border-teal-500/40 transition-all duration-200">
      <div className="flex-shrink-0 w-16 rounded-lg overflow-hidden bg-slate-700/50">
        <img
          src={imgSrc}
          alt={card.name}
          className="w-full object-cover"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-100 truncate">{card.name}</h4>
            {priceUsd != null && (
              <span className="text-xs text-slate-400">${priceUsd.toFixed(2)}</span>
            )}
          </div>
          <span
            className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${IMPORTANCE_STYLES[card.importance]}`}
          >
            {IMPORTANCE_LABELS[card.importance]}
          </span>
        </div>

        <p className="mt-1.5 text-xs text-slate-300 leading-relaxed line-clamp-2">
          {card.reason}
        </p>

        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-xs text-teal-400 hover:text-teal-300 transition-colors"
        >
          {expanded ? "▲ Hide tip" : "▼ How to play"}
        </button>

        {expanded && (
          <p className="mt-1.5 text-xs text-slate-400 leading-relaxed italic">
            {card.gameplay}
          </p>
        )}

        <button
          onClick={() => onAdd?.(card.name)}
          disabled={added}
          className={[
            "mt-2 text-xs px-3 py-1 rounded-lg font-medium transition-all duration-150",
            added
              ? "bg-teal-600/30 text-teal-400 cursor-default"
              : "bg-teal-600/20 text-teal-300 hover:bg-teal-600/40 border border-teal-600/40",
          ].join(" ")}
        >
          {added ? "✓ Added" : "+ Add to Deck"}
        </button>
      </div>
    </div>
  );
}
