"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface ValueEntry {
  variantId: string;
  qty: number;
  price: number;
  lineValue: number;
}

interface CollectionValue {
  totalValue: number;
  currency: string;
  cardCount: number;
  breakdown: ValueEntry[];
}

function NetworkError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-28 gap-5 text-center animate-enter">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
        style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
        ⚠
      </div>
      <div>
        <p className="text-white font-bold text-lg mb-1">Can&apos;t reach the server</p>
        <p className="text-sm max-w-sm" style={{ color: "#7c6f9a" }}>
          Make sure the API is running and{" "}
          <code className="text-accent-light font-mono text-xs">NEXT_PUBLIC_API_URL</code> is configured.
        </p>
      </div>
      <button
        onClick={onRetry}
        className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200"
        style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 0 20px rgba(124,58,237,0.3)" }}
      >
        Try again
      </button>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className="rounded-2xl p-5 transition-all duration-200"
      style={{
        background: accent
          ? "linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(99,102,241,0.08) 100%)"
          : "#110d1f",
        border: accent ? "1px solid rgba(139,92,246,0.3)" : "1px solid #2a1f4a",
        boxShadow: accent ? "0 0 24px rgba(139,92,246,0.12)" : "none",
      }}
    >
      <p className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: "#7c6f9a" }}>{label}</p>
      <p className={`text-2xl font-black ${accent ? "gradient-text" : "text-white"}`}>{value}</p>
    </div>
  );
}

export default function CollectionPage() {
  const [data, setData]       = useState<CollectionValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api.collection.value()
      .then((d) => setData(d as CollectionValue))
      .catch((e: Error) => {
        const isNet = e.message === "Load failed" || e.message === "Failed to fetch" || e.name === "TypeError";
        setError(isNet ? "network" : e.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-10">
        <h1 className="text-4xl font-black mb-2"><span className="gradient-text">Collection</span></h1>
        <p className="text-sm" style={{ color: "#7c6f9a" }}>Your card portfolio at a glance</p>
      </div>

      {!loading && error === "network" && <NetworkError onRetry={load} />}
      {!loading && error && error !== "network" && (
        <div className="rounded-2xl p-4 text-sm animate-enter"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}>
          {error === "Forbidden" || error === "Unauthorized" ? "Sign in to view your collection." : error}
        </div>
      )}

      {/* Skeleton */}
      {loading && (
        <div className="space-y-8">
          <div className="grid grid-cols-3 gap-4">
            {[0,1,2].map(i => (
              <div key={i} className="rounded-2xl p-5" style={{ background: "#110d1f", border: "1px solid #2a1f4a" }}>
                <div className="skeleton h-3 w-20 rounded mb-3" />
                <div className="skeleton h-8 w-32 rounded" />
              </div>
            ))}
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ background: "#110d1f", border: "1px solid #2a1f4a" }}>
            <div className="px-6 py-4" style={{ borderBottom: "1px solid #2a1f4a" }}>
              <div className="skeleton h-5 w-40 rounded" />
            </div>
            {[0,1,2,3,4,5].map(i => (
              <div key={i} className="px-6 py-3.5 flex items-center gap-4" style={{ borderTop: i > 0 ? "1px solid #1e1640" : undefined }}>
                <div className="skeleton h-4 flex-1 rounded" />
                <div className="skeleton h-4 w-16 rounded" />
                <div className="skeleton h-4 w-8 rounded" />
                <div className="skeleton h-4 w-20 rounded" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data */}
      {!loading && !error && data && (
        <div className="space-y-8 animate-enter">
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Total Value" value={`$${data.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} accent />
            <StatCard label="Unique Cards" value={data.cardCount.toLocaleString()} />
            <StatCard label="Currency" value={data.currency} />
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ background: "#110d1f", border: "1px solid #2a1f4a" }}>
            <div className="px-6 py-4" style={{ borderBottom: "1px solid #2a1f4a" }}>
              <h2 className="font-bold text-lg text-white">Top Cards by Value</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-wider font-semibold" style={{ color: "#7c6f9a" }}>Card</th>
                  <th className="px-6 py-3 text-right text-xs uppercase tracking-wider font-semibold" style={{ color: "#7c6f9a" }}>Price</th>
                  <th className="px-6 py-3 text-right text-xs uppercase tracking-wider font-semibold" style={{ color: "#7c6f9a" }}>Qty</th>
                  <th className="px-6 py-3 text-right text-xs uppercase tracking-wider font-semibold" style={{ color: "#7c6f9a" }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {data.breakdown.map((entry, i) => (
                  <tr
                    key={entry.variantId}
                    className="transition-colors duration-150 animate-enter"
                    style={{ borderTop: "1px solid #1e1640", animationDelay: `${i * 40}ms` }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(139,92,246,0.06)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                  >
                    <td className="px-6 py-3.5">
                      <span className="text-accent-light text-xs font-mono">{entry.variantId.slice(0, 14)}…</span>
                    </td>
                    <td className="px-6 py-3.5 text-right text-sm" style={{ color: "#7c6f9a" }}>${entry.price.toFixed(2)}</td>
                    <td className="px-6 py-3.5 text-right text-sm" style={{ color: "#7c6f9a" }}>×{entry.qty}</td>
                    <td className="px-6 py-3.5 text-right font-bold text-cyan">${entry.lineValue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
