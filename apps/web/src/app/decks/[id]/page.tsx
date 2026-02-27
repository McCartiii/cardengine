"use client";

import { useEffect, useState, use } from "react";
import { api, type DeckCard } from "@/lib/api";
import { clsx } from "clsx";

type Tab = "cards" | "edhrec" | "ai";

interface DeckDetailData {
  deck: {
    id: string;
    name: string;
    format: string;
    commander: string | null;
    isPublic: boolean;
    cards: DeckCard[];
  };
  totalValue: number;
  legality: { valid: boolean; issues: string[] };
}

const SECTION_ORDER = ["commander", "mainboard", "sideboard", "companion"];
const SECTION_LABEL: Record<string, string> = {
  commander: "Commander", mainboard: "Mainboard", sideboard: "Sideboard", companion: "Companion",
};

const IMPORT_PLACEHOLDER = `Commander
1 Atraxa, Praetors' Voice

1 Sol Ring
1 Command Tower
4 Lightning Bolt

Sideboard
2 Negate`;

// ── Import Modal ─────────────────────────────────────────────────────────────

function ImportModal({
  deckId,
  onClose,
  onImported,
}: {
  deckId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [text, setText]           = useState("");
  const [replace, setReplace]     = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const handleImport = async () => {
    if (!text.trim()) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await api.decks.importText(deckId, text.trim(), replace);
      const resolved = res.resolved ?? res.imported;
      setResult(`✓ Imported ${res.imported} cards · ${resolved} resolved to prices`);
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
        className="rounded-2xl w-full max-w-xl flex flex-col animate-enter"
        style={{
          background: "#0e0a1e",
          border: "1px solid #2a1f4a",
          boxShadow: "0 0 80px rgba(139,92,246,0.25)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Import Decklist</h2>
            <p className="text-xs mt-0.5" style={{ color: "#7c6f9a" }}>Paste your decklist — one card per line</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-xl transition-colors"
            style={{ color: "#7c6f9a" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#7c6f9a"; }}
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 pb-6">
          {/* Format guide (collapsible) */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #2a1f4a" }}>
            <button
              type="button"
              onClick={() => setShowGuide(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-semibold transition-colors"
              style={{ background: "#0a0614", color: "#9d8ec4" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#c4b5fd"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#9d8ec4"; }}
            >
              <span>Format guide</span>
              <span className="text-xs">{showGuide ? "▲" : "▼"}</span>
            </button>
            {showGuide && (
              <pre
                className="px-4 py-3 text-xs leading-relaxed"
                style={{ background: "#07040f", color: "#7c6f9a", fontFamily: "ui-monospace, monospace", borderTop: "1px solid #2a1f4a" }}
              >{`Commander
1 Atraxa, Praetors' Voice

Mainboard        ← default section
1 Sol Ring
4 Lightning Bolt
4x Counterspell

Sideboard
2 Negate

# Lines starting with # or // are ignored
# Set codes are stripped: "1 Sol Ring (CMM) 318"`}</pre>
            )}
          </div>

          {/* Textarea */}
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            rows={14}
            placeholder={IMPORT_PLACEHOLDER}
            className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none resize-y"
            style={{
              background: "#0a0614",
              border: "1px solid #2a1f4a",
              fontFamily: "ui-monospace, monospace",
              lineHeight: "1.65",
              color: "#ede9fe",
              caretColor: "#c4b5fd",
            }}
            onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = "rgba(139,92,246,0.5)"; }}
            onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = "#2a1f4a"; }}
          />

          {/* Replace / Append toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReplace(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
              style={replace
                ? { background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", color: "#c4b5fd" }
                : { background: "transparent", border: "1px solid #2a1f4a", color: "#7c6f9a" }
              }
            >
              <span className="w-2 h-2 rounded-full" style={{ background: replace ? "#c4b5fd" : "#3a2f5a" }} />
              Replace cards
            </button>
            <button
              type="button"
              onClick={() => setReplace(false)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
              style={!replace
                ? { background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", color: "#c4b5fd" }
                : { background: "transparent", border: "1px solid #2a1f4a", color: "#7c6f9a" }
              }
            >
              <span className="w-2 h-2 rounded-full" style={{ background: !replace ? "#c4b5fd" : "#3a2f5a" }} />
              Append to existing
            </button>
          </div>

          {/* Result */}
          {result && (
            <p className="text-sm font-semibold" style={{ color: result.startsWith("✓") ? "#4ade80" : "#fca5a5" }}>
              {result}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-200"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2a1f4a", color: "#7c6f9a" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!text.trim() || importing}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-200 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
            >
              {importing ? "Importing…" : replace ? "Replace & Import" : "Append & Import"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DeckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab]             = useState<Tab>("cards");
  const [data, setData]           = useState<DeckDetailData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [edhrecData, setEdhrecData] = useState<{ commander: string; recommendations: unknown[] } | null>(null);
  const [edhrecLoading, setEdhrecLoading] = useState(false);
  const [aiAdvice, setAiAdvice]   = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("What are the main weaknesses and top 5 improvements for this deck?");

  const reload = () => {
    api.decks.get(id).then(setData).catch(console.error);
  };

  useEffect(() => {
    api.decks.get(id).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (tab === "edhrec" && !edhrecData && !edhrecLoading) {
      setEdhrecLoading(true);
      api.decks.edhrec(id).then(setEdhrecData).catch(() => null).finally(() => setEdhrecLoading(false));
    }
  }, [tab, id, edhrecData, edhrecLoading]);

  const handleTogglePublic = async () => {
    if (!data) return;
    const next = !data.deck.isPublic;
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
      const res = await fetch(`${API_BASE}/v1/decks/${id}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${(await import("@/lib/api")).getToken() ?? ""}` },
        body: JSON.stringify({ isPublic: next }),
      });
      if (!res.ok) throw new Error("Failed");
      setData((d) => d ? { ...d, deck: { ...d.deck, isPublic: next } } : d);
      if (next) {
        const shareUrl = `${window.location.origin}/decks/${id}/share`;
        await navigator.clipboard.writeText(shareUrl);
        window.alert(`Deck is now public!\nShare link copied to clipboard:\n${shareUrl}`);
      }
    } catch {
      window.alert("Failed to update visibility.");
    }
  };

  const handleAiAdvice = async () => {
    setAiLoading(true);
    setAiAdvice("");
    try {
      const { advice } = await api.decks.aiAdvice(id, aiQuestion);
      setAiAdvice(advice);
    } catch (e: unknown) {
      setAiAdvice(`Error: ${(e as Error).message}`);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-muted animate-pulse">Loading deck…</div>;
  if (!data) return <div className="p-8 text-red-400">Deck not found.</div>;

  const { deck, totalValue, legality } = data;
  const sections = SECTION_ORDER
    .map((s) => ({ key: s, label: SECTION_LABEL[s], cards: deck.cards.filter((c) => c.section === s) }))
    .filter((s) => s.cards.length > 0);
  const totalCards = deck.cards.reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-black">{deck.name}</h1>
            {deck.commander && <p className="text-accent-light mt-1">{deck.commander}</p>}
          </div>
          <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
            <div className="text-right">
              <p className="text-2xl font-black">${totalValue.toFixed(2)}</p>
              <p className="text-muted text-xs">{totalCards} cards</p>
            </div>
            <span className={clsx(
              "px-3 py-1 rounded-lg text-sm font-bold border",
              legality.valid ? "bg-green-900/40 text-green-300 border-green-700" : "bg-red-900/40 text-red-300 border-red-700"
            )}>
              {legality.valid ? "Legal" : `${legality.issues.length} issue${legality.issues.length > 1 ? "s" : ""}`}
            </span>
            {/* Import button */}
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200"
              style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd" }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(139,92,246,0.22)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(139,92,246,0.55)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(139,92,246,0.12)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(139,92,246,0.3)";
              }}
            >
              ↑ Import
            </button>
            <button
              onClick={handleTogglePublic}
              title={deck.isPublic ? "Deck is public — click to make private" : "Make deck public & copy share link"}
              className={clsx(
                "p-2 rounded-lg border transition-colors",
                deck.isPublic
                  ? "bg-accent/20 border-accent text-accent-light"
                  : "bg-surface border-border text-muted hover:border-accent/60 hover:text-white"
              )}
            >
              {deck.isPublic ? "🔗 Public" : "🔒 Private"}
            </button>
          </div>
        </div>
        {!legality.valid && (
          <ul className="mt-3 text-sm text-red-400 list-disc list-inside">
            {legality.issues.slice(0, 5).map((issue, i) => <li key={i}>{issue}</li>)}
          </ul>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-surface rounded-xl p-1 w-fit border border-border">
        {(["cards", "edhrec", "ai"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx("px-4 py-2 rounded-lg text-sm font-semibold transition-colors", tab === t ? "bg-accent text-white" : "text-muted hover:text-white")}
          >
            {t === "cards" ? "Cards" : t === "edhrec" ? "EDHRec" : "AI Advice"}
          </button>
        ))}
      </div>

      {/* Cards tab */}
      {tab === "cards" && (
        <div className="space-y-6">
          {sections.length === 0 && (
            <div className="py-20 text-center rounded-2xl" style={{ border: "1px dashed #2a1f4a" }}>
              <p className="text-4xl mb-3">🃏</p>
              <p className="font-bold text-white mb-1">No cards yet</p>
              <p className="text-sm" style={{ color: "#7c6f9a" }}>
                Click <strong style={{ color: "#c4b5fd" }}>↑ Import</strong> to paste a decklist
              </p>
            </div>
          )}
          {sections.map(({ key, label, cards }) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">{label}</h3>
                <span className="text-xs text-muted">({cards.reduce((s, c) => s + c.quantity, 0)})</span>
              </div>
              <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                {cards.map((card, i) => (
                  <div key={card.id} className={clsx("flex items-center gap-4 px-4 py-3", i > 0 && "border-t border-border")}>
                    <span className="text-accent font-bold text-sm w-5 text-right shrink-0">{card.quantity}</span>
                    <span className="flex-1 font-medium text-sm">{card.cardName}</span>
                    <span className="text-muted text-sm">{card.price != null ? `$${card.price.toFixed(2)}` : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* EDHRec tab */}
      {tab === "edhrec" && (
        <div>
          {edhrecLoading && <p className="text-muted animate-pulse">Loading EDHRec data…</p>}
          {!edhrecLoading && !edhrecData && (
            <div className="py-16 text-center text-muted">
              <p className="text-4xl mb-3">🧙</p>
              <p>No commander set or commander not found on EDHRec.</p>
            </div>
          )}
          {edhrecData && (
            <div>
              <h2 className="text-xl font-bold mb-4">{edhrecData.commander} — Recommendations</h2>
              <div className="space-y-2">
                {(edhrecData.recommendations as Array<{
                  name: string; synergy: number; inclusion: number;
                  primary_type: string; cmc: number; price_usd: number | null; alreadyInDeck: boolean;
                }>).filter((r) => !r.alreadyInDeck).slice(0, 30).map((rec) => (
                  <div key={rec.name} className="flex items-center gap-4 bg-surface rounded-xl border border-border px-4 py-3">
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{rec.name}</p>
                      <p className="text-muted text-xs">{rec.primary_type} · CMC {rec.cmc}</p>
                    </div>
                    <span className="text-green-400 text-sm font-bold">+{rec.synergy}%</span>
                    <span className="text-muted text-sm">{rec.inclusion}%</span>
                    <span className="text-sm font-semibold">{rec.price_usd != null ? `$${rec.price_usd.toFixed(2)}` : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI tab */}
      {tab === "ai" && (
        <div className="space-y-4 max-w-2xl">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-muted uppercase tracking-wider">Question</label>
            <textarea
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              rows={3}
              className="bg-surface border border-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/60 resize-none"
            />
          </div>
          <button
            onClick={handleAiAdvice}
            disabled={aiLoading}
            className="flex items-center gap-2 px-5 py-3 bg-accent text-white rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-accent/80 transition-colors"
          >
            ✨ {aiLoading ? "Thinking…" : "Get AI Advice"}
          </button>
          {aiAdvice && (
            <div className="bg-surface border border-border rounded-2xl p-5 text-sm leading-relaxed whitespace-pre-wrap">
              {aiAdvice}
            </div>
          )}
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <ImportModal
          deckId={id}
          onClose={() => setShowImport(false)}
          onImported={reload}
        />
      )}
    </div>
  );
}
