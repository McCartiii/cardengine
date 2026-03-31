"use client";

import { useEffect, useState, use, useRef, useCallback } from "react";
import { api, type DeckCard } from "@/lib/api";
import { clsx } from "clsx";

type Tab = "cards" | "edhrec" | "ai";
type AiMessage = { role: "user" | "assistant"; content: string };
type CollectionMode = "collection" | "mix" | "new";
type ViewMode = "list" | "art" | "artname";
type GroupBy = "section" | "type";

interface RichCard extends DeckCard {
  variant?: {
    imageUri: string | null;
    typeLine: string | null;
    manaCost: string | null;
    colors: string[] | null;
    cmc: number | null;
    rarity: string | null;
  } | null;
}

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

const SECTION_ORDER = ["commander", "mainboard", "sideboard", "companion"];
const SECTION_LABEL: Record<string, string> = {
  commander: "Commander", mainboard: "Mainboard", sideboard: "Sideboard", companion: "Companion",
};

const TYPE_ORDER = ["Commander", "Creature", "Planeswalker", "Instant", "Sorcery", "Artifact", "Enchantment", "Land", "Other"];
const TYPE_COLORS: Record<string, string> = {
  Commander: "#a855f7", Creature: "#22c55e", Planeswalker: "#f59e0b",
  Instant: "#00d4ff", Sorcery: "#3b82f6", Artifact: "#94a3b8",
  Enchantment: "#ec4899", Land: "#78716c", Other: "#6b7280",
};

function getCardType(typeLine: string | null | undefined): string {
  if (!typeLine) return "Other";
  if (typeLine.includes("Land")) return "Land";
  if (typeLine.includes("Creature")) return "Creature";
  if (typeLine.includes("Planeswalker")) return "Planeswalker";
  if (typeLine.includes("Instant")) return "Instant";
  if (typeLine.includes("Sorcery")) return "Sorcery";
  if (typeLine.includes("Artifact")) return "Artifact";
  if (typeLine.includes("Enchantment")) return "Enchantment";
  return "Other";
}

function cardImageUrl(card: RichCard): string {
  if (card.variant?.imageUri) return card.variant.imageUri;
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.cardName)}&format=image&version=normal`;
}

// ── Card Art Grid ─────────────────────────────────────────────────────────────
function CardArtGrid({ cards, showName }: { cards: RichCard[]; showName: boolean }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
      {cards.map(card => (
        <div key={card.id} className="group relative cursor-pointer" style={{ aspectRatio: "0.716" }}>
          <img
            src={cardImageUrl(card)}
            alt={card.cardName}
            loading="lazy"
            className="w-full h-full object-cover rounded-lg transition-transform duration-150 group-hover:scale-105 group-hover:z-10 group-hover:relative"
            style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.6)" }}
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          {card.quantity > 1 && (
            <span className="absolute top-1 right-1 text-xs font-black px-1.5 py-0.5 rounded-md"
              style={{ background: "rgba(0,0,0,0.8)", color: "#fff", fontSize: "10px" }}>
              ×{card.quantity}
            </span>
          )}
          {showName && (
            <div className="absolute bottom-0 inset-x-0 rounded-b-lg px-1.5 py-1 text-center"
              style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.85))", fontSize: "9px", color: "#fff", fontWeight: 600, lineHeight: 1.2 }}>
              {card.cardName}
            </div>
          )}
          {/* Hover tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-lg text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20"
            style={{ background: "rgba(0,0,0,0.9)", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" }}>
            {card.cardName}{card.price != null ? ` · $${card.price.toFixed(2)}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

const BRACKET_LABELS = ["", "Jank / Precon", "Upgraded Precon", "Optimized", "High Power", "cEDH"];
const BRACKET_COLORS = ["", "#3d5068", "#22c55e", "#00d4ff", "#f59e0b", "#ff0080"];
const BRACKET_DESC = [
  "",
  "Casual, fun, no combos",
  "Slight upgrades, friendly power",
  "Focused strategy, synergy-driven",
  "Near-competitive, strong synergies",
  "Full competitive, fast wins",
];

