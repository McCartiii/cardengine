"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { downloadAndStoreBundle, searchCardsLocal, type LocalCard } from "@/lib/store/cardStore";
import { runWebSync } from "@/lib/store/sync";
import Link from "next/link";
import { NavBar } from "@/components/ui/NavBar";
import { Badge } from "@/components/ui/Badge";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { getIdentityStyle } from "@/lib/identity";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface PriceEntry {
  market: string;
  kind: string;
  currency: string;
  amount: number;
}

interface CardWithPrice extends LocalCard {
  priceUsd?: number | null;
  priceEur?: number | null;
  prices?: PriceEntry[];
}

function priceLabel(p: PriceEntry): string {
  const marketName = p.market === "tcgplayer" ? "TCG" : p.market === "cardmarket" ? "MKM" : "MTGO";
  const kindLabel = p.kind === "market" ? "" : p.kind === "foil" ? " Foil" : ` ${p.kind.charAt(0).toUpperCase() + p.kind.slice(1)}`;
  return `${marketName}${kindLabel}`;
}

function currencySymbol(currency: string): string {
  if (currency === "USD") return "$";
  if (currency === "EUR") return "\u20ac";
  if (currency === "TIX") return "";
  return currency + " ";
}

function currencySuffix(currency: string): string {
  if (currency === "TIX") return " tix";
  return "";
}

type BadgeVariant = "tcg" | "mkm" | "mtgo" | "default";

function marketBadgeVariant(market: string): BadgeVariant {
  if (market === "tcgplayer") return "tcg";
  if (market === "cardmarket") return "mkm";
  if (market === "mtgo") return "mtgo";
  return "default";
}

function rarityBadgeVariant(rarity: string | undefined): "mythic" | "rare" | "uncommon" | "common" | "default" {
  if (!rarity) return "default";
  const r = rarity.toLowerCase();
  if (r === "mythic") return "mythic";
  if (r === "rare") return "rare";
  if (r === "uncommon") return "uncommon";
  if (r === "common") return "common";
  return "default";
}

type SortOption = "popular" | "name-asc" | "name-desc" | "price-asc" | "price-desc" | "rarity";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "popular", label: "Most Popular" },
  { value: "name-asc", label: "Name A \u2192 Z" },
  { value: "name-desc", label: "Name Z \u2192 A" },
  { value: "rarity", label: "Rarity (Mythic first)" },
  { value: "price-desc", label: "Price: High \u2192 Low" },
  { value: "price-asc", label: "Price: Low \u2192 High" },
];

