"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { api, type WatchlistEntry } from "@/lib/api";
import Link from "next/link";

export default function WatchlistPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!authLoading && !user) router.push("/login"); }, [authLoading, user, router]);
  const { data, error, isLoading, mutate } = useSWR<{ entries: WatchlistEntry[] }>(user ? "watchlist" : null, () => api.watchlist.list());
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function toggleEntry(id: string, enabled: boolean) {
    setToggling(id);
    try { await api.watchlist.toggle(id, !enabled); mutate(); } finally { setToggling(null); }
  }
  async function deleteEntry(id: string) {
    setDeleting(id);
    try { await api.watchlist.delete(id); mutate(); } finally { setDeleting(null); }
  }

  const entries = data?.entries ?? [];
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display font-extrabold text-4xl text-white leading-none mb-2">Price Alerts</h1>
        <p className="text-sm" style={{ color: "#3d5068" }}>Get notified when cards hit your target price</p>
      </div>
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
      ) : error ? (
        <div className="glass rounded-2xl p-6 text-sm" style={{ color: "#ff6bad" }}>Failed to load alerts.</div>
      ) : entries.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center" style={{ border: "1px solid rgba(0,212,255,0.08)" }}>
          <p className="text-4xl mb-4 opacity-20">&#128276;</p>
          <p className="font-display font-bold text-lg text-white mb-1">No alerts set</p>
          <p className="text-sm mb-6" style={{ color: "#3d5068" }}>Add price alerts from any card detail page</p>
          <Link href="/" className="inline-flex px-5 py-2.5 rounded-xl text-sm font-bold" style={{ background: "rgba(0,212,255,0.1)", color: "#00d4ff", border: "1px solid rgba(0,212,255,0.2)" }}>Browse Cards</Link>
        </div>
      ) : (
        <div className="space-y-3 animate-enter">
          {entries.map((entry) => {
            const isAbove = entry.direction === "above";
            const accentColor = isAbove ? "#ff0080" : "#00d4ff";
            return (
              <div key={entry.id} className="glass rounded-2xl px-5 py-4 flex items-center gap-4"
                style={{ border: `1px solid ${entry.enabled ? `${accentColor}22` : "rgba(30,45,69,0.8)"}`, opacity: entry.enabled ? 1 : 0.5 }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0" style={{ background: `${accentColor}15`, color: accentColor }}>{isAbove ? "▲" : "▼"}</div>
                <div className="flex-1 min-w-0">
                  <Link href={`/cards/${encodeURIComponent(entry.variantId)}`} className="text-sm font-semibold text-white hover:text-neon transition-colors truncate block">{entry.cardName}</Link>
                  <p className="text-xs mt-0.5" style={{ color: "#3d5068" }}>
                    Alert when {isAbove ? "above" : "below"} <span style={{ color: accentColor, fontWeight: 600 }}>${entry.thresholdAmount.toFixed(2)}</span> · {entry.market}
                  </p>
                </div>
                {entry.currentPrice != null && (
                  <div className="text-right shrink-0">
                    <p className="text-xs" style={{ color: "#3d5068" }}>now</p>
                    <p className="text-sm font-bold" style={{ color: "#8ca0b8" }}>${entry.currentPrice.toFixed(2)}</p>
                  </div>
                )}
                <button onClick={() => toggleEntry(entry.id, entry.enabled)} disabled={toggling === entry.id}
                  className="shrink-0 w-10 h-6 rounded-full transition-all duration-200"
                  style={{ background: entry.enabled ? "#00d4ff" : "#1e2d45", boxShadow: entry.enabled ? "0 0 10px rgba(0,212,255,0.3)" : "none" }} />
                <button onClick={() => deleteEntry(entry.id)} disabled={deleting === entry.id}
                  className="shrink-0 opacity-30 hover:opacity-100 transition-opacity" style={{ color: "#ff0080" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
