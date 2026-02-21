"use client";

import { useState, useEffect, useRef } from "react";
import { api, type CardVariant } from "@/lib/api";
import Image from "next/image";
import Link from "next/link";
import { clsx } from "clsx";

const RARITY_COLOR: Record<string, string> = {
  common: "#9CA3AF",
  uncommon: "#C0C0C0",
  rare: "#F59E0B",
  mythic: "#EF4444",
  special: "#A855F7",
};

function CardGrid({ cards }: { cards: CardVariant[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {cards.map((card) => (
        <Link key={card.variantId} href={`/cards/${encodeURIComponent(card.variantId)}`} className="group">
          <div className="rounded-xl overflow-hidden bg-surface hover:ring-2 hover:ring-accent/60 transition-all">
            {card.imageUri ? (
              <Image
                src={card.imageUri}
                alt={card.name}
                width={244}
                height={340}
                className="w-full object-cover"
                unoptimized
              />
            ) : (
              <div className="aspect-[244/340] bg-surface-2 flex flex-col items-center justify-center text-muted gap-2 p-3 text-center">
                <span className="text-2xl">🃏</span>
                <span className="text-xs font-medium">{card.name}</span>
              </div>
            )}
            <div className="px-2 py-1.5 flex items-center justify-between gap-1">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: RARITY_COLOR[card.rarity ?? ""] ?? "#6B7280" }}
              />
              <span className="text-xs text-muted truncate flex-1">{card.name}</span>
              <span className="text-xs font-semibold text-white shrink-0">
                {card.priceUsd != null ? `$${card.priceUsd.toFixed(2)}` : "—"}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function BrowsePage() {
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<CardVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 2) { setCards([]); setSearched(false); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { cards: results } = await api.search(query.trim(), 60);
        setCards(results);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-1">Browse Cards</h1>
        <p className="text-muted">Search across all Magic: The Gathering cards</p>
      </div>

      {/* Search */}
      <div className="relative mb-8">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cards by name…"
          className="w-full max-w-xl bg-surface border border-border rounded-xl pl-11 pr-4 py-3 text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/60 text-sm"
          autoFocus
        />
        {loading && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted text-xs animate-pulse">Searching…</span>
        )}
      </div>

      {!searched && !loading ? (
        <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
          <span className="text-6xl">✨</span>
          <h2 className="text-2xl font-bold">Start searching</h2>
          <p className="text-muted max-w-sm">Type a card name to browse our full database with live prices</p>
        </div>
      ) : cards.length === 0 && !loading ? (
        <div className="py-24 text-center text-muted">No results for "{query}"</div>
      ) : (
        <CardGrid cards={cards} />
      )}
    </div>
  );
}
