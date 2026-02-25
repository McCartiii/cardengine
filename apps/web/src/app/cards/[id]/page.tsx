"use client";

import { useEffect, useState, use } from "react";
import { api } from "@/lib/api";
import Image from "next/image";
import Link from "next/link";
import { clsx } from "clsx";

interface StorePricing {
  store: string;
  prices: Array<{ label: string; amount: number; currency: string }>;
  buyUrl: string | null;
}

interface CardFull {
  variantId: string;
  name: string;
  setId: string | null;
  collectorNumber: string | null;
  imageUri: string | null;
  manaCost: string | null;
  typeLine: string | null;
  oracleText: string | null;
  colors: string[] | null;
  colorIdentity: string[] | null;
  cmc: number | null;
  rarity: string | null;
  storePricing: StorePricing[];
}

const RARITY_COLOR: Record<string, string> = {
  common:   "#9ca3af",
  uncommon: "#a8d8b9",
  rare:     "#f59e0b",
  mythic:   "#f97316",
  special:  "#a855f7",
};

const inputStyle = {
  background: "#0a0614",
  border: "1px solid #2a1f4a",
  borderRadius: "12px",
  padding: "10px 16px",
  color: "#ede9fe",
  fontSize: "14px",
  outline: "none",
  width: "100%",
};

