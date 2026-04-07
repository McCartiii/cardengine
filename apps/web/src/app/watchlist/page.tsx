"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { NavBar } from "@/components/ui/NavBar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CardImage } from "@/components/ui/CardImage";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface WatchlistEntry {
  id: string;
  variantId: string;
  market: string;
  kind: string;
  currency: string;
  thresholdAmount: number;
  direction: string;
  enabled: boolean;
  createdAt: string;
  cardName?: string;
  currentPrice?: number;
}

interface SearchResult {
  variantId: string;
  name: string;
  setId?: string;
  priceUsd?: number | null;
  imageUri?: string;
}

export default function WatchlistPage() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedCard, setSelectedCard] = useState<SearchResult | null>(null);
  const [threshold, setThreshold] = useState("");
  const [direction, setDirection] = useState<"below" | "above">("below");
  const [user, setUser] = useState<{ email?: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ? { email: u.email ?? undefined } : null);
    });
  }, []);

  const fetchWatchlist = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/v1/watchlist`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      const rawEntries: WatchlistEntry[] = data.entries ?? [];

      // Enrich with card names and current prices
      if (rawEntries.length > 0) {
        const variantIds = rawEntries.map((e) => e.variantId);
        const priceRes = await fetch(`${API_URL}/v1/prices/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variantIds, market: "tcgplayer" }),
        });
        const priceData = priceRes.ok ? await priceRes.json() : { prices: {} };

        // Fetch card names
        for (const entry of rawEntries) {
          const price = priceData.prices?.[entry.variantId];
          entry.currentPrice = price?.amount;

          // Try to get card name from search
          try {
            const nameRes = await fetch(
              `${API_URL}/v1/search?q=&game=mtg&limit=1&offset=0`
            );
            // We'll use variantId lookup instead
          } catch {
            // skip
          }
        }
      }

      setEntries(rawEntries);
    } catch {
      // Offline
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  // Search for cards to add to watchlist
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_URL}/v1/search?q=${encodeURIComponent(searchQuery)}&limit=8`
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.cards ?? []);
        }
      } catch {
        // offline
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const addAlert = async () => {
    if (!selectedCard || !threshold) return;

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
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
          variantId: selectedCard.variantId,
          market: "tcgplayer",
          kind: "market",
          currency: "USD",
          thresholdAmount: parseFloat(threshold),
          direction,
        }),
      });
      if (res.ok) {
        setShowAddForm(false);
        setSelectedCard(null);
        setSearchQuery("");
        setThreshold("");
        fetchWatchlist();
      }
    } catch {
      alert("Failed to create alert");
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      <NavBar user={user} />

      <main className="mx-auto max-w-4xl px-6 py-8 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">
              Price Watchlist
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Get alerted when card prices cross your thresholds.
            </p>
          </div>
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            variant={showAddForm ? "secondary" : "primary"}
          >
            {showAddForm ? "Cancel" : "Add Alert"}
          </Button>
        </div>

        {/* Add alert form */}
        {showAddForm && (
          <div className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-card)] animate-scale-in">
            <h2 className="text-lg font-semibold text-text-primary">
              New Price Alert
            </h2>

            {!selectedCard ? (
              <div className="mt-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for a card..."
                  className="w-full rounded-xl border border-border bg-surface-sunken px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-tab-watchlist focus:outline-none focus:ring-1 focus:ring-tab-watchlist"
                />
                {searchResults.length > 0 && (
                  <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                    {searchResults.map((r) => (
                      <button
                        key={r.variantId}
                        onClick={() => {
                          setSelectedCard(r);
                          if (r.priceUsd)
                            setThreshold((r.priceUsd * 0.8).toFixed(2));
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-left transition-all hover:shadow-[var(--shadow-card)] card-hover"
                      >
                        {r.imageUri && (
                          <CardImage
                            src={r.imageUri}
                            alt={r.name}
                            className="h-10 w-auto rounded"
                            wrapperClassName="rounded"
                            foil={false}
                          />
                        )}
                        <div className="flex-1">
                          <p className="text-sm font-medium text-text-primary">
                            {r.name}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {r.setId?.toUpperCase()}
                            {r.priceUsd != null
                              ? ` \u2022 $${r.priceUsd.toFixed(2)}`
                              : ""}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-3 rounded-xl bg-surface-sunken p-3">
                  {selectedCard.imageUri && (
                    <img
                      src={selectedCard.imageUri}
                      alt={selectedCard.name}
                      className="h-14 w-auto rounded"
                    />
                  )}
                  <div>
                    <p className="font-medium text-text-primary">
                      {selectedCard.name}
                    </p>
                    <p className="text-sm text-text-secondary">
                      Current:{" "}
                      {selectedCard.priceUsd != null
                        ? `$${selectedCard.priceUsd.toFixed(2)}`
                        : "N/A"}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedCard(null)}
                    className="ml-auto text-sm text-text-muted hover:text-text-secondary transition-colors"
                  >
                    Change
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary">
                      Alert when price goes
                    </label>
                    <select
                      value={direction}
                      onChange={(e) =>
                        setDirection(e.target.value as "below" | "above")
                      }
                      className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                    >
                      <option value="below">Below</option>
                      <option value="above">Above</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary">
                      Price threshold (USD)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-tab-watchlist focus:outline-none focus:ring-1 focus:ring-tab-watchlist"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <Button
                  onClick={addAlert}
                  disabled={!threshold}
                  className="w-full"
                >
                  Create Alert
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Entries */}
        {loading ? (
          <div className="mt-16 text-center text-text-muted animate-fade-in">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-tab-watchlist border-t-transparent" />
            <p className="mt-3">Loading watchlist...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="mt-16 text-center text-text-muted animate-fade-in">
            No watchlist entries yet. Click &quot;Add Alert&quot; to get
            started.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {entries.map((entry, i) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] card-hover animate-slide-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div>
                  <p className="font-medium text-text-primary">
                    {entry.cardName ?? entry.variantId.replace("scryfall:", "")}
                  </p>
                  <p className="text-sm text-text-secondary">
                    Alert: {entry.direction === "above" ? "Above" : "Below"} $
                    {entry.thresholdAmount.toFixed(2)} {entry.currency}
                    {entry.currentPrice != null && (
                      <span className="ml-2 text-tab-watchlist">
                        Current: ${entry.currentPrice.toFixed(2)}
                      </span>
                    )}
                  </p>
                </div>
                <Badge variant={entry.enabled ? "success" : "warning"}>
                  {entry.enabled ? "Active" : "Triggered"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
