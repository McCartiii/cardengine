"use client";

import { useEffect, useState } from "react";
import { api, type WatchlistEntry } from "@/lib/api";
import { clsx } from "clsx";

export default function WatchlistPage() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.watchlist.list()
      .then(({ entries: e }) => setEntries(e))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleToggle = async (entry: WatchlistEntry) => {
    const next = !entry.enabled;
    setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, enabled: next } : e));
    await api.watchlist.toggle(entry.id, next);
  };

  const handleDelete = async (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    await api.watchlist.delete(id);
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-1">Price Alerts</h1>
        <p className="text-muted">Get notified when cards hit your target price</p>
      </div>

      {loading && <p className="text-muted animate-pulse">Loading…</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!loading && entries.length === 0 && (
        <div className="py-24 text-center">
          <p className="text-5xl mb-4">🔔</p>
          <p className="text-xl font-bold mb-2">No alerts set</p>
          <p className="text-muted">Browse a card and set a price target to start tracking</p>
        </div>
      )}

      <div className="space-y-3">
        {entries.map((entry) => {
          const triggered = entry.currentPrice != null && (
            entry.direction === "above"
              ? entry.currentPrice >= entry.thresholdAmount
              : entry.currentPrice <= entry.thresholdAmount
          );
          return (
            <div
              key={entry.id}
              className={clsx(
                "flex items-center gap-4 bg-surface rounded-2xl border p-4 transition-all",
                triggered && entry.enabled ? "border-accent/60" : "border-border"
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{entry.cardName}</p>
                <p className="text-muted text-sm">
                  Alert when {entry.direction}{" "}
                  <span className="font-semibold text-white">${entry.thresholdAmount.toFixed(2)}</span>
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm">
                    Now:{" "}
                    <span className="font-semibold">
                      {entry.currentPrice != null ? `$${entry.currentPrice.toFixed(2)}` : "—"}
                    </span>
                  </span>
                  {triggered && entry.enabled && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-accent/20 text-accent-light border border-accent/40">
                      TRIGGERED
                    </span>
                  )}
                </div>
                <p className="text-muted text-xs mt-0.5 capitalize">{entry.market} · {entry.kind} · {entry.currency}</p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {/* Toggle */}
                <button
                  onClick={() => handleToggle(entry)}
                  className={clsx(
                    "relative w-10 h-6 rounded-full transition-colors",
                    entry.enabled ? "bg-accent" : "bg-border"
                  )}
                >
                  <span className={clsx("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", entry.enabled ? "left-5" : "left-1")} />
                </button>
                {/* Delete */}
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="text-muted hover:text-red-400 transition-colors p-1"
                >
                  🗑
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