export default function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [card, setCard]     = useState<CardFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAlert, setShowAlert]       = useState(false);
  const [alertMarket, setAlertMarket]   = useState("TCGplayer");
  const [alertDir, setAlertDir]         = useState<"above" | "below">("below");
  const [alertThreshold, setAlertThreshold] = useState("");
  const [savingAlert, setSavingAlert]   = useState(false);
  const [alertSaved, setAlertSaved]     = useState(false);

  useEffect(() => {
    api.card(decodeURIComponent(id))
      .then(({ card: c }) => setCard(c as unknown as CardFull))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="skeleton h-4 w-24 rounded mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="skeleton rounded-2xl" style={{ aspectRatio: "488/680" }} />
          <div className="space-y-4">
            <div className="skeleton h-8 w-48 rounded" />
            <div className="skeleton h-4 w-32 rounded" />
            <div className="flex gap-2">
              {[0,1,2].map(i => <div key={i} className="skeleton h-8 w-20 rounded-lg" />)}
            </div>
            <div className="skeleton h-32 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center py-32 animate-enter">
        <p className="text-5xl mb-4 opacity-30">🃏</p>
        <p className="text-xl font-bold text-white mb-2">Card not found</p>
        <Link href="/" className="text-sm text-accent-light hover:text-white transition-colors">← Back to Browse</Link>
      </div>
    );
  }

  const rarityColor = RARITY_COLOR[card.rarity ?? ""] ?? "#6b7280";

  return (
    <div className="p-8 max-w-4xl mx-auto animate-enter">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm transition-colors duration-200 mb-8 group"
        style={{ color: "#7c6f9a" }}
        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#ede9fe"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#7c6f9a"; }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to Browse
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Image */}
        <div>
          {card.imageUri ? (
            <div className="relative rounded-2xl overflow-hidden" style={{ boxShadow: `0 0 60px ${rarityColor}33, 0 24px 48px rgba(0,0,0,0.6)` }}>
              <Image src={card.imageUri} alt={card.name} width={488} height={680} className="w-full" unoptimized />
            </div>
          ) : (
            <div className="aspect-[488/680] rounded-2xl flex items-center justify-center text-muted"
              style={{ background: "#110d1f", border: "1px solid #2a1f4a" }}>
              No image
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="text-3xl font-black text-white mb-1">{card.name}</h1>
            {card.typeLine && <p className="text-sm" style={{ color: "#7c6f9a" }}>{card.typeLine}</p>}
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            {card.manaCost && (
              <span className="px-3 py-1 rounded-lg text-sm font-mono"
                style={{ background: "#1a1430", border: "1px solid #2a1f4a", color: "#ede9fe" }}>
                {card.manaCost}
              </span>
            )}
            {card.cmc != null && (
              <span className="px-3 py-1 rounded-lg text-sm"
                style={{ background: "#1a1430", border: "1px solid #2a1f4a", color: "#ede9fe" }}>
                CMC {card.cmc}
              </span>
            )}
            {card.rarity && (
              <span className="px-3 py-1 rounded-lg text-sm font-semibold"
                style={{ color: rarityColor, borderColor: rarityColor + "44", border: "1px solid", backgroundColor: rarityColor + "18" }}>
                {card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1)}
              </span>
            )}
            {card.setId && (
              <span className="px-3 py-1 rounded-lg text-sm"
                style={{ background: "#1a1430", border: "1px solid #2a1f4a", color: "#7c6f9a" }}>
                {card.setId.toUpperCase()} #{card.collectorNumber}
              </span>
            )}
          </div>

          {/* Oracle text */}
          {card.oracleText && (
            <div className="rounded-xl p-4 text-sm leading-relaxed whitespace-pre-line"
              style={{ background: "#110d1f", border: "1px solid #2a1f4a", color: "#ede9fe" }}>
              {card.oracleText}
            </div>
          )}

          {/* Prices */}
          <div>
            <h2 className="font-bold text-white mb-3 text-sm uppercase tracking-wider" style={{ color: "#7c6f9a" }}>Prices</h2>
            <div className="space-y-2.5">
              {card.storePricing?.map((store) => (
                <div key={store.store} className="rounded-xl p-4 flex items-start justify-between transition-all duration-200"
                  style={{ background: "#110d1f", border: "1px solid #2a1f4a" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(139,92,246,0.3)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#2a1f4a"; }}>
                  <div>
                    <p className="font-semibold text-white mb-2 text-sm">{store.store}</p>
                    <div className="flex flex-wrap gap-3">
                      {store.prices.map((p) => (
                        <span key={p.label} className="text-sm">
                          <span style={{ color: "#7c6f9a" }}>{p.label}: </span>
                          <span className="font-bold text-cyan">${p.amount.toFixed(2)}</span>
                        </span>
                      ))}
                      {store.prices.length === 0 && <span className="text-sm" style={{ color: "#7c6f9a" }}>No data</span>}
                    </div>
                  </div>
                  {store.buyUrl && (
                    <a href={store.buyUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-semibold shrink-0 ml-4 transition-colors duration-200"
                      style={{ color: "#c4b5fd" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#ede9fe"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#c4b5fd"; }}>
                      Buy →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Price alert */}
          {!showAlert ? (
            <button
              onClick={() => {
                const best = card.storePricing
                  .flatMap(s => s.prices.filter(p => p.currency === "USD"))
                  .sort((a, b) => a.amount - b.amount)[0];
                if (best) setAlertThreshold(best.amount.toFixed(2));
                setShowAlert(true);
              }}
              className="flex items-center gap-2 text-sm rounded-xl px-4 py-2.5 transition-all duration-200 font-semibold"
              style={{ background: "#1a1430", border: "1px solid #2a1f4a", color: "#7c6f9a" }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(139,92,246,0.4)";
                (e.currentTarget as HTMLButtonElement).style.color = "#c4b5fd";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#2a1f4a";
                (e.currentTarget as HTMLButtonElement).style.color = "#7c6f9a";
              }}
            >
              🔔 Set Price Alert
            </button>
          ) : (
            <div className="rounded-2xl p-5 flex flex-col gap-4 animate-enter"
              style={{ background: "#110d1f", border: "1px solid rgba(139,92,246,0.3)", boxShadow: "0 0 24px rgba(139,92,246,0.08)" }}>
              <h2 className="font-bold text-white">Set Price Alert</h2>

              {/* Market */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#7c6f9a" }}>Market</label>
                <div className="flex gap-2">
                  {["TCGplayer", "Cardmarket"].map(m => (
                    <button key={m} onClick={() => setAlertMarket(m)}
                      className="px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200"
                      style={alertMarket === m
                        ? { background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", color: "#c4b5fd" }
                        : { background: "#1a1430", border: "1px solid #2a1f4a", color: "#7c6f9a" }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Direction */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#7c6f9a" }}>Alert when price is</label>
                <div className="flex gap-2">
                  {(["below", "above"] as const).map(d => (
                    <button key={d} onClick={() => setAlertDir(d)}
                      className="px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200"
                      style={alertDir === d
                        ? { background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", color: "#c4b5fd" }
                        : { background: "#1a1430", border: "1px solid #2a1f4a", color: "#7c6f9a" }}>
                      {d === "below" ? "↓ Below" : "↑ Above"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Threshold */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#7c6f9a" }}>Target price (USD)</label>
                <div className="flex gap-2">
                  <input type="number" step="0.01" min="0" value={alertThreshold}
                    onChange={e => setAlertThreshold(e.target.value)}
                    placeholder="0.00" style={inputStyle}
                    onFocus={e => { (e.target as HTMLInputElement).style.borderColor = "rgba(139,92,246,0.5)"; }}
                    onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "#2a1f4a"; }}
                  />
                  <button
                    disabled={!alertThreshold || savingAlert}
                    onClick={async () => {
                      setSavingAlert(true);
                      try {
                        await api.watchlist.add({
                          variantId: card.variantId,
                          market: alertMarket,
                          thresholdAmount: parseFloat(alertThreshold),
                          direction: alertDir,
                        });
                        setAlertSaved(true);
                        setShowAlert(false);
                      } finally {
                        setSavingAlert(false);
                      }
                    }}
                    className="px-4 py-2.5 rounded-xl font-semibold text-sm text-white transition-all duration-200 disabled:opacity-40 shrink-0"
                    style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)" }}>
                    {savingAlert ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => setShowAlert(false)}
                    className="px-3 py-2.5 text-sm transition-colors duration-200 shrink-0" style={{ color: "#7c6f9a" }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {alertSaved && (
            <p className="text-sm animate-enter" style={{ color: "#6ee7b7" }}>
              ✓ Price alert saved — you&apos;ll be notified when the condition is met.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
