"use client";

import { useState, useEffect, useRef } from "react";
import { api, type CardVariant } from "@/lib/api";
import { HoloCard } from "@/components/HoloCard";
import Image from "next/image";
import Link from "next/link";

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#0d1220", border: "1px solid #1e2d45" }}>
      <div className="skeleton aspect-[244/340] w-full" />
      <div className="px-3 py-2.5 flex items-center gap-2">
        <div className="skeleton w-2 h-2 rounded-full shrink-0" />
        <div className="skeleton h-2.5 flex-1 rounded" />
        <div className="skeleton h-2.5 w-10 rounded" />
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
          style={{ animationDelay: `${Math.min(i * 30, 500)}ms` }}
        >
          <HoloCard rarity={card.rarity ?? "common"} className="rounded-2xl">
            <div style={{ background: "#0d1220", border: "1px solid #1e2d45", borderRadius: "1rem" }}>
              {card.imageUri ? (
                <Image
                  src={card.imageUri}
                  alt={card.name}
                  width={244}
                  height={340}
                  className="w-full object-cover rounded-t-2xl"
                  unoptimized
                />
              ) : (
                <div className="aspect-[244/340] flex flex-col items-center justify-center gap-2 p-3 text-center rounded-t-2xl" style={{ background: "#141b2d" }}>
                  <span className="text-3xl opacity-20">&#127183;</span>
                  <span className="text-xs font-medium" style={{ color: "#3d5068" }}>{card.name}</span>
                </div>
              )}
              <div className="px-3 py-2.5 flex items-center gap-2">
                <RarityDot rarity={card.rarity ?? ""} />
                <span className="text-xs truncate flex-1" style={{ color: "#8ca0b8" }}>{card.name}</span>
                {card.priceUsd != null && (
                  <span className="text-xs font-bold shrink-0" style={{ color: "#00d4ff" }}>${card.priceUsd.toFixed(2)}</span>
                )}
              </div>
            </div>
          </HoloCard>
        </Link>
      ))}
    </div>
  );
}

function RarityDot({ rarity }: { rarity: string }) {
  const colors: Record<string, string> = {
    common:   "#8ca0b8",
    uncommon: "#50c878",
    rare:     "#0096ff",
    mythic:   "#ff5000",
    special:  "#cc44ff",
  };
  return (
    <span
      className="w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: colors[rarity] ?? "#3d5068", boxShadow: rarity !== "common" ? `0 0 5px ${colors[rarity] ?? "#3d5068"}` : "none" }}
    />
  );
}

export default function BrowsePage() {
  const [query, setQuery]       = useState("");
  const [cards, setCards]       = useState<CardVariant[]>([]);
  const [loading, setLoading]   = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 2) { setCards([]); setSearched(false); setError(null); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const { cards: results } = await api.search(query.trim(), 60);
        setCards(results);
        setSearched(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Search failed";
        setError(msg || "Unable to reach the API — check that NEXT_PUBLIC_API_URL is configured.");
        setCards([]);
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
        <h1 className="font-display text-5xl font-extrabold leading-none tracking-tight mb-3">
          <span className="holo-text">CARD ENGINE</span>
        </h1>
        <p className="text-sm font-medium" style={{ color: "#3d5068" }}>
          Search every Magic card with live TCGplayer &amp; Cardmarket pricing
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-10 max-w-2xl">
        <div
          className="flex items-center gap-3 px-5 py-3.5 rounded-2xl transition-all duration-200"
          style={{
            background: "#0d1220",
            border: `1px solid ${query ? "rgba(0,212,255,0.4)" : "#1e2d45"}`,
            boxShadow: query ? "0 0 0 3px rgba(0,212,255,0.08), 0 0 30px rgba(0,212,255,0.05)" : "none",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3d5068" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cards by name…"
            className="flex-1 bg-transparent text-white placeholder:font-medium focus:outline-none text-sm"
            style={{ caretColor: "#00d4ff" }}
            autoFocus
          />
          {loading && (
            <span className="text-xs font-medium animate-pulse shrink-0" style={{ color: "#00d4ff" }}>
              Scanning…
            </span>
          )}
          {query && !loading && (
            <button
              onClick={() => { setQuery(""); setCards([]); setSearched(false); setError(null); }}
              className="shrink-0 opacity-40 hover:opacity-100 transition-opacity text-lg leading-none"
              style={{ color: "#ff0080" }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 px-5 py-4 rounded-2xl text-sm font-medium animate-enter"
          style={{ background: "rgba(255,0,128,0.08)", border: "1px solid rgba(255,0,128,0.3)", color: "#ff6bad" }}>
          <span className="font-bold">Search error:</span> {error}
        </div>
      )}

      {/* Skeletons */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Empty / start state */}
      {!loading && !searched && !error && (
        <div className="flex flex-col items-center justify-center py-36 gap-6 text-center animate-enter">
          <div className="animate-float">
            <div
              className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl relative"
              style={{
                background: "linear-gradient(135deg, #060810 0%, #0d1220 100%)",
                border: "1px solid rgba(0,212,255,0.2)",
                boxShadow: "0 0 50px rgba(0,212,255,0.12), 0 0 100px rgba(124,58,237,0.08)",
              }}
            >
              <span className="holo-text text-4xl font-display font-extrabold">CE</span>
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-display font-bold text-white mb-2">Find any card</h2>
            <p className="text-sm max-w-sm" style={{ color: "#3d5068" }}>
              Type a name to search the full Scryfall database with real-time prices
            </p>
          </div>
        </div>
      )}

      {/* No results */}
      {!loading && searched && cards.length === 0 && !error && (
        <div className="py-24 text-center animate-enter">
          <p className="text-5xl mb-4 opacity-20">&#128269;</p>
          <p className="text-white font-bold font-display text-lg mb-1">No results for &ldquo;{query}&rdquo;</p>
          <p className="text-sm" style={{ color: "#3d5068" }}>Try a different spelling or card name</p>
        </div>
      )}

      {/* Results */}
      {!loading && cards.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-5">
            <span
              className="px-2.5 py-1 rounded-lg text-xs font-bold"
              style={{ background: "rgba(0,212,255,0.1)", color: "#00d4ff", border: "1px solid rgba(0,212,255,0.2)" }}
            >
              {cards.length} result{cards.length !== 1 ? "s" : ""}
            </span>
            <div style={{ height: 1, flex: 1, background: "rgba(0,212,255,0.06)" }} />
          </div>
          <CardGrid cards={cards} />
        </>
      )}
    </div>
  );
}
