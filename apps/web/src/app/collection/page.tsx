"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { searchCardsLocal, type LocalCard } from "@/lib/store/cardStore";
import { runWebSync } from "@/lib/store/sync";
import Link from "next/link";
import { NavBar } from "@/components/ui/NavBar";
import { Button } from "@/components/ui/Button";
import { CardTile } from "@/components/ui/CardTile";
import { SkeletonCard } from "@/components/ui/Skeleton";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface CardWithPrice extends LocalCard {
  priceUsd?: number | null;
  priceEur?: number | null;
  prices?: Array<{ market: string; kind: string; currency: string; amount: number }>;
}

type SortOption = "popular" | "name-asc" | "name-desc" | "price-asc" | "price-desc" | "rarity";
type ColorFilter = "ALL" | "W" | "U" | "B" | "R" | "G" | "C" | "M";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "price-desc", label: "Sort: Value +" },
  { value: "price-asc", label: "Sort: Value −" },
  { value: "name-asc", label: "Name A → Z" },
  { value: "name-desc", label: "Name Z → A" },
  { value: "rarity", label: "Rarity" },
  { value: "popular", label: "Most Popular" },
];

const COLOR_CHIPS: { id: ColorFilter; label: string }[] = [
  { id: "ALL", label: "ALL" },
  { id: "W", label: "White" },
  { id: "U", label: "Blue" },
  { id: "B", label: "Black" },
  { id: "R", label: "Red" },
  { id: "G", label: "Green" },
  { id: "C", label: "Colorless" },
  { id: "M", label: "Multi" },
];

function matchesColorFilter(card: CardWithPrice, filter: ColorFilter): boolean {
  if (filter === "ALL") return true;
  const id = card.colorIdentity ?? card.colors ?? [];
  if (filter === "C") return id.length === 0;
  if (filter === "M") return id.length > 1;
  return id.length === 1 && id[0] === filter;
}

function isFoilVariant(variantId: string): boolean {
  return variantId.endsWith("-foil");
}

