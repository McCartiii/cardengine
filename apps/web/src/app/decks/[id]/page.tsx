"use client";

import { useEffect, useState, use, useRef, useCallback } from "react";
import { api, type DeckCard } from "@/lib/api";
import { clsx } from "clsx";

type Tab = "cards" | "edhrec" | "ai";
type AiMessage = { role: "user" | "assistant"; content: string };

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

function parseCards(text: string): { name: string; qty: number }[] {
  const match = text.match(/CARDS:\n([\s\S]*?)END_CARDS/);
  if (!match) return [];
  return match[1].split("\n").map(l => l.trim()).filter(Boolean).map(line => {
    const m = line.match(/^(\d+)\s+(.+)$/);
    return m ? { qty: parseInt(m[1]), name: m[2] } : null;
  }).filter(Boolean) as { name: string; qty: number }[];
}

// ── Import Modal ──────────────────────────────────────────────────────────────
function ImportModal({ deckId, onClose, onImported }: { deckId: string; onClose: () => void; onImported: () => void }) {
  const [text, setText] = useState("");
  const [replace, setReplace] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const handleImport = async () => {
    if (!text.trim()) return;
    setImporting(true); setResult(null);
    try {
      const res = await api.decks.importText(deckId, text.trim(), replace);
      const resolved = (res as { resolved?: number; imported: number }).resolved ?? res.imported;
      setResult(`✓ Imported ${res.imported} cards · ${resolved} resolved to prices`);
      onImported();
      setTimeout(onClose, 1200);
    } catch (e: unknown) {
      setResult(`Error: ${(e as Error).message}`);
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl w-full max-w-xl flex flex-col animate-enter" style={{ background: "#0e0a1e", border: "1px solid #2a1f4a", boxShadow: "0 0 80px rgba(139,92,246,0.25)", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Import Decklist</h2>
            <p className="text-xs mt-0.5" style={{ color: "#7c6f9a" }}>Paste your decklist — one card per line</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-xl" style={{ color: "#7c6f9a" }}>×</button>
        </div>
        <div className="flex flex-col gap-4 px-6 pb-6">
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #2a1f4a" }}>
            <button type="button" onClick={() => setShowGuide(v => !v)} className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-semibold" style={{ background: "#0a0614", color: "#9d8ec4" }}>
              <span>Format guide</span><span className="text-xs">{showGuide ? "▲" : "▼"}</span>
            </button>
            {showGuide && (
              <pre className="px-4 py-3 text-xs leading-relaxed" style={{ background: "#07040f", color: "#7c6f9a", fontFamily: "ui-monospace, monospace", borderTop: "1px solid #2a1f4a" }}>
{`Commander
1 Atraxa, Praetors' Voice

1 Sol Ring
4 Lightning Bolt

Sideboard
2 Negate`}
              </pre>
            )}
          </div>
          <textarea autoFocus value={text} onChange={e => setText(e.target.value)} rows={14}
            placeholder="1 Sol Ring&#10;4 Lightning Bolt"
            className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none resize-y"
            style={{ background: "#0a0614", border: "1px solid #2a1f4a", fontFamily: "ui-monospace, monospace", color: "#ede9fe", caretColor: "#c4b5fd" }} />
          <div className="flex items-center gap-2">
            {([true, false] as const).map(r => (
              <button key={String(r)} type="button" onClick={() => setReplace(r)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={replace === r ? { background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", color: "#c4b5fd" } : { background: "transparent", border: "1px solid #2a1f4a", color: "#7c6f9a" }}>
                <span className="w-2 h-2 rounded-full" style={{ background: replace === r ? "#c4b5fd" : "#3a2f5a" }} />
                {r ? "Replace cards" : "Append to existing"}
              </button>
            ))}
          </div>
          {result && <p className="text-sm font-semibold" style={{ color: result.startsWith("✓") ? "#4ade80" : "#fca5a5" }}>{result}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2a1f4a", color: "#7c6f9a" }}>Cancel</button>
            <button type="button" onClick={handleImport} disabled={!text.trim() || importing} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
              {importing ? "Importing…" : replace ? "Replace & Import" : "Append & Import"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AI Chat ────────────────────────────────────────────────────────────────────
function AIChat({ deck }: { deck: DeckDetailData["deck"] }) {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [suggestedCards, setSuggestedCards] = useState<{ name: string; qty: number }[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const deckContext = `Deck: ${deck.name}\nFormat: ${deck.format}\nCommander: ${deck.commander ?? "none"}\nCards (${deck.cards.reduce((s, c) => s + c.quantity, 0)} total):\n${deck.cards.slice(0, 40).map(c => `${c.quantity}x ${c.cardName}`).join("\n")}`;

  const send = useCallback(async () => {
    if (!input.trim() || streaming) return;
    const userMsg: AiMessage = { role: "user", content: input };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);
    setSuggestedCards([]);
    setImportResult(null);
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/architect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, deckContext }),
      });
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              full += JSON.parse(data).text;
              setMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: full }]);
            } catch { /* skip */ }
          }
        }
      }
      const cards = parseCards(full);
      setSuggestedCards(cards);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      setMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: `Error: ${(err as Error).message}` }]);
    } finally {
      setStreaming(false);
    }
  }, [input, messages, streaming, deckContext]);

  async function importToAPI() {
    if (!suggestedCards.length) return;
    setImporting(true);
    try {
      const lines = suggestedCards.map(c => `${c.qty} ${c.name}`).join("\n");
      const res = await api.decks.importText(deck.id, lines, false);
      setImportResult(`✓ Imported ${res.imported} cards (appended)`);
    } catch (e: unknown) {
      setImportResult(`Error: ${(e as Error).message}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col h-[600px]">
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
        {messages.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">🧙</p>
            <p className="text-muted text-sm mb-4">Ask Claude to analyze your deck, suggest improvements, or build a sideboard.</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                "What are the top 5 improvements for this deck?",
                "Suggest a sideboard for this deck",
                "What are the main weaknesses?",
                "How do I pilot this deck?",
              ].map(q => (
                <button key={q} onClick={() => setInput(q)} className="px-3 py-1.5 text-xs rounded-lg transition-colors"
                  style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", color: "#c4b5fd" }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${
              msg.role === "user" ? "bg-accent/10 border border-accent/20 text-white" : "bg-surface border border-border text-white/90"
            }`}>
              {msg.content}
              {i === messages.length - 1 && streaming && (
                <span className="inline-block w-1 h-4 ml-0.5 bg-accent animate-pulse" />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {suggestedCards.length > 0 && !streaming && (
        <div className="mb-3">
          {importResult
            ? <p className="text-sm font-semibold" style={{ color: importResult.startsWith("✓") ? "#4ade80" : "#fca5a5" }}>{importResult}</p>
            : <button onClick={importToAPI} disabled={importing} className="w-full py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "#00d4ff" }}>
                {importing ? "Importing…" : `+ Append ${suggestedCards.length} card types to deck`}
              </button>
          }
        </div>
      )}

      <div className="flex gap-2">
        <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Ask about your deck…" disabled={streaming}
          className="flex-1 bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm placeholder:text-muted focus:outline-none focus:border-accent transition-all disabled:opacity-60" />
        <button onClick={send} disabled={streaming || !input.trim()} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
          {streaming ? "…" : "Ask"}
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function DeckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<Tab>("cards");
  const [data, setData] = useState<DeckDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [edhrecData, setEdhrecData] = useState<{ commander: string; recommendations: unknown[] } | null>(null);
  const [edhrecLoading, setEdhrecLoading] = useState(false);

  const reload = () => { api.decks.get(id).then(setData).catch(console.error); };

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
      setData(d => d ? { ...d, deck: { ...d.deck, isPublic: next } } : d);
      if (next) {
        const shareUrl = `${window.location.origin}/decks/${id}/share`;
        await navigator.clipboard.writeText(shareUrl);
        window.alert(`Deck is now public!\nShare link: ${shareUrl}`);
      }
    } catch { window.alert("Failed to update visibility."); }
  };

  if (loading) return <div className="p-8 text-muted animate-pulse">Loading deck…</div>;
  if (!data) return <div className="p-8 text-red-400">Deck not found.</div>;

  const { deck, totalValue, legality } = data;
  const sections = SECTION_ORDER
    .map(s => ({ key: s, label: SECTION_LABEL[s], cards: deck.cards.filter(c => c.section === s) }))
    .filter(s => s.cards.length > 0);
  const totalCards = deck.cards.reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div className="p-8 max-w-5xl mx-auto">
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
            <span className={clsx("px-3 py-1 rounded-lg text-sm font-bold border",
              legality.valid ? "bg-green-900/40 text-green-300 border-green-700" : "bg-red-900/40 text-red-300 border-red-700")}>
              {legality.valid ? "Legal" : `${legality.issues.length} issue${legality.issues.length > 1 ? "s" : ""}`}
            </span>
            <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold"
              style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd" }}>
              ↑ Import
            </button>
            <button onClick={handleTogglePublic} className={clsx("p-2 rounded-lg border transition-colors",
              deck.isPublic ? "bg-accent/20 border-accent text-accent-light" : "bg-surface border-border text-muted hover:border-accent/60 hover:text-white")}>
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

      <div className="flex gap-1 mb-6 bg-surface rounded-xl p-1 w-fit border border-border">
        {(["cards", "edhrec", "ai"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={clsx("px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
            tab === t ? "bg-accent text-white" : "text-muted hover:text-white")}>
            {t === "cards" ? "Cards" : t === "edhrec" ? "EDHRec" : "✨ AI Architect"}
          </button>
        ))}
      </div>

      {tab === "cards" && (
        <div className="space-y-6">
          {sections.length === 0 && (
            <div className="py-20 text-center rounded-2xl" style={{ border: "1px dashed #2a1f4a" }}>
              <p className="text-4xl mb-3">🃏</p>
              <p className="font-bold text-white mb-1">No cards yet</p>
              <p className="text-sm" style={{ color: "#7c6f9a" }}>Click <strong style={{ color: "#c4b5fd" }}>↑ Import</strong> to paste a decklist</p>
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
                }>).filter(r => !r.alreadyInDeck).slice(0, 30).map(rec => (
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

      {tab === "ai" && <AIChat deck={deck} />}

      {showImport && <ImportModal deckId={id} onClose={() => setShowImport(false)} onImported={reload} />}
    </div>
  );
}
