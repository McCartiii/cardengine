"use client";

import { useEffect, useState } from "react";
import { api, type WatchlistEntry } from "@/lib/api";

function NetworkError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5 text-center animate-enter">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
        style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
        ⚠
      </div>
      <div>
        <p className="text-white font-bold text-lg mb-1">Can&apos;t reach the server</p>
        <p className="text-sm max-w-sm" style={{ color: "#7c6f9a" }}>
          Ensure the API is running and <code className="text-accent-light font-mono text-xs">NEXT_PUBLIC_API_URL</code> is set.
        </p>
      </div>
      <button onClick={onRetry} className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200"
        style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 0 20px rgba(124,58,237,0.3)" }}>
        Try again
      </button>
    </div>
  );
}

export default function WatchlistPage() {
  const [entries, setEntries]   = useState<WatchlistEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api.watchlist.list()
      .then(({ entries: e }) => setEntries(e))
      .catch((e: Error) => {
        const isNet = e.message === "Load failed" || e.message === "Failed to fetch" || e.name === "TypeError";
        setError(isNet ? "network" : e.message);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleToggle = async (entry: WatchlistEntry) => {
    const next = !entry.enabled;
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, enabled: next } : e));
    await api.watchlist.toggle(entry.id, next);
  };

  const handleDelete = async (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    await api.watchlist.delete(id);
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-10">
        <h1 className="text-4xl font-black mb-2"><span className="gradient-text">Price Alerts</span></h1>
        <p className="text-sm" style={{ color: "#7c6f9a" }}>Get notified when cards hit your target price</p>
      </div>

      {!loading && error === "network" && <NetworkError onRetry={load} />}
      {!loading && error && error !== "network" && (
        <p className="text-sm animate-enter" style={{ color: "#fca5a5" }}>{error}</p>
      )}

      {/* Skeleton */}
      {loading && (
        <div className="space-y-3">
          {[0,1,2,3].map(i => (
            <div key={i} className="rounded-2xl p-4 flex items-center gap-4"
              style={{ background: "#110d1f", border: "1px solid #2a1f4a" }}>
              <div className="flex-1 space-y-2">
                <div className="skeleton h-5 w-40 rounded" />
                <div className="skeleton h-3 w-56 rounded" />
                <div className="skeleton h-3 w-24 rounded" />
              </div>
              <div className="skeleton w-10 h-6 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && entries.length === 0 && (
        <div className="py-28 text-center animate-enter">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-5"
            style={{ background: "linear-gradient(135deg, #2d1b69, #0e4f6e)", boxShadow: "0 0 40px rgba(139,92,246,0.25)" }}>
            🔔
          </div>
          <p className="text-xl font-bold text-white mb-2">No alerts set</p>
          <p className="text-sm" style={{ color: "#7c6f9a" }}>Browse a card and set a price target to start tracking</p>
        </div>
      )}

      {/* Alert list */}
      <div className="space-y-3">
        {entries.map((entry, i) => {
          const triggered =
            entry.currentPrice != null &&
            (entry.direction === "above"
              ? entry.currentPrice >= entry.thresholdAmount
              : entry.currentPrice <= entry.thresholdAmount);

          return (
            <div
              key={entry.id}
              className="flex items-center gap-4 rounded-2xl p-4 transition-all duration-200 animate-enter"
              style={{
                background: triggered && entry.enabled ? "rgba(139,92,246,0.08)" : "#110d1f",
                border: triggered && entry.enabled ? "1px solid rgba(139,92,246,0.35)" : "1px solid #2a1f4a",
                boxShadow: triggered && entry.enabled ? "0 0 20px rgba(139,92,246,0.12)" : "none",
                animationDelay: `${i * 50}ms`,
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-bold text-white truncate">{entry.cardName}</p>
                  {triggered && entry.enabled && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg shrink-0"
                      style={{ background: "rgba(139,92,246,0.2)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.4)" }}>
                      TRIGGERED
                    </span>
                  )}
                </div>
                <p className="text-sm mb-1" style={{ color: "#7c6f9a" }}>
                  Alert when {entry.direction}{" "}
                  <span className="font-semibold text-white">${entry.thresholdAmount.toFixed(2)}</span>
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-sm">
                    Now:{" "}
                    <span className="font-semibold text-cyan">
                      {entry.currentPrice != null ? `$${entry.currentPrice.toFixed(2)}` : "—"}
                    </span>
                  </span>
                  <span className="text-xs capitalize" style={{ color: "#7c6f9a" }}>
                    {entry.market} · {entry.kind} · {entry.currency}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {/* Toggle */}
                <button
                  onClick={() => handleToggle(entry)}
                  className="relative w-11 h-6 rounded-full transition-all duration-300 focus:outline-none"
                  style={{
                    background: entry.enabled
                      ? "linear-gradient(135deg, #8b5cf6, #6366f1)"
                      : "#1e1640",
                    boxShadow: entry.enabled ? "0 0 12px rgba(139,92,246,0.4)" : "none",
                  }}
                >
                  <span
                    className="absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 shadow-sm"
                    style={{ left: entry.enabled ? "calc(100% - 20px)" : "4px" }}
                  />
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
                  style={{ color: "#7c6f9a" }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.12)";
                    (e.currentTarget as HTMLButtonElement).style.color = "#fca5a5";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                    (e.currentTarget as HTMLButtonElement).style.color = "#7c6f9a";
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
