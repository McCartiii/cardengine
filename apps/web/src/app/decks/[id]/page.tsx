"use client";

import { useEffect, useState, use, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { NavBar } from "@/components/ui/NavBar";
import { HeroBanner } from "./HeroBanner";
import { DeckSidebar } from "./DeckSidebar";
import { CardListPanel } from "./CardListPanel";
import { computeStats, RichCard } from "./deck-helpers";
import { AIArchitectTab } from "./AIArchitectTab";
import type { User } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = "cards" | "advisor" | "ai";

interface DeckDetailData {
  deck: {
    id: string;
    name: string;
    format: string;
    commander: string | null;
    isPublic: boolean;
    cards: RichCard[];
  };
  totalValue: number;
  legality: { valid: boolean; issues: string[] };
}


// ── Import Modal ──────────────────────────────────────────────────────────────
function ImportModal({
  deckId,
  onClose,
  onImported,
}: {
  deckId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [replace, setReplace] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const handleImport = async () => {
    if (!text.trim()) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await api.decks.importText(deckId, text.trim(), replace);
      const resolved = (res as { resolved?: number; imported: number }).resolved ?? res.imported;
      setResult(`✓ Imported ${res.imported} cards · ${resolved} resolved`);
      onImported();
      setTimeout(onClose, 1200);
    } catch (e: unknown) {
      setResult(`Error: ${(e as Error).message}`);
      setImporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-2xl w-full max-w-xl flex flex-col"
        style={{ background: "#161B27", border: "1px solid #1E2535", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Import Decklist</h2>
            <p className="text-xs mt-0.5 text-text-muted">Paste your decklist — one card per line</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-xl text-text-muted hover:text-white transition-colors"
          >
            ×
          </button>
        </div>
        <div className="flex flex-col gap-4 px-6 pb-6">
          <div className="rounded-xl overflow-hidden border border-border">
            <button
              onClick={() => setShowGuide(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-text-muted hover:text-white transition-colors"
              style={{ background: "#0F1117" }}
            >
              <span>Format guide</span>
              <span className="text-xs">{showGuide ? "▲" : "▼"}</span>
            </button>
            {showGuide && (
              <pre
                className="px-4 py-3 text-xs leading-relaxed border-t border-border"
                style={{ background: "#0F1117", color: "#64748b", fontFamily: "ui-monospace, monospace" }}
              >
{`Commander
1 Atraxa, Praetors' Voice

1 Sol Ring
4 Lightning Bolt

Sideboard
2 Negate`}
              </pre>
            )}
          </div>
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            rows={14}
            placeholder="1 Sol Ring&#10;4 Lightning Bolt"
            className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none resize-y border border-border bg-surface text-white placeholder:text-text-muted focus:border-accent transition-colors"
            style={{ fontFamily: "ui-monospace, monospace" }}
          />
          <div className="flex items-center gap-2">
            {([true, false] as const).map(r => (
              <button
                key={String(r)}
                onClick={() => setReplace(r)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={
                  replace === r
                    ? { background: "rgba(13,148,136,0.15)", border: "1px solid rgba(13,148,136,0.4)", color: "#0D9488" }
                    : { background: "transparent", border: "1px solid #1E2535", color: "#64748b" }
                }
              >
                <span className="w-2 h-2 rounded-full" style={{ background: replace === r ? "#0D9488" : "#1E2535" }} />
                {r ? "Replace cards" : "Append to existing"}
              </button>
            ))}
          </div>
          {result && (
            <p className="text-sm font-semibold" style={{ color: result.startsWith("✓") ? "#4ade80" : "#f87171" }}>
              {result}
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-border text-text-muted hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!text.trim() || importing}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-colors"
              style={{ background: "#0D9488" }}
            >
              {importing ? "Importing…" : replace ? "Replace & Import" : "Append & Import"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Advisor (EDHRec) Tab ──────────────────────────────────────────────────────
function AdvisorTab({ deck }: { deck: DeckDetailData["deck"] }) {
  const [commanderInput, setCommanderInput] = useState(deck.commander ?? "");
  const [edhrecData, setEdhrecData] = useState<{ commander: string; recommendations: unknown[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (name: string) => {
      if (!name.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const data = await api.decks.edhrec(deck.id, name.trim());
        setEdhrecData(data);
      } catch (e: unknown) {
        const msg = (e as { message?: string }).message ?? "Failed to load";
        setError(msg.includes("not found") ? `"${name}" not found on EDHRec.` : msg);
      } finally {
        setLoading(false);
      }
    },
    [deck.id],
  );

  useEffect(() => {
    if (deck.commander) load(deck.commander);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <input
          value={commanderInput}
          onChange={e => setCommanderInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && load(commanderInput)}
          placeholder="Commander name (e.g. Atraxa, Praetors' Voice)"
          className="flex-1 bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
        />
        <button
          onClick={() => load(commanderInput)}
          disabled={loading || !commanderInput.trim()}
          className="px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-colors"
          style={{ background: "#0D9488" }}
        >
          {loading ? "Loading…" : "Look up"}
        </button>
      </div>

      {error && (
        <div
          className="py-6 text-center rounded-xl mb-4 border"
          style={{ background: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.15)" }}
        >
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {loading && <p className="text-text-muted animate-pulse text-sm">Fetching EDHRec data…</p>}

      {edhrecData && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">{edhrecData.commander} — Recommendations</h2>
            <span className="text-xs text-text-muted">
              {(edhrecData.recommendations as unknown[]).filter(
                (r: unknown) => !(r as { alreadyInDeck: boolean }).alreadyInDeck,
              ).length}{" "}
              new cards
            </span>
          </div>
          <div className="space-y-2">
            {(
              edhrecData.recommendations as Array<{
                name: string;
                synergy: number;
                inclusion: number;
                primary_type: string;
                cmc: number;
                price_usd: number | null;
                alreadyInDeck: boolean;
              }>
            )
              .filter(r => !r.alreadyInDeck)
              .slice(0, 40)
              .map(rec => (
                <div
                  key={rec.name}
                  className="flex items-center gap-4 bg-surface rounded-xl border border-border px-4 py-3 hover:border-accent/30 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-white">{rec.name}</p>
                    <p className="text-text-muted text-xs">
                      {rec.primary_type} · CMC {rec.cmc}
                    </p>
                  </div>
                  <span className="text-green-400 text-sm font-bold">+{rec.synergy}%</span>
                  <span className="text-text-muted text-xs">{rec.inclusion}% decks</span>
                  <span className="text-sm font-semibold text-accent">
                    {rec.price_usd != null ? `$${rec.price_usd.toFixed(2)}` : "—"}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {!loading && !edhrecData && !error && (
        <div className="py-16 text-center text-text-muted">
          <p className="text-4xl mb-3">🧙</p>
          <p className="text-sm">Enter a commander name and click Look up</p>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DeckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>("cards");
  const [data, setData] = useState<DeckDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => setUser(user));
  }, []);

  const reload = () => {
    api.decks.get(id).then(d => setData(d as DeckDetailData)).catch(console.error);
  };

  useEffect(() => {
    api.decks.get(id)
      .then(d => setData(d as DeckDetailData))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const handleTogglePublic = async () => {
    if (!data) return;
    const next = !data.deck.isPublic;
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
      const res = await fetch(`${API_BASE}/v1/decks/${id}/visibility`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await import("@/lib/api")).getToken() ?? ""}`,
        },
        body: JSON.stringify({ isPublic: next }),
      });
      if (!res.ok) throw new Error("Failed");
      setData(d => (d ? { ...d, deck: { ...d.deck, isPublic: next } } : d));
      if (next) {
        const shareUrl = `${window.location.origin}/decks/${id}/share`;
        await navigator.clipboard.writeText(shareUrl);
        window.alert(`Deck is now public!\nShare link: ${shareUrl}`);
      }
    } catch {
      window.alert("Failed to update visibility.");
    }
  };

  const stats = useMemo(() => {
    if (!data) return null;
    return computeStats(data.deck.cards, data.totalValue);
  }, [data]);

  const featuredCards = useMemo(() => {
    if (!data) return [];
    return data.deck.cards.filter(c => c.variant?.imageUri).slice(0, 5);
  }, [data]);

  const colorIdentity = useMemo(() => {
    if (!data) return [];
    const colors = new Set<string>();
    for (const card of data.deck.cards) {
      for (const c of card.variant?.colors ?? []) colors.add(c);
    }
    return ["W", "U", "B", "R", "G"].filter(c => colors.has(c));
  }, [data]);

  if (loading) {
    return (
      <>
        <NavBar user={user} />
        <div className="p-8 text-text-muted animate-pulse">Loading deck…</div>
      </>
    );
  }
  if (!data || !stats) {
    return (
      <>
        <NavBar user={user} />
        <div className="p-8 text-red-400">Deck not found.</div>
      </>
    );
  }

  const { deck, totalValue, legality } = data;

  return (
    <div className="min-h-screen" style={{ background: "#090D14" }}>
      <NavBar user={user} />

      <HeroBanner
        name={deck.name}
        commander={deck.commander}
        format={deck.format}
        isPublic={deck.isPublic}
        totalCards={stats.totalCards}
        totalValue={totalValue}
        avgCmc={stats.avgCmc}
        legality={legality}
        colorIdentity={colorIdentity}
        featuredCards={featuredCards}
      />

      {/* Tab bar */}
      <div
        className="sticky border-b border-border px-6 flex items-center gap-1"
        style={{ top: 52, zIndex: 40, background: "rgba(22,27,39,0.98)", backdropFilter: "blur(12px)" }}
      >
        {(
          [
            { key: "cards" as Tab,   label: "Cards" },
            { key: "advisor" as Tab, label: "Advisor" },
            { key: "ai" as Tab,      label: "AI Architect" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-4 py-3.5 text-sm font-semibold transition-all border-b-2 -mb-px"
            style={{
              color: tab === key ? "#14B8A6" : "#475569",
              borderBottomColor: tab === key ? "#14B8A6" : "transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {tab === "cards" && (
          <div className="flex gap-6 items-start">
            <CardListPanel
              cards={deck.cards}
              onOpenImport={() => setShowImport(true)}
              onTogglePublic={handleTogglePublic}
              deckName={deck.name}
              isPublic={deck.isPublic}
            />
            <DeckSidebar stats={stats} />
          </div>
        )}
        {tab === "advisor" && (
          <div className="max-w-4xl">
            <AdvisorTab deck={deck} />
          </div>
        )}
        {tab === "ai" && (
          <div className="max-w-3xl">
            <AIArchitectTab deck={deck} totalValue={totalValue} />
          </div>
        )}
      </div>

      {showImport && (
        <ImportModal deckId={id} onClose={() => setShowImport(false)} onImported={reload} />
      )}
    </div>
  );
}
