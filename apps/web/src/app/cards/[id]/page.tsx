"use client";

import { use } from "react";
import { useAuth } from "@/components/AuthProvider";
import { HoloCard } from "@/components/HoloCard";
import useSWR from "swr";
import { api, type CardVariant } from "@/lib/api";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const RARITY_COLOR: Record<string, string> = {
  common: "#8ca0b8", uncommon: "#50c878", rare: "#0096ff", mythic: "#ff5000", special: "#cc44ff",
};

interface StorePricing { store: string; condition: string; priceUsd: number; stock: number; url?: string; }
interface CardDetail extends CardVariant { storePricing: StorePricing[]; }

export default function CardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const variantId = decodeURIComponent(id);
  const { user } = useAuth();

  const { data, error, isLoading } = useSWR<{ card: CardDetail }>(
    variantId ? `card-${variantId}` : null, () => api.card(variantId)
  );

  const [alertThreshold, setAlertThreshold] = useState("");
  const [alertDirection, setAlertDirection] = useState<"above" | "below">("below");
  const [alertAdding, setAlertAdding]       = useState(false);
  const [alertSaved, setAlertSaved]         = useState(false);

  const card = data?.card;

  async function addAlert() {
    if (!card || !alertThreshold) return;
    setAlertAdding(true);
    try {
      await api.watchlist.add({ variantId: card.variantId, market: "tcgplayer", thresholdAmount: parseFloat(alertThreshold), direction: alertDirection });
      setAlertSaved(true); setTimeout(() => setAlertSaved(false), 3000);
    } finally { setAlertAdding(false); }
  }

  if (isLoading) return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="skeleton h-6 w-32 rounded mb-8" />
      <div className="flex gap-8">
        <div className="skeleton w-72 h-96 rounded-2xl shrink-0" />
        <div className="flex-1 space-y-4">
          <div className="skeleton h-8 w-64 rounded" />
          <div className="skeleton h-32 rounded-2xl" />
          <div className="skeleton h-48 rounded-2xl" />
        </div>
      </div>
    </div>
  );

  if (error || !card) return (
    <div className="p-8 max-w-6xl mx-auto">
      <Link href="/" className="text-sm mb-6 inline-flex items-center gap-2" style={{ color: "#3d5068" }}>← Back</Link>
      <div className="glass rounded-2xl p-8 text-center mt-8" style={{ color: "#ff6bad" }}>Card not found.</div>
    </div>
  );

  const rarityColor = RARITY_COLOR[card.rarity ?? ""] ?? "#3d5068";

  return (
    <div className="p-8 max-w-6xl mx-auto animate-enter">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm mb-8 transition-colors" style={{ color: "#3d5068" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#00d4ff"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#3d5068"; }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 5-7 7 7 7"/></svg>
        Back to search
      </Link>

      <div className="flex flex-col lg:flex-row gap-10">
        <div className="shrink-0 w-full lg:w-72">
          <HoloCard rarity={card.rarity ?? "common"} className="rounded-3xl w-full max-w-[290px] mx-auto lg:mx-0">
            <div style={{ borderRadius: "1.5rem", overflow: "hidden", border: "1px solid #1e2d45" }}>
              {card.imageUri ? (
                <Image src={card.imageUri} alt={card.name} width={290} height={405} className="w-full" unoptimized priority />
              ) : (
                <div className="aspect-[244/340] flex items-center justify-center" style={{ background: "#0d1220" }}>
                  <span className="text-5xl opacity-20">&#127183;</span>
                </div>
              )}
            </div>
          </HoloCard>
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: rarityColor, boxShadow: `0 0 6px ${rarityColor}` }} />
            <span className="text-xs font-semibold capitalize" style={{ color: rarityColor }}>{card.rarity ?? "unknown"}</span>
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-5">
          <div>
            <h1 className="font-display font-extrabold text-3xl text-white leading-tight mb-1">{card.name}</h1>
            <div className="flex items-center gap-3 flex-wrap">
              {card.setId && <span className="text-xs font-medium uppercase tracking-wider px-2.5 py-1 rounded-lg" style={{ background: "rgba(0,212,255,0.08)", color: "#00d4ff", border: "1px solid rgba(0,212,255,0.15)" }}>{card.setId}</span>}
              {card.collectorNumber && <span className="text-xs" style={{ color: "#3d5068" }}>#{card.collectorNumber}</span>}
              {card.manaCost && <span className="text-sm font-mono" style={{ color: "#8ca0b8" }}>{card.manaCost}</span>}
            </div>
          </div>

          <div className="glass rounded-2xl p-5 space-y-3" style={{ border: "1px solid rgba(0,212,255,0.08)" }}>
            {card.typeLine && <p className="text-sm font-semibold text-white">{card.typeLine}</p>}
            {card.oracleText && <p className="text-sm leading-relaxed" style={{ color: "#8ca0b8" }}>{card.oracleText}</p>}
            <div className="flex items-center gap-4 pt-1">
              {card.cmc != null && <div><span className="text-xs" style={{ color: "#3d5068" }}>CMC </span><span className="text-sm font-bold text-white">{card.cmc}</span></div>}
              {card.colors && card.colors.length > 0 && <div><span className="text-xs" style={{ color: "#3d5068" }}>Colors </span><span className="text-sm font-bold text-white">{card.colors.join(", ")}</span></div>}
            </div>
          </div>

          {card.priceUsd != null && (
            <div className="glass rounded-2xl p-5" style={{ border: "1px solid rgba(0,212,255,0.1)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#3d5068" }}>Market Price</p>
              <p className="font-display font-extrabold text-4xl" style={{ color: "#00d4ff" }}>
                ${card.priceUsd.toFixed(2)}<span className="text-sm font-normal ml-2" style={{ color: "#3d5068" }}>USD</span>
              </p>
            </div>
          )}

          {card.storePricing && card.storePricing.length > 0 && (
            <div className="glass rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(0,212,255,0.08)" }}>
              <p className="px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "#3d5068", borderBottom: "1px solid rgba(0,212,255,0.06)" }}>Store Listings</p>
              <table className="w-full text-sm">
                <tbody>
                  {card.storePricing.map((listing, i) => (
                    <tr key={i} style={{ borderBottom: i < card.storePricing.length - 1 ? "1px solid rgba(0,212,255,0.04)" : "none" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(0,212,255,0.03)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}>
                      <td className="px-5 py-3 font-medium text-white">{listing.store}</td>
                      <td className="px-5 py-3" style={{ color: "#3d5068" }}>{listing.condition}</td>
                      <td className="px-5 py-3" style={{ color: "#3d5068" }}>x{listing.stock}</td>
                      <td className="px-5 py-3 text-right font-bold" style={{ color: "#00d4ff" }}>
                        {listing.url ? <a href={listing.url} target="_blank" rel="noopener noreferrer" className="hover:underline">${listing.priceUsd.toFixed(2)}</a> : <span>${listing.priceUsd.toFixed(2)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {user && (
            <div className="glass rounded-2xl p-5" style={{ border: "1px solid rgba(255,0,128,0.1)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#3d5068" }}>Set Price Alert</p>
              <div className="flex gap-3 flex-wrap">
                <select value={alertDirection} onChange={(e) => setAlertDirection(e.target.value as "above" | "below")}
                  className="bg-transparent text-sm focus:outline-none py-2 px-3 rounded-xl" style={{ border: "1px solid rgba(255,0,128,0.2)", color: "#ff0080" }}>
                  <option value="below" style={{ background: "#0d1220" }}>Below</option>
                  <option value="above" style={{ background: "#0d1220" }}>Above</option>
                </select>
                <input type="number" value={alertThreshold} onChange={(e) => setAlertThreshold(e.target.value)} placeholder="0.00" step="0.01" min="0"
                  className="flex-1 min-w-0 bg-transparent text-white text-sm focus:outline-none py-2.5"
                  style={{ borderBottom: "1px solid rgba(255,0,128,0.25)", caretColor: "#ff0080" }} />
                <button onClick={addAlert} disabled={alertAdding || !alertThreshold} className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                  style={{ background: alertThreshold ? "rgba(255,0,128,0.1)" : "rgba(30,45,69,0.5)", color: alertThreshold ? "#ff0080" : "#3d5068", border: `1px solid ${alertThreshold ? "rgba(255,0,128,0.25)" : "#1e2d45"}` }}>
                  {alertAdding ? "…" : "Add Alert"}
                </button>
              </div>
              {alertSaved && <p className="text-xs mt-3" style={{ color: "#50c878" }}>Alert saved!</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