export default function CollectionPage() {
  const [cards, setCards] = useState<CardWithPrice[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("popular");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    downloaded: number;
    total: number | null;
  } | null>(null);
  const [watchlistAdded, setWatchlistAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    }
    loadUser();
  }, []);

  useEffect(() => {
    async function init() {
      try {
        await downloadAndStoreBundle(API_URL, (downloaded, total) => {
          setDownloadProgress({ downloaded, total });
        });
        await runWebSync();
      } catch (err) {
        console.warn("Init error:", err);
      }
      setDownloadProgress(null);
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    if (!searchQuery) {
      setCards([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_URL}/v1/search?q=${encodeURIComponent(searchQuery)}&limit=50&sort=${sortBy}`
        );
        if (res.ok) {
          const data = await res.json();
          setCards(data.cards ?? []);
          return;
        }
      } catch {
        // Fallback to local
      }
      const results = await searchCardsLocal(searchQuery, 50);
      setCards(results);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, sortBy]);

  useEffect(() => {
    const handler = () => { runWebSync(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const addToWatchlist = useCallback(
    async (variantId: string, currentPrice: number) => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert("Please sign in to use the watchlist");
        return;
      }
      try {
        const res = await fetch(`${API_URL}/v1/watchlist`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            variantId,
            market: "tcgplayer",
            kind: "market",
            currency: "USD",
            thresholdAmount: currentPrice * 0.8,
            direction: "below",
          }),
        });
        if (res.ok) {
          setWatchlistAdded((prev) => new Set(prev).add(variantId));
        }
      } catch {
        // Offline
      }
    },
    []
  );

  return (
    <div className="min-h-screen bg-bg">
      <NavBar user={user} />

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="animate-fade-in">
          <h1 className="text-3xl font-extrabold tracking-tight text-text-primary">
            Collection
          </h1>
          <p className="mt-1 text-text-secondary">Browse, search, and manage your cards</p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center animate-slide-up">
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search cards by name, type, or text..."
              className="w-full rounded-xl border border-border bg-surface pl-10 pr-4 py-3 text-text-primary placeholder:text-text-muted focus:border-tab-collection focus:outline-none focus:ring-2 focus:ring-tab-collection/20 shadow-[var(--shadow-card)] transition-all"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-secondary focus:border-tab-collection focus:outline-none focus:ring-2 focus:ring-tab-collection/20 shadow-[var(--shadow-card)] cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="mt-10">
            {downloadProgress ? (
              <div className="text-center animate-fade-in">
                <p className="text-text-secondary text-sm">
                  Downloading cards... {downloadProgress.downloaded.toLocaleString()}
                  {downloadProgress.total ? ` / ${downloadProgress.total.toLocaleString()}` : ""}
                </p>
                {downloadProgress.total && downloadProgress.total > 0 && (
                  <div className="mx-auto mt-4 h-2 w-64 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="h-full rounded-full bg-tab-collection transition-all duration-300"
                      style={{
                        width: `${Math.min((downloadProgress.downloaded / downloadProgress.total) * 100, 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            )}
          </div>
        ) : cards.length === 0 && searchQuery ? (
          <div className="mt-16 text-center animate-fade-in">
            <div className="mx-auto w-12 h-12 rounded-full bg-surface-sunken flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <p className="text-text-secondary">No cards found for &quot;{searchQuery}&quot;</p>
          </div>
        ) : cards.length === 0 ? (
          <div className="mt-16 text-center animate-fade-in">
            <div className="mx-auto w-12 h-12 rounded-full bg-tab-collection-bg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-tab-collection" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <p className="text-text-secondary">Search for cards to browse prices and add to your collection</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card, idx) => (
              <Link
                key={card.variantId}
                href={`/card/${encodeURIComponent(card.variantId)}`}
                className={`animate-slide-up flex gap-4 rounded-2xl bg-surface p-4 card-hover`}
                style={{
                  animationDelay: `${Math.min(idx * 0.03, 0.3)}s`,
                  borderWidth: "1.5px",
                  borderStyle: "solid",
                  boxShadow: "var(--shadow-card)",
                  ...getIdentityStyle(card.colorIdentity ?? []),
                }}
              >
                {card.imageUri && (
                  <img
                    src={card.imageUri}
                    alt={card.name}
                    className="h-32 w-auto rounded-lg shadow-sm"
                    loading="lazy"
                  />
                )}
                <div className="flex flex-1 flex-col justify-between min-w-0">
                  <div>
                    <h3 className="font-semibold text-text-primary truncate">
                      {card.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {card.setId?.toUpperCase()} {card.collectorNumber}
                    </p>
                    {card.rarity && (
                      <Badge variant={rarityBadgeVariant(card.rarity)} setCode={card.setId ?? undefined} className="mt-1.5">
                        {card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1)}
                      </Badge>
                    )}
                    {card.typeLine && (
                      <p className="mt-1 text-xs text-text-muted truncate">
                        {card.typeLine}
                      </p>
                    )}
                  </div>

                  {card.prices && card.prices.length > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {card.prices.map((p) => (
                        <Badge
                          key={`${p.market}-${p.kind}-${p.currency}`}
                          variant={marketBadgeVariant(p.market)}
                        >
                          {priceLabel(p)} {currencySymbol(p.currency)}{p.amount.toFixed(2)}{currencySuffix(p.currency)}
                        </Badge>
                      ))}
                      {card.prices.some((p) => p.currency === "USD") && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const usdPrice = card.prices!.find((p) => p.currency === "USD")!;
                            addToWatchlist(card.variantId, usdPrice.amount);
                          }}
                          className={`ml-auto rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-text-secondary hover:bg-surface-sunken transition-colors cursor-pointer ${watchlistAdded.has(card.variantId) ? "opacity-40 pointer-events-none" : ""}`}
                        >
                          {watchlistAdded.has(card.variantId) ? "Watching" : "Watch"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2">
                      <span className="text-xs text-text-muted">No price data</span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
