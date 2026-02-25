"use client";

import { useState, useEffect, useRef } from "react";
import { api, type CardVariant } from "@/lib/api";
import Image from "next/image";
import Link from "next/link";

const RARITY_COLOR: Record<string, string> = {
  common:   "#9ca3af",
  uncommon: "#a8d8b9",
  rare:     "#f59e0b",
  mythic:   "#f97316",
  special:  "#a855f7",
};

const RARITY_GLOW: Record<string, string> = {
  common:   "rgba(156,163,175,0.2)",
  uncommon: "rgba(168,216,185,0.2)",
  rare:     "rgba(245,158,11,0.35)",
  mythic:   "rgba(249,115,22,0.4)",
  special:  "rgba(168,85,247,0.4)",
};

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#110d1f", border: "1px solid #2a1f4a" }}>
      <div className="skeleton aspect-[244/340] w-full" />
      <div className="px-3 py-2 flex items-center gap-2">
        <div className="skeleton w-2.5 h-2.5 rounded-full shrink-0" />
        <div className="skeleton h-3 flex-1 rounded" />
        <div className="skeleton h-3 w-10 rounded" />
      </div>
    </div>
  );
}

function CardGrid({ cards }: { cards: CardVariant[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {cards.map((card, i) => (
        <Link
          key={card.variantId}
          href={`/cards/${encodeURIComponent(card.variantId)}`}
          className="group animate-enter"
          style={{ animationDelay: `${Math.min(i * 35, 600)}ms` }}
        >
          <div
            className="rounded-2xl overflow-hidden transition-all duration-200 group-hover:scale-[1.03]"
            style={{ background: "#110d1f", border: "1px solid #2a1f4a", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}
            onMouseEnter={(e) => {
              const col = card.rarity ?? "";
              (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 28px ${RARITY_GLOW[col] ?? "rgba(139,92,246,0.25)"}, 0 4px 20px rgba(0,0,0,0.5)`;
              (e.currentTarget as HTMLDivElement).style.borderColor = (RARITY_COLOR[col] ?? "#8b5cf6") + "55";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.4)";
              (e.currentTarget as HTMLDivElement).style.borderColor = "#2a1f4a";
            }}
          >
            {card.imageUri ? (
              <Image src={card.imageUri} alt={card.name} width={244} height={340} className="w-full object-cover" unoptimized />
            ) : (
              <div className="aspect-[244/340] flex flex-col items-center justify-center gap-2 p-3 text-center" style={{ background: "#1a1430" }}>
                <span className="text-3xl opacity-30">🃏</span>
                <span className="text-xs font-medium text-muted">{card.name}</span>
              </div>
            )}
            <div className="px-3 py-2 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: RARITY_COLOR[card.rarity ?? ""] ?? "#6b7280" }} />
              <span className="text-xs text-muted truncate flex-1">{card.name}</span>
              {card.priceUsd != null && (
                <span className="text-xs font-bold text-cyan shrink-0">${card.priceUsd.toFixed(2)}</span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function BrowsePage() {
  const [query, setQuery]       = useState("");
  const [cards, setCards]       = useState<CardVariant[]>([]);
  const [loading, setLoading]   = useState(false);
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
      {/* Hero */}
      <div className="mb-10">
        <h1 className="text-4xl font-black mb-2 leading-tight">
          Browse <span className="gradient-text">Every Card</span>
        </h1>
        <p className="text-sm" style={{ color: "#7c6f9a" }}>Search Magic: The Gathering with live pricing from TCGplayer & Cardmarket</p>
      </div>

      {/* Search bar */}
      <div className="relative mb-10 max-w-2xl">
        <div
          className="flex items-center gap-3 px-5 py-3.5 rounded-2xl transition-all duration-300"
          style={{
            background: "#110d1f",
            border: `1px solid ${query ? "rgba(139,92,246,0.5)" : "#2a1f4a"}`,
            boxShadow: query ? "0 0 0 3px rgba(139,92,246,0.12), 0 0 24px rgba(139,92,246,0.06)" : "none",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c6f9a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cards by name…"
            className="flex-1 bg-transparent text-white placeholder:text-muted/60 focus:outline-none text-sm"
            autoFocus
          />
          {loading && <span className="text-xs text-muted/60 shrink-0 animate-pulse">Searching…</span>}
          {query && !loading && (
            <button onClick={() => { setQuery(""); setCards([]); setSearched(false); }} className="text-muted hover:text-white transition-colors shrink-0 text-xl leading-none">×</button>
          )}
        </div>
      </div>

      {/* Skeleton grid */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Empty/start state */}
      {!loading && !searched && (
        <div className="flex flex-col items-center justify-center py-36 gap-6 text-center animate-enter">
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl"
            style={{ background: "linear-gradient(135deg, #2d1b69 0%, #0e4f6e 100%)", boxShadow: "0 0 50px rgba(139,92,246,0.3)" }}
          >
            ✦
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Find any card</h2>
            <p className="text-sm max-w-sm" style={{ color: "#7c6f9a" }}>
              Type a name to search our full database with real-time prices
            </p>
          </div>
        </div>
      )}

      {/* No results */}
      {!loading && searched && cards.length === 0 && (
        <div className="py-24 text-center animate-enter">
          <p className="text-5xl mb-4 opacity-30">🔍</p>
          <p className="text-white font-bold text-lg mb-1">No results for &ldquo;{query}&rdquo;</p>
          <p className="text-sm" style={{ color: "#7c6f9a" }}>Try a different spelling or card name</p>
        </div>
      )}

      {/* Results */}
      {!loading && cards.length > 0 && (
        <>
          <p className="text-xs font-medium uppercase tracking-wider mb-4" style={{ color: "#7c6f9a" }}>
            {cards.length} result{cards.length !== 1 ? "s" : ""}
          </p>
          <CardGrid cards={cards} />
        </>
      )}
    </div>
  );
}
