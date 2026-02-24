"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { clsx } from "clsx";

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

export default function CollectionPage() {
  const [data, setData] = useState<CollectionValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.collection.value()
      .then((d) => setData(d as CollectionValue))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-1">Collection</h1>
        <p className="text-muted">Your card portfolio at a glance</p>
      </div>

      {loading && <div className="text-muted animate-pulse">Loading…</div>}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
          {error === "Forbidden" || error === "Unauthorized"
            ? "Sign in to view your collection."
            : error}
        </div>
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <StatCard label="Total Value" value={`$${data.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} />
            <StatCard label="Unique Cards" value={data.cardCount.toLocaleString()} />
            <StatCard label="Currency" value={data.currency} />
          </div>

          {/* Top cards table */}
          <div className="bg-surface rounded-2xl overflow-hidden border border-border">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-bold text-lg">Top Cards by Value</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs uppercase tracking-wider">
                  <th className="px-6 py-3 text-left">Card</th>
                  <th className="px-6 py-3 text-right">Price</th>
                  <th className="px-6 py-3 text-right">Qty</th>
                  <th className="px-6 py-3 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.breakdown.map((entry) => (
                  <tr key={entry.variantId} className="hover:bg-surface-2 transition-colors">
                    <td className="px-6 py-3 font-medium truncate max-w-[280px]">
                      <span className="text-accent-light text-xs font-mono mr-2">{entry.variantId.slice(0, 12)}…</span>
                    </td>
                    <td className="px-6 py-3 text-right text-muted">${entry.price.toFixed(2)}</td>
                    <td className="px-6 py-3 text-right text-muted">×{entry.qty}</td>
                    <td className="px-6 py-3 text-right font-bold">${entry.lineValue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface rounded-2xl p-5 border border-border">
      <p className="text-muted text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-black">{value}</p>
    </div>
  );
}
