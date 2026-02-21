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
    cards: DeckCard[];
  };
  totalValue: number;
  legality: { valid: boolean; issues: string[] };
}

const SECTION_ORDER = ["commander", "mainboard", "sideboard", "companion"];
const SECTION_LABEL: Record<string, string> = {
  commander: "Commander", mainboard: "Mainboard", sideboard: "Sideboard", companion: "Companion",
};

export default function DeckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<Tab>("cards");
  const [data, setData] = useState<DeckDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [edhrecData, setEdhrecData] = useState<{ commander: string; recommendations: unknown[] } | null>(null);
  const [edhrecLoading, setEdhrecLoading] = useState(false);
  const [aiAdvice, setAiAdvice] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("What are the main weaknesses and top 5 improvements for this deck?");
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  useEffect(() => {
    api.decks.get(id).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (tab === "edhrec" && !edhrecData && !edhrecLoading) {
      setEdhrecLoading(true);
      api.decks.edhrec(id).then(setEdhrecData).catch(() => null).finally(() => setEdhrecLoading(false));
    }
  }, [tab, id, edhrecData, edhrecLoading]);

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

  const handleImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await api.decks.importText(id, importText.trim());
      setImportResult(`✓ Imported ${res.imported} cards. ${res.legality.valid ? "Deck is legal." : res.legality.issues.slice(0, 2).join(" · ")}`);
      setImportText("");
      const updated = await api.decks.get(id);
      setData(updated);
    } catch (e: unknown) {
      setImportResult(`Error: ${(e as Error).message}`);
    } finally {
      setImporting(false);
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black">{deck.name}</h1>
            {deck.commander && <p className="text-accent-light mt-1">{deck.commander}</p>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-2xl font-black">${totalValue.toFixed(2)}</p>
              <p className="text-muted text-xs">{totalCards} cards</p>
            </div>
            <span className={clsx("px-3 py-1 rounded-lg text-sm font-bold border", legality.valid ? "bg-green-900/40 text-green-300 border-green-700" : "bg-red-900/40 text-red-300 border-red-700")}>
              {legality.valid ? "Legal" : `${legality.issues.length} issue${legality.issues.length > 1 ? "s" : ""}`}
            </span>
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
          {/* Import */}
          <div className="bg-surface rounded-2xl border border-border p-4">
            <p className="text-sm font-bold mb-2">Import Decklist</p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={5}
              placeholder={"1 Sol Ring\n1 Command Tower\n4 Lightning Bolt"}
              className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-sm text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/60 font-mono resize-none"
            />
            {importResult && <p className={clsx("text-sm mt-2", importResult.startsWith("✓") ? "text-green-400" : "text-red-400")}>{importResult}</p>}
            <button
              onClick={handleImport}
              disabled={!importText.trim() || importing}
              className="mt-2 px-4 py-2 bg-accent text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-accent/80 transition-colors"
            >
              {importing ? "Importing…" : "Import"}
            </button>
          </div>

          {/* Card list */}
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
    </div>
  );
}