const GOALS = [
  "Aggro", "Control", "Combo", "Midrange", "Ramp", "Tokens", "Voltron",
  "Stax", "Aristocrats", "Spellslinger", "Reanimator", "Tribal", "Pillowfort", "Mill", "Infect",
];

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

// ── EDHRec Tab ────────────────────────────────────────────────────────────────
function EdhrecTab({ deck }: { deck: DeckDetailData["deck"] }) {
  const [commanderInput, setCommanderInput] = useState(deck.commander ?? "");
  const [edhrecData, setEdhrecData] = useState<{ commander: string; recommendations: unknown[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (name: string) => {
    if (!name.trim()) return;
    setLoading(true); setError(null);
    try {
      const data = await api.decks.edhrec(deck.id, name.trim());
      setEdhrecData(data);
    } catch (e: unknown) {
      const msg = (e as { message?: string }).message ?? "Failed to load";
      if (msg.includes("not found on EDHREC") || msg.includes("not found")) {
        setError(`"${name}" not found on EDHRec. Check the spelling and try again.`);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [deck.id]);

  // Auto-load if commander already set
  useEffect(() => {
    if (deck.commander) load(deck.commander);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {/* Commander input */}
      <div className="flex gap-2 mb-6">
        <input
          value={commanderInput}
          onChange={e => setCommanderInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && load(commanderInput)}
          placeholder="Commander name (e.g. Atraxa, Praetors' Voice)"
          className="flex-1 bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
        />
        <button onClick={() => load(commanderInput)} disabled={loading || !commanderInput.trim()}
          className="px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
          {loading ? "Loading…" : "Look up"}
        </button>
      </div>

      {error && (
        <div className="py-6 text-center rounded-xl mb-4" style={{ background: "rgba(255,0,128,0.06)", border: "1px solid rgba(255,0,128,0.15)" }}>
          <p className="text-sm" style={{ color: "#fca5a5" }}>{error}</p>
        </div>
      )}

      {loading && <p className="text-muted animate-pulse text-sm">Fetching EDHRec data…</p>}

      {edhrecData && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">{edhrecData.commander} — Recommendations</h2>
            <span className="text-xs text-muted">{(edhrecData.recommendations as unknown[]).filter((r: unknown) => !(r as { alreadyInDeck: boolean }).alreadyInDeck).length} new cards</span>
          </div>
          <div className="space-y-2">
            {(edhrecData.recommendations as Array<{
              name: string; synergy: number; inclusion: number;
              primary_type: string; cmc: number; price_usd: number | null; alreadyInDeck: boolean;
            }>).filter(r => !r.alreadyInDeck).slice(0, 40).map(rec => (
              <div key={rec.name} className="flex items-center gap-4 bg-surface rounded-xl border border-border px-4 py-3 hover:border-accent/30 transition-colors">
                <div className="flex-1">
                  <p className="font-semibold text-sm">{rec.name}</p>
                  <p className="text-muted text-xs">{rec.primary_type} · CMC {rec.cmc}</p>
                </div>
                <span className="text-green-400 text-sm font-bold">+{rec.synergy}%</span>
                <span className="text-muted text-xs">{rec.inclusion}% decks</span>
                <span className="text-sm font-semibold text-gold">{rec.price_usd != null ? `$${rec.price_usd.toFixed(2)}` : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !edhrecData && !error && (
        <div className="py-16 text-center text-muted">
          <p className="text-4xl mb-3">🧙</p>
          <p className="text-sm">Enter a commander name and click Look up</p>
        </div>
      )}
    </div>
  );
}

// ── AI Architect Tab ──────────────────────────────────────────────────────────
function AIChat({ deck }: { deck: DeckDetailData["deck"] }) {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [suggestedCards, setSuggestedCards] = useState<{ name: string; qty: number }[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Architect settings
  const [bracket, setBracket] = useState(3);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [collectionMode, setCollectionMode] = useState<CollectionMode>("mix");
  const [showSettings, setShowSettings] = useState(true);

  const toggleGoal = (g: string) =>
    setSelectedGoals(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);

  const collectionContext = {
    collection: "Only suggest cards the user already owns from their collection. Do not recommend cards they don't have.",
    mix: "Prefer cards the user already owns, but suggest new cards where significant upgrades exist.",
    new: "Suggest the best possible cards regardless of collection. Build the optimal deck.",
  }[collectionMode];

  const deckContext = [
    `Deck: ${deck.name}`,
    `Format: ${deck.format}`,
    `Commander: ${deck.commander ?? "none"}`,
    `Power bracket: ${bracket} — ${BRACKET_LABELS[bracket]} (${BRACKET_DESC[bracket]})`,
    selectedGoals.length > 0 ? `Strategy goals: ${selectedGoals.join(", ")}` : "",
    `Collection preference: ${collectionContext}`,
    `Cards (${deck.cards.reduce((s, c) => s + c.quantity, 0)} total):`,
    deck.cards.slice(0, 50).map(c => `${c.quantity}x ${c.cardName}`).join("\n"),
  ].filter(Boolean).join("\n");

  const send = useCallback(async (msg?: string) => {
    const text = msg ?? input;
    if (!text.trim() || streaming) return;
    const userMsg: AiMessage = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);
    setSuggestedCards([]);
    setImportResult(null);
    setShowSettings(false);
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
    <div className="flex flex-col h-[680px]">

      {/* Settings panel */}
      {showSettings && messages.length === 0 && (
        <div className="rounded-2xl p-5 mb-4 space-y-5" style={{ background: "rgba(13,18,32,0.8)", border: "1px solid rgba(0,212,255,0.1)" }}>

          {/* Bracket slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-widest text-muted">Power Bracket</p>
              <span className="text-sm font-bold" style={{ color: BRACKET_COLORS[bracket] }}>
                {bracket} — {BRACKET_LABELS[bracket]}
              </span>
            </div>
            <input
              type="range" min={1} max={5} value={bracket}
              onChange={e => setBracket(Number(e.target.value))}
              className="w-full accent-current"
              style={{ accentColor: BRACKET_COLORS[bracket] }}
            />
            <div className="flex justify-between text-[10px] text-muted mt-1">
              {BRACKET_LABELS.slice(1).map((l, i) => (
                <span key={i} style={{ color: bracket === i + 1 ? BRACKET_COLORS[i + 1] : undefined }}>{i + 1}</span>
              ))}
            </div>
            <p className="text-xs text-muted mt-1">{BRACKET_DESC[bracket]}</p>
          </div>

          {/* Goals */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted mb-2">Deck Goals <span className="normal-case font-normal">(select all that apply)</span></p>
            <div className="flex flex-wrap gap-2">
              {GOALS.map(g => (
                <button key={g} onClick={() => toggleGoal(g)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={selectedGoals.includes(g)
                    ? { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.4)", color: "#00d4ff" }
                    : { background: "rgba(30,45,69,0.4)", border: "1px solid #1e2d45", color: "#3d5068" }
                  }>
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Collection mode */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted mb-2">Card Pool</p>
            <div className="flex gap-2">
              {([
                { value: "collection" as const, label: "My Collection", desc: "Only cards I own", color: "#4ade80" },
                { value: "mix" as const, label: "Mix", desc: "Prefer owned, add new", color: "#00d4ff" },
                { value: "new" as const, label: "All New", desc: "Best cards regardless", color: "#f59e0b" },
              ]).map(({ value, label, desc, color }) => (
                <button key={value} onClick={() => setCollectionMode(value)}
                  className="flex-1 py-2.5 px-3 rounded-xl text-left transition-all"
                  style={collectionMode === value
                    ? { background: `${color}15`, border: `1px solid ${color}50`, color }
                    : { background: "rgba(30,45,69,0.3)", border: "1px solid #1e2d45", color: "#3d5068" }
                  }>
                  <p className="text-xs font-bold">{label}</p>
                  <p className="text-[10px] opacity-70">{desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toggle settings when chatting */}
      {messages.length > 0 && (
        <button onClick={() => setShowSettings(v => !v)} className="text-xs text-muted hover:text-white transition-colors mb-2 flex items-center gap-1">
          ⚙ {showSettings ? "Hide" : "Show"} settings · Bracket {bracket} · {BRACKET_LABELS[bracket]} · {collectionMode}
        </button>
      )}
      {messages.length > 0 && showSettings && (
        <div className="rounded-xl p-4 mb-3 space-y-4 text-sm" style={{ background: "rgba(13,18,32,0.8)", border: "1px solid rgba(0,212,255,0.08)" }}>
          <div className="flex items-center gap-3">
            <span className="text-muted text-xs w-16">Bracket</span>
            <input type="range" min={1} max={5} value={bracket} onChange={e => setBracket(Number(e.target.value))}
              className="flex-1" style={{ accentColor: BRACKET_COLORS[bracket] }} />
            <span className="text-xs font-bold w-24" style={{ color: BRACKET_COLORS[bracket] }}>{bracket} — {BRACKET_LABELS[bracket]}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {GOALS.map(g => (
              <button key={g} onClick={() => toggleGoal(g)} className="px-2 py-0.5 rounded text-xs transition-all"
                style={selectedGoals.includes(g) ? { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)", color: "#00d4ff" } : { background: "rgba(30,45,69,0.4)", border: "1px solid #1e2d45", color: "#3d5068" }}>
                {g}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {(["collection", "mix", "new"] as const).map(v => (
              <button key={v} onClick={() => setCollectionMode(v)} className="flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all"
                style={collectionMode === v ? { background: "rgba(0,212,255,0.12)", border: "1px solid rgba(0,212,255,0.3)", color: "#00d4ff" } : { background: "rgba(30,45,69,0.3)", border: "1px solid #1e2d45", color: "#3d5068" }}>
                {v === "collection" ? "My Collection" : v === "mix" ? "Mix" : "All New"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
        {messages.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-3xl mb-3">🧙</p>
            <p className="text-muted text-sm mb-4">Configure your settings above, then ask Claude to build or improve your deck.</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                "Build me a deck based on these goals",
                "What are the top 5 improvements?",
                "Suggest a sideboard",
                "What are my main weaknesses?",
                "How do I pilot this deck?",
              ].map(q => (
                <button key={q} onClick={() => send(q)} className="px-3 py-1.5 text-xs rounded-lg transition-colors"
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
          className="flex-1 bg-surface border border-border rounded-xl px-4 py-2.5 text-sm placeholder:text-muted focus:outline-none focus:border-accent transition-all disabled:opacity-60" />
        <button onClick={() => send()} disabled={streaming || !input.trim()} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
          {streaming ? "…" : "Ask"}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DeckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<Tab>("cards");
  const [data, setData] = useState<DeckDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [groupBy, setGroupBy] = useState<GroupBy>("section");

  const reload = () => { api.decks.get(id).then(setData).catch(console.error); };

  useEffect(() => {
    api.decks.get(id).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [id]);

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
        <div>
          {/* View controls */}
          <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
            {/* View mode toggle */}
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "rgba(13,18,32,0.8)", border: "1px solid rgba(0,212,255,0.08)" }}>
              {([
                { mode: "list" as ViewMode, label: "List", icon: "☰" },
                { mode: "art" as ViewMode, label: "Art", icon: "▦" },
                { mode: "artname" as ViewMode, label: "Art + Name", icon: "▤" },
              ]).map(({ mode, label, icon }) => (
                <button key={mode} onClick={() => setViewMode(mode)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: viewMode === mode ? "rgba(139,92,246,0.2)" : "transparent",
                    color: viewMode === mode ? "#c4b5fd" : "#526880",
                    border: viewMode === mode ? "1px solid rgba(139,92,246,0.3)" : "1px solid transparent",
                  }}>
                  <span>{icon}</span> {label}
                </button>
              ))}
            </div>
            {/* Group by toggle */}
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "rgba(13,18,32,0.8)", border: "1px solid rgba(0,212,255,0.08)" }}>
              {([
                { g: "section" as GroupBy, label: "By Section" },
                { g: "type" as GroupBy, label: "By Type" },
              ]).map(({ g, label }) => (
                <button key={g} onClick={() => setGroupBy(g)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: groupBy === g ? "rgba(0,212,255,0.1)" : "transparent",
                    color: groupBy === g ? "#00d4ff" : "#526880",
                    border: groupBy === g ? "1px solid rgba(0,212,255,0.2)" : "1px solid transparent",
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {deck.cards.length === 0 && (
            <div className="py-20 text-center rounded-2xl" style={{ border: "1px dashed #2a1f4a" }}>
              <p className="text-4xl mb-3">🃏</p>
              <p className="font-bold text-white mb-1">No cards yet</p>
              <p className="text-sm" style={{ color: "#7c6f9a" }}>Click <strong style={{ color: "#c4b5fd" }}>↑ Import</strong> to paste a decklist</p>
            </div>
          )}

          {/* Build groups based on groupBy */}
          {(() => {
            const allCards = deck.cards;
            let groups: { key: string; label: string; color?: string; cards: RichCard[] }[];

            if (groupBy === "type") {
              const byType = new Map<string, RichCard[]>();
              for (const card of allCards) {
                const t = card.section === "commander" ? "Commander" : getCardType(card.variant?.typeLine);
                if (!byType.has(t)) byType.set(t, []);
                byType.get(t)!.push(card);
              }
              groups = TYPE_ORDER
                .filter(t => byType.has(t))
                .map(t => ({ key: t, label: t, color: TYPE_COLORS[t], cards: byType.get(t)! }));
            } else {
              groups = sections.map(s => ({ key: s.key, label: s.label, cards: s.cards as RichCard[] }));
            }

            return (
              <div className="space-y-6">
                {groups.map(({ key, label, color, cards }) => (
                  <div key={key}>
                    <div className="flex items-center gap-2 mb-3">
                      {color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />}
                      <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: color ?? "#526880" }}>{label}</h3>
                      <span className="text-xs" style={{ color: "#3d5068" }}>({cards.reduce((s, c) => s + c.quantity, 0)})</span>
                    </div>

                    {viewMode === "list" ? (
                      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                        {cards.map((card, i) => (
                          <div key={card.id} className={clsx("flex items-center gap-4 px-4 py-3", i > 0 && "border-t border-border")}>
                            <span className="text-accent font-bold text-sm w-5 text-right shrink-0">{card.quantity}</span>
                            <span className="flex-1 font-medium text-sm">{card.cardName}</span>
                            {card.variant?.typeLine && <span className="text-xs hidden sm:block" style={{ color: "#3d5068" }}>{card.variant.typeLine.split("—")[0].trim()}</span>}
                            <span className="text-muted text-sm shrink-0">{card.price != null ? `$${card.price.toFixed(2)}` : "—"}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <CardArtGrid cards={cards} showName={viewMode === "artname"} />
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {tab === "edhrec" && <EdhrecTab deck={deck} />}
      {tab === "ai" && <AIChat deck={deck} />}

      {showImport && <ImportModal deckId={id} onClose={() => setShowImport(false)} onImported={reload} />}
    </div>
  );
}
