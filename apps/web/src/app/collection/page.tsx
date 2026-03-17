"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import Link from "next/link";

interface CollectionValue {
  totalValue: number;
  currency: string;
  cardCount: number;
  breakdown: Array<{ variantId: string; name: string; quantity: number; price: number; total: number }>;
}

function StatTile({ label, value, sub, color = "#00d4ff" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="glass rounded-2xl p-5" style={{ border: `1px solid ${color}1a` }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#3d5068" }}>{label}</p>
      <p className="font-display font-extrabold text-3xl" style={{ color }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: "#3d5068" }}>{sub}</p>}
    </div>
  );
}

export default function CollectionPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!authLoading && !user) router.push("/login"); }, [authLoading, user, router]);
  const { data, error, isLoading } = useSWR(
    user ? "collection-value" : null,
    () => api.collection.value() as Promise<CollectionValue>
  );

  if (authLoading || !user) return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="skeleton h-8 w-48 rounded mb-6" />
      <div className="grid grid-cols-3 gap-4 mb-8">{[1,2,3].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div>
    </div>
  );

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display font-extrabold text-4xl text-white leading-none mb-2">Collection</h1>
        <p className="text-sm" style={{ color: "#3d5068" }}>Your card portfolio at a glance</p>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">{[1,2,3].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div>
      ) : error ? (
        <div className="glass rounded-2xl p-6 mb-8 text-sm" style={{ color: "#ff6bad" }}>Failed to load collection data.</div>
      ) : data ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 animate-enter">
          <StatTile label="Total Value" value={`$${data.totalValue.toFixed(2)}`} sub={data.currency} color="#00d4ff" />
          <StatTile label="Unique Cards" value={data.cardCount.toLocaleString()} sub="in collection" color="#a78bfa" />
          <StatTile label="Avg per Card" value={data.cardCount > 0 ? `$${(data.totalValue / data.cardCount).toFixed(2)}` : "—"} color="#ff0080" />
        </div>
      ) : null}
      {data && data.breakdown.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden animate-enter" style={{ border: "1px solid rgba(0,212,255,0.08)" }}>
          <div className="px-6 py-4" style={{ borderBottom: "1px solid rgba(0,212,255,0.06)" }}>
            <h2 className="font-semibold text-sm text-white">Top Cards by Value</h2>
          </div>
          <table className="w-full text-sm">
            <thead><tr style={{ borderBottom: "1px solid rgba(0,212,255,0.06)" }}>
              {["Card","Qty","Price","Total"].map((h, i) => (
                <th key={h} className={`${i > 0 ? "text-right" : "text-left"} px-6 py-3 text-xs font-semibold uppercase tracking-wider`} style={{ color: "#3d5068" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {data.breakdown.slice(0, 20).map((row, i) => (
                <tr key={row.variantId}
                  style={{ borderBottom: i < Math.min(data.breakdown.length, 20) - 1 ? "1px solid rgba(0,212,255,0.04)" : "none" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(0,212,255,0.04)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}>
                  <td className="px-6 py-3"><Link href={`/cards/${encodeURIComponent(row.variantId)}`} className="text-white hover:text-neon transition-colors font-medium">{row.name}</Link></td>
                  <td className="px-6 py-3 text-right" style={{ color: "#3d5068" }}>x{row.quantity}</td>
                  <td className="px-6 py-3 text-right" style={{ color: "#8ca0b8" }}>${row.price.toFixed(2)}</td>
                  <td className="px-6 py-3 text-right font-bold" style={{ color: "#00d4ff" }}>${row.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.breakdown.length === 0 && (
        <div className="glass rounded-2xl p-12 text-center animate-enter" style={{ border: "1px solid rgba(0,212,255,0.08)" }}>
          <p className="font-display font-bold text-lg text-white mb-1">No cards tracked yet</p>
          <p className="text-sm" style={{ color: "#3d5068" }}>Add cards to your decks to see collection value</p>
        </div>
      )}
    </div>
  );
}