export default function CollectionPage() {
  const [cards, setCards] = useState<CardWithPrice[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("price-desc");
  const [colorFilter, setColorFilter] = useState<ColorFilter>("ALL");
  const [searching, setSearching] = useState(false);
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
    }
    loadUser();
  }, []);

  useEffect(() => {
    runWebSync().catch((err) => console.warn("Sync error:", err));
  }, []);

  useEffect(() => {
    if (!searchQuery) {
      setCards([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_URL}/v1/search?q=${encodeURIComponent(searchQuery)}&limit=50&sort=${sortBy}`
        );
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setCards(data.cards ?? []);
          return;
        }
        const results = await searchCardsLocal(searchQuery, 50);
        if (!cancelled) setCards(results);
      } catch {
        try {
          const results = await searchCardsLocal(searchQuery, 50);
          if (!cancelled) setCards(results);
        } catch {
          if (!cancelled) setCards([]);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, sortBy]);

  useEffect(() => {
    const handler = () => {
      runWebSync();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const filtered = useMemo(
    () => cards.filter((c) => matchesColorFilter(c, colorFilter)),
    [cards, colorFilter]
  );

  const stats = useMemo(() => {
    if (filtered.length === 0) {
      return { totalValue: null as number | null, unique: 0, foil: 0, avgRarity: "—" };
    }
    let total = 0;
    let priced = 0;
    let foil = 0;
    const rarityRank: Record<string, number> = {
      mythic: 4,
      rare: 3,
      uncommon: 2,
      common: 1,
    };
    let raritySum = 0;
    let rarityCount = 0;
    for (const c of filtered) {
      if (c.priceUsd != null && c.priceUsd > 0) {
        total += c.priceUsd;
        priced += 1;
      }
      if (isFoilVariant(c.variantId)) foil += 1;
      const r = c.rarity?.toLowerCase() ?? "";
      if (rarityRank[r]) {
        raritySum += rarityRank[r];
        rarityCount += 1;
      }
    }
    const avg =
      rarityCount === 0
        ? "—"
        : (["", "Common", "Uncommon", "Rare", "Mythic"][
            Math.round(raritySum / rarityCount)
          ] ?? "—");
    return {
      totalValue: priced > 0 ? total : null,
      unique: filtered.length,
      foil,
      avgRarity: avg,
    };
  }, [filtered]);

  function focusSearch() {
    searchRef.current?.focus();
  }

  function exportCsv() {
    if (filtered.length === 0) return;
    const rows = [
      ["name", "set", "collector", "rarity", "priceUsd", "variantId"].join(","),
      ...filtered.map((c) =>
        [
          JSON.stringify(c.name),
          c.setId ?? "",
          c.collectorNumber ?? "",
          c.rarity ?? "",
          c.priceUsd ?? "",
          c.variantId,
        ].join(",")
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "card-engine-search.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-bg pb-8">
      <NavBar user={user} />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-fade-in">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
              Your collection
            </p>
            <h1 className="mt-1 text-4xl font-bold tracking-tight text-text-primary font-stat">
              {searchQuery ? filtered.length : "—"}{" "}
              <span className="text-lg font-medium text-text-secondary">
                {searchQuery ? "results" : "cards"}
              </span>
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="md" onClick={exportCsv} disabled={filtered.length === 0}>
              Export
            </Button>
            <Button variant="primary" size="md" onClick={focusSearch}>
              Add cards
            </Button>
            <Link
              href="/scan"
              className="inline-flex items-center justify-center rounded-[var(--radius-xl)] border border-border bg-surface-raised px-4 py-2.5 text-sm font-semibold text-text-primary hover:border-border-strong"
            >
              Scan
            </Link>
          </div>
        </div>

        {/* Stat strip */}
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 animate-slide-up">
          {[
            {
              label: "Total value",
              value:
                stats.totalValue != null
                  ? `$${stats.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : "—",
              sub: searchQuery ? "From search results" : "Search to estimate",
            },
            {
              label: "Unique",
              value: searchQuery ? String(stats.unique) : "—",
              sub: "Printings shown",
            },
            {
              label: "Foil",
              value: searchQuery ? String(stats.foil) : "—",
              sub: "Foil variants",
            },
            {
              label: "Avg rarity",
              value: searchQuery ? stats.avgRarity : "—",
              sub: "Among results",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-[var(--radius-lg)] border border-border bg-surface p-4"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {s.label}
              </p>
              <p className="mt-1 font-stat text-2xl font-semibold text-text-primary">{s.value}</p>
              <p className="mt-1 text-xs text-text-muted">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Search + sort */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <svg
              className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search cards, sets, names..."
              className="w-full rounded-[var(--radius-lg)] border border-border bg-surface py-3 pl-10 pr-4 text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              style={{ boxShadow: "var(--shadow-card)" }}
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 text-sm text-text-secondary focus:border-accent focus:outline-none cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Color chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          {COLOR_CHIPS.map((chip) => {
            const active = colorFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setColorFilter(chip.id)}
                className="rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors cursor-pointer"
                style={{
                  background: active ? "var(--accent-light)" : "var(--surface)",
                  color: active ? "var(--accent-text)" : "var(--text-secondary)",
                  border: active
                    ? "1px solid rgba(78,147,200,0.45)"
                    : "1px solid var(--border)",
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Results */}
        {searching ? (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : cards.length === 0 && searchQuery ? (
          <div className="mt-16 text-center animate-fade-in">
            <p className="text-text-secondary">No cards found for &quot;{searchQuery}&quot;</p>
          </div>
        ) : cards.length === 0 ? (
          <div className="mt-16 text-center animate-fade-in">
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "var(--accent-light)", color: "var(--accent)" }}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
            </div>
            <p className="text-text-secondary">Search to browse prices and build your collection</p>
            <button
              type="button"
              onClick={focusSearch}
              className="mt-4 text-sm font-semibold text-accent-text hover:underline cursor-pointer"
            >
              Start typing
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-16 text-center animate-fade-in">
            <p className="text-text-secondary">No cards match this color filter</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((card, idx) => (
              <div
                key={card.variantId}
                className="animate-slide-up"
                style={{ animationDelay: `${Math.min(idx * 0.025, 0.25)}s` }}
              >
                <CardTile
                  variantId={card.variantId}
                  name={card.name}
                  imageUri={card.imageUri}
                  setId={card.setId}
                  collectorNumber={card.collectorNumber}
                  rarity={card.rarity}
                  priceUsd={card.priceUsd}
                  foil={isFoilVariant(card.variantId)}
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
