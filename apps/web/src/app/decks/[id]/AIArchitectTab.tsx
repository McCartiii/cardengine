"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import {
  type RichCard,
  type DeckStats,
  type DeckIssue,
  computeStats,
  analyzeDeckHealth,
  computeHealthGrade,
} from "./deck-helpers";

// ── Types ────────────────────────────────────────────────────────────────────

interface DeckData {
  id: string;
  name: string;
  format: string;
  commander: string | null;
  cards: RichCard[];
}

type AiMessage = { role: "user" | "assistant"; content: string };
type CollectionMode = "collection" | "mix" | "new";

// ── Constants ────────────────────────────────────────────────────────────────

const BRACKET_LABELS = ["", "Jank / Precon", "Upgraded Precon", "Optimized", "High Power", "cEDH"];
const BRACKET_COLORS = ["", "#3d5068", "#22c55e", "#0D9488", "#f59e0b", "#ef4444"];
const GOALS = [
  "Ramp", "Card Draw", "Removal", "Combo", "Aggro", "Control",
  "Tokens", "Voltron", "Stax", "Tribal", "Graveyard", "Pillowfort",
];

const THEMES = [
  "Superfriends", "Voltron", "Tribal", "Aristocrats", "Spellslinger",
  "Reanimator", "Landfall", "Enchantress", "Artifacts", "Mill",
  "Infect", "Group Hug", "Chaos", "Stompy", "Flicker",
];

const PIP: Record<string, { bg: string; fg: string; letter: string }> = {
  W: { bg: "#f9fafb", fg: "#1a1a1a", letter: "W" },
  U: { bg: "#60a5fa", fg: "#1a1a1a", letter: "U" },
  B: { bg: "#7e22ce", fg: "#e9d5ff", letter: "B" },
  R: { bg: "#ef4444", fg: "#ffffff", letter: "R" },
  G: { bg: "#16a34a", fg: "#ffffff", letter: "G" },
  C: { bg: "#94a3b8", fg: "#1a1a1a", letter: "C" },
};

function parseCards(text: string): { name: string; qty: number }[] {
  const match = text.match(/CARDS:\n([\s\S]*?)END_CARDS/);
  if (!match) return [];
  return match[1]
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const m = line.match(/^(\d+)\s+(.+)$/);
      return m ? { qty: parseInt(m[1]), name: m[2] } : null;
    })
    .filter(Boolean) as { name: string; qty: number }[];
}

// ── Scryfall recommended cards ───────────────────────────────────────────────

interface RecCard {
  name: string;
  type_line: string;
  prices?: { usd?: string };
  image_uris?: { art_crop: string };
  card_faces?: Array<{ image_uris?: { art_crop: string } }>;
}

function recArt(c: RecCard): string | null {
  return c.image_uris?.art_crop ?? c.card_faces?.[0]?.image_uris?.art_crop ?? null;
}

// ── Markdown renderer ────────────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listOrdered = false;

  function flushList() {
    if (listItems.length === 0) return;
    const items = listItems.map((item, i) => <li key={i}>{renderInline(item)}</li>);
    elements.push(
      listOrdered
        ? <ol key={elements.length} style={{ paddingLeft: 18, margin: "6px 0", fontSize: 12.5, color: "#cbd5e1", lineHeight: 1.7 }}>{items}</ol>
        : <ul key={elements.length} style={{ paddingLeft: 18, margin: "6px 0", fontSize: 12.5, color: "#cbd5e1", lineHeight: 1.7, listStyleType: "disc" }}>{items}</ul>
    );
    listItems = [];
  }

  function renderInline(s: string): React.ReactNode {
    // Bold: **text**
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} style={{ color: "#F8FAFC", fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Numbered list: 1. item
    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      if (!listOrdered && listItems.length > 0) flushList();
      listOrdered = true;
      listItems.push(numMatch[2]);
      continue;
    }

    // Bullet list: - item or * item
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      if (listOrdered && listItems.length > 0) flushList();
      listOrdered = false;
      listItems.push(bulletMatch[1]);
      continue;
    }

    flushList();

    if (!trimmed) {
      elements.push(<div key={elements.length} style={{ height: 6 }} />);
      continue;
    }

    // Heading-like: lines ending with : on their own
    if (trimmed.endsWith(":") && trimmed.length < 60) {
      elements.push(
        <div key={elements.length} style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginTop: 10, marginBottom: 4, letterSpacing: "0.03em" }}>
          {renderInline(trimmed)}
        </div>
      );
      continue;
    }

    elements.push(
      <p key={elements.length} style={{ margin: "3px 0", fontSize: 12.5, lineHeight: 1.65, color: "#cbd5e1" }}>
        {renderInline(trimmed)}
      </p>
    );
  }
  flushList();
  return elements;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AIArchitectTab({ deck, totalValue }: { deck: DeckData; totalValue: number }) {
  // Settings
  const [bracket, setBracket] = useState(3);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [collectionMode, setCollectionMode] = useState<CollectionMode>("mix");

  // Chat
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [suggestedCards, setSuggestedCards] = useState<{ name: string; qty: number }[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Recommendations
  const [recCards, setRecCards] = useState<RecCard[]>([]);

  const chatMode = messages.length > 0;

  // Compute stats & health
  const stats = useMemo(() => computeStats(deck.cards, totalValue), [deck.cards, totalValue]);
  const issues = useMemo(() => analyzeDeckHealth(deck.cards, deck.format), [deck.cards, deck.format]);
  const grade = useMemo(() => computeHealthGrade(issues), [issues]);
  const landCount = useMemo(() => deck.cards.filter(c => c.variant?.typeLine?.includes("Land")).reduce((n, c) => n + c.quantity, 0), [deck.cards]);

  // Fetch recommendations from Scryfall based on commander
  useEffect(() => {
    if (!deck.commander) return;
    const q = `f:${deck.format} -is:land name:/${encodeURIComponent(deck.commander.split(",")[0])}/`;
    // Just get popular cards for the format as a starting point
    fetch(`https://api.scryfall.com/cards/search?q=f:${encodeURIComponent(deck.format)}+is:commander+-is:land&order=edhrec&dir=auto`, { headers: { Accept: "application/json" } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.data) setRecCards(data.data.slice(0, 10)); })
      .catch(() => {});
  }, [deck.commander, deck.format]);

  const toggleGoal = (g: string) =>
    setSelectedGoals(prev => (prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]));

  const commanderName = deck.commander ?? null;
  const deckContext = [
    `Deck: ${deck.name}`,
    `Format: ${deck.format}`,
    commanderName ? `Commander: ${commanderName}` : `Commander: not yet selected (deck name "${deck.name}" may hint at the intended commander — search Scryfall if unsure)`,
    `Power bracket: ${bracket} — ${BRACKET_LABELS[bracket]}`,
    selectedTheme ? `Deck theme/archetype: ${selectedTheme}` : "",
    selectedGoals.length > 0 ? `Strategy goals: ${selectedGoals.join(", ")}` : "",
    `Collection preference: ${{ collection: "Only suggest cards the user already owns.", mix: "Prefer owned cards, but suggest new where upgrades exist.", new: "Suggest best cards regardless of collection." }[collectionMode]}`,
    customInstructions.trim() ? `\nUser instructions: ${customInstructions.trim()}` : "",
    `Cards (${stats.totalCards} total):`,
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
            try { full += JSON.parse(data).text; setMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: full }]); } catch {}
          }
        }
      }
      setSuggestedCards(parseCards(full));
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
      setImportResult(`Imported ${res.imported} cards`);
    } catch (e: unknown) {
      setImportResult(`Error: ${(e as Error).message}`);
    } finally {
      setImporting(false);
    }
  }

  // Color totals for bar
  const colorTotal = stats.colorCounts.reduce((s, c) => s + c.count, 0);
  const curveMax = Math.max(...stats.manaCurve.map(c => c.count), 1);

  const gradeColor = grade.startsWith("A") ? "#22c55e" : grade.startsWith("B") ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col" style={{ minHeight: chatMode ? 600 : "auto" }}>
      {/* Settings bar */}
      <div
        className="flex items-center gap-1.5 flex-wrap mb-3 p-2 rounded-xl relative overflow-hidden"
        style={{ background: "#111827", border: "1px solid #1E2535" }}
      >
        {/* Subtle gradient accent */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(13,148,136,0.3), transparent)" }} />
        <button
          className="flex items-center gap-1.5 rounded-2xl text-xs font-bold cursor-pointer"
          style={{
            padding: "4px 10px",
            background: `${BRACKET_COLORS[bracket]}12`,
            border: `1px solid ${BRACKET_COLORS[bracket]}40`,
            color: BRACKET_COLORS[bracket],
            whiteSpace: "nowrap",
          }}
          onClick={() => setBracket(b => b >= 5 ? 1 : b + 1)}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: BRACKET_COLORS[bracket], display: "inline-block" }} />
          Bracket {bracket}
        </button>
        <div style={{ width: 1, height: 20, background: "#1E2535", margin: "0 2px" }} />
        {GOALS.slice(0, 8).map(g => (
          <button
            key={g}
            onClick={() => toggleGoal(g)}
            className="rounded-2xl text-xs font-semibold transition-all"
            style={{
              padding: "4px 10px",
              whiteSpace: "nowrap",
              background: selectedGoals.includes(g) ? "rgba(13,148,136,0.1)" : "#161B27",
              border: `1px solid ${selectedGoals.includes(g) ? "rgba(13,148,136,0.3)" : "#1E2535"}`,
              color: selectedGoals.includes(g) ? "#0D9488" : "#64748b",
            }}
          >
            {g}
          </button>
        ))}
        <div style={{ width: 1, height: 20, background: "#1E2535", margin: "0 2px" }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", padding: "0 4px", letterSpacing: "0.06em" }}>Pool</span>
        {(["Mix", "Owned", "All"] as const).map(label => {
          const val = label === "Owned" ? "collection" : label === "All" ? "new" : "mix";
          return (
            <button
              key={val}
              onClick={() => setCollectionMode(val as CollectionMode)}
              className="rounded-2xl text-xs font-semibold transition-all"
              style={{
                padding: "4px 10px",
                whiteSpace: "nowrap",
                background: collectionMode === val ? "rgba(13,148,136,0.1)" : "#161B27",
                border: `1px solid ${collectionMode === val ? "rgba(13,148,136,0.3)" : "#1E2535"}`,
                color: collectionMode === val ? "#0D9488" : "#64748b",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Theme selector */}
      <div
        className="flex items-center gap-1.5 flex-wrap mb-3 p-2 rounded-xl"
        style={{ background: "#111827", border: "1px solid #1E2535" }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", padding: "0 4px", letterSpacing: "0.06em" }}>Theme</span>
        {THEMES.map(t => (
          <button
            key={t}
            onClick={() => setSelectedTheme(prev => prev === t ? null : t)}
            className="rounded-2xl text-xs font-semibold transition-all"
            style={{
              padding: "4px 10px",
              whiteSpace: "nowrap",
              background: selectedTheme === t ? "rgba(99,102,241,0.1)" : "#161B27",
              border: `1px solid ${selectedTheme === t ? "rgba(99,102,241,0.3)" : "#1E2535"}`,
              color: selectedTheme === t ? "#818cf8" : "#64748b",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Dashboard (hidden during chat) ── */}
      {!chatMode && (
        <>
          {/* Command input */}
          <div className="rounded-xl overflow-hidden mb-3 relative" style={{ background: "#111827", border: "1px solid #1E2535", boxShadow: "0 4px 24px rgba(0,0,0,0.2)" }}>
            {/* Top glow line */}
            <div style={{ position: "absolute", top: 0, left: "10%", right: "10%", height: 1, background: "linear-gradient(90deg, transparent, rgba(13,148,136,0.4), transparent)" }} />
            <div className="flex items-center gap-3" style={{ padding: "16px 18px" }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: "linear-gradient(135deg, rgba(13,148,136,0.15), rgba(13,148,136,0.05))",
                border: "1px solid rgba(13,148,136,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </div>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && send()}
                placeholder="What do you want to build?"
                className="flex-1 bg-transparent border-none outline-none"
                style={{ color: "#F8FAFC", fontSize: 15, fontWeight: 500 }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim()}
                style={{
                  padding: "9px 22px", borderRadius: 8, border: "none",
                  background: input.trim() ? "linear-gradient(135deg, #0D9488, #0f766e)" : "#1E2535",
                  color: input.trim() ? "#fff" : "#334155",
                  fontSize: 12, fontWeight: 600, cursor: input.trim() ? "pointer" : "default",
                  transition: "all 0.15s", flexShrink: 0,
                  boxShadow: input.trim() ? "0 0 16px rgba(13,148,136,0.25)" : "none",
                }}
              >
                Send
              </button>
            </div>

            {/* Custom instructions toggle + textarea */}
            <div style={{ padding: "0 16px 10px" }}>
              <button
                onClick={() => setShowInstructions(!showInstructions)}
                style={{
                  fontSize: 10, fontWeight: 600, color: customInstructions.trim() ? "#0D9488" : "#334155",
                  background: "none", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4, marginBottom: showInstructions ? 8 : 0,
                  transition: "color 0.15s",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838.838-2.872a2 2 0 0 1 .506-.855z"/>
                </svg>
                {showInstructions ? "Hide instructions" : customInstructions.trim() ? "Edit instructions" : "Add custom instructions"}
              </button>
              {showInstructions && (
                <textarea
                  value={customInstructions}
                  onChange={e => setCustomInstructions(e.target.value)}
                  placeholder="e.g. Keep budget under $200, avoid infinite combos, include at least 5 board wipes, focus on ETB triggers..."
                  rows={3}
                  style={{
                    width: "100%", background: "#0F1117", border: "1px solid #1E2535",
                    borderRadius: 8, padding: "10px 12px", fontSize: 12, lineHeight: 1.6,
                    color: "#e2e8f0", outline: "none", resize: "vertical",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = "rgba(13,148,136,0.4)"; }}
                  onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = "#1E2535"; }}
                />
              )}
            </div>

            {/* Quick actions */}
            <div className="flex gap-1 flex-wrap" style={{ padding: "0 10px 10px" }}>
              {[
                "Build remaining deck",
                "Suggest upgrades",
                "Find synergies",
                "Budget swaps",
                "How to pilot",
              ].map(label => (
                <button
                  key={label}
                  onClick={() => send(label)}
                  className="flex items-center gap-1.5 rounded-lg text-xs transition-all"
                  style={{
                    padding: "6px 14px", fontWeight: 500,
                    background: "#161B27", border: "1px solid #1E2535", color: "#64748b",
                  }}
                  onMouseEnter={e => { (e.currentTarget).style.borderColor = "rgba(13,148,136,0.3)"; (e.currentTarget).style.color = "#0D9488"; }}
                  onMouseLeave={e => { (e.currentTarget).style.borderColor = "#1E2535"; (e.currentTarget).style.color = "#64748b"; }}
                >
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#334155", display: "inline-block" }} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Health strip */}
          <div className="grid grid-cols-5 gap-2 mb-3">
            {[
              { val: String(stats.totalCards), label: "Cards", accent: null },
              { val: stats.avgCmc.toFixed(1), label: "Avg CMC", accent: null },
              { val: String(landCount), label: "Lands", accent: null },
              { val: `$${Math.round(totalValue)}`, label: "Value", accent: null },
              { val: grade, label: "Health", accent: gradeColor },
            ].map(({ val, label, accent }) => (
              <div key={label} className="flex flex-col items-center rounded-lg relative overflow-hidden" style={{ background: "#111827", border: `1px solid ${accent ? accent + "30" : "#1E2535"}`, padding: "12px 12px" }}>
                {accent && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: accent }} />}
                <span className="text-xl font-extrabold leading-none" style={{ color: accent ?? "#F8FAFC" }}>{val}</span>
                <span style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", marginTop: 4, letterSpacing: "0.06em", fontWeight: 600 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Curve + Color */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-lg relative overflow-hidden" style={{ background: "#111827", border: "1px solid #1E2535", padding: "14px 14px 20px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Mana Curve</div>
              <div className="flex items-end gap-1.5" style={{ height: 48 }}>
                {stats.manaCurve.map(({ cmc, count }) => {
                  const pct = curveMax > 0 ? (count / curveMax) * 100 : 0;
                  return (
                    <div key={cmc} className="flex-1 relative group" style={{ height: `${pct}%`, minHeight: count > 0 ? 4 : 1 }}>
                      <div style={{
                        width: "100%", height: "100%", borderRadius: "3px 3px 0 0",
                        background: count === curveMax
                          ? "linear-gradient(180deg, #0D9488, rgba(13,148,136,0.6))"
                          : `linear-gradient(180deg, rgba(13,148,136,${0.3 + (count / curveMax) * 0.4}), rgba(13,148,136,${0.1 + (count / curveMax) * 0.2}))`,
                        transition: "all 0.2s",
                      }} />
                      {count > 0 && (
                        <span style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", fontSize: 9, color: "#64748b", fontWeight: 700 }}>{count}</span>
                      )}
                      <span style={{ position: "absolute", bottom: -14, left: "50%", transform: "translateX(-50%)", fontSize: 8, color: "#334155", fontWeight: 600 }}>{cmc}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-lg" style={{ background: "#111827", border: "1px solid #1E2535", padding: "14px 14px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Color Balance</div>
              {colorTotal > 0 ? (
                <>
                  <div className="flex gap-0.5 rounded-lg overflow-hidden" style={{ height: 10 }}>
                    {stats.colorCounts.map(({ color, count }) => (
                      <div key={color} style={{
                        width: `${(count / colorTotal) * 100}%`,
                        background: PIP[color]?.bg ?? "#94a3b8",
                        borderRadius: 2,
                        transition: "width 0.3s",
                      }} />
                    ))}
                  </div>
                  <div className="flex gap-2 flex-wrap mt-2">
                    {stats.colorCounts.map(({ color, label, count }) => {
                      const pip = PIP[color];
                      return (
                        <div key={color} className="flex items-center gap-1.5" style={{ fontSize: 9, color: "#64748b" }}>
                          <span style={{
                            width: 16, height: 16, borderRadius: "50%", display: "inline-flex",
                            alignItems: "center", justifyContent: "center",
                            fontSize: 8, fontWeight: 800,
                            background: pip?.bg ?? "#94a3b8", color: pip?.fg ?? "#1a1a1a",
                            boxShadow: `0 0 6px ${pip?.bg ?? "#94a3b8"}40`,
                          }}>{pip?.letter ?? color}</span>
                          <span style={{ fontWeight: 600 }}>{label}</span>
                          <span style={{ color: "#334155" }}>{Math.round((count / colorTotal) * 100)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: "#334155", padding: "8px 0" }}>No cards yet</div>
              )}
            </div>
          </div>

          {/* Issues */}
          {issues.length > 0 && (
            <div className="rounded-lg overflow-hidden mb-3" style={{ background: "#111827", border: "1px solid #1E2535" }}>
              <div className="flex items-center justify-between" style={{ padding: "8px 12px", borderBottom: "1px solid #1E2535" }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em" }}>Issues</span>
                <span style={{ fontSize: 9, color: "#334155" }}>
                  {issues.filter(i => i.severity === "warning").length} warnings · {issues.filter(i => i.severity === "critical").length} critical
                </span>
              </div>
              {issues.map((issue, i) => (
                <div key={i} className="flex items-center gap-2" style={{ padding: "7px 12px", borderBottom: i < issues.length - 1 ? "1px solid rgba(30,37,53,0.5)" : "none" }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                    background: issue.severity === "critical" ? "#ef4444" : issue.severity === "warning" ? "#f59e0b" : "#22c55e",
                  }} />
                  <span className="flex-1" style={{ fontSize: 11, color: "#94a3b8" }}>{issue.text}</span>
                  <span className="rounded" style={{
                    fontSize: 8, fontWeight: 700, padding: "2px 5px", textTransform: "uppercase", flexShrink: 0,
                    background: issue.severity === "critical" ? "rgba(239,68,68,0.1)" : issue.severity === "warning" ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)",
                    color: issue.severity === "critical" ? "#ef4444" : issue.severity === "warning" ? "#f59e0b" : "#22c55e",
                  }}>
                    {issue.severity === "critical" ? "Critical" : issue.severity === "warning" ? "Low" : "Good"}
                  </span>
                  {issue.action && (
                    <button
                      onClick={() => send(`${issue.action} — ${issue.text}`)}
                      className="rounded-xl transition-all"
                      style={{
                        padding: "3px 10px", fontSize: 9, fontWeight: 600, flexShrink: 0,
                        background: "rgba(13,148,136,0.08)", border: "1px solid rgba(13,148,136,0.2)", color: "#0D9488",
                      }}
                    >
                      {issue.action}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Card feed */}
          {recCards.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-2">
                <span style={{ fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Recommended for {deck.commander ?? deck.name}
                </span>
                <button style={{ fontSize: 10, color: "#334155", cursor: "pointer", background: "none", border: "none" }}>See all →</button>
              </div>
              <div className="grid gap-1.5 mb-3" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
                {recCards.map((card) => (
                  <div
                    key={card.name}
                    className="rounded-lg overflow-hidden transition-all"
                    style={{ background: "#111827", border: "1px solid #1E2535", cursor: "pointer" }}
                    onMouseEnter={e => { (e.currentTarget).style.borderColor = "rgba(13,148,136,0.3)"; (e.currentTarget).style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { (e.currentTarget).style.borderColor = "#1E2535"; (e.currentTarget).style.transform = "none"; }}
                  >
                    <div style={{ width: "100%", height: 56, overflow: "hidden" }}>
                      {recArt(card) ? (
                        <img src={recArt(card)!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #1a2030, #141824)" }} />
                      )}
                    </div>
                    <div style={{ padding: "6px 8px" }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {card.name}
                      </div>
                      <div className="flex items-center justify-between" style={{ marginTop: 3 }}>
                        <span style={{ fontSize: 9, color: "#475569" }}>${card.prices?.usd ?? "—"}</span>
                        <button
                          style={{
                            width: 16, height: 16, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                            background: "rgba(13,148,136,0.08)", border: "1px solid rgba(13,148,136,0.2)", color: "#0D9488",
                            fontSize: 10, fontWeight: 700, cursor: "pointer",
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Chat mode ── */}
      {chatMode && (
        <div className="flex-1 overflow-y-auto pr-1 mb-3 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 2,
                  background: "linear-gradient(135deg, rgba(13,148,136,0.15), rgba(13,148,136,0.05))",
                  border: "1px solid rgba(13,148,136,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                </div>
              )}
              <div
                className="max-w-[85%]"
                style={{
                  padding: msg.role === "user" ? "10px 16px" : "14px 18px",
                  borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: msg.role === "user" ? "rgba(13,148,136,0.08)" : "#111827",
                  border: `1px solid ${msg.role === "user" ? "rgba(13,148,136,0.2)" : "#1E2535"}`,
                  boxShadow: msg.role === "assistant" ? "0 2px 12px rgba(0,0,0,0.15)" : "none",
                }}
              >
                {msg.role === "user" ? (
                  <span style={{ fontSize: 13, lineHeight: 1.6, color: "#e2e8f0", fontWeight: 500 }}>{msg.content}</span>
                ) : (
                  <div>{renderMarkdown(msg.content)}</div>
                )}
                {i === messages.length - 1 && streaming && (
                  <span className="inline-block w-1.5 h-4 ml-0.5 animate-pulse rounded-sm" style={{ background: "#0D9488" }} />
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Suggested cards panel */}
      {suggestedCards.length > 0 && !streaming && (
        <div className="rounded-lg overflow-hidden mb-3" style={{ background: "#111827", border: "1px solid #1E2535" }}>
          <div className="flex items-center justify-between" style={{ padding: "8px 12px", borderBottom: "1px solid #1E2535" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>Suggested Cards</span>
            <span style={{ fontSize: 10, color: "#334155" }}>{suggestedCards.length} cards</span>
          </div>
          <div style={{ maxHeight: 180, overflowY: "auto" }}>
            {suggestedCards.map((card, i) => (
              <div key={card.name} className="flex items-center gap-2" style={{ padding: "5px 12px", borderBottom: i < suggestedCards.length - 1 ? "1px solid rgba(30,37,53,0.5)" : "none" }}>
                <span style={{ width: 18, fontSize: 10, fontWeight: 700, color: "#475569", textAlign: "right", flexShrink: 0 }}>{card.qty}×</span>
                <span className="flex-1" style={{ fontSize: 11.5, fontWeight: 500, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.name}</span>
              </div>
            ))}
          </div>
          {importResult ? (
            <div style={{ padding: "8px 12px", borderTop: "1px solid #1E2535", fontSize: 11, fontWeight: 600, color: importResult.startsWith("Error") ? "#f87171" : "#4ade80" }}>
              {importResult}
            </div>
          ) : (
            <button
              onClick={importToAPI}
              disabled={importing}
              style={{
                display: "block", width: "100%", padding: 8, border: "none",
                borderTop: "1px solid #1E2535", background: "rgba(13,148,136,0.06)",
                color: "#0D9488", fontSize: 11, fontWeight: 600, cursor: importing ? "not-allowed" : "pointer",
              }}
            >
              {importing ? "Importing…" : `+ Add All ${suggestedCards.length} Cards to Deck`}
            </button>
          )}
        </div>
      )}

      {/* Bottom input (shown in chat mode) */}
      {chatMode && (
        <div className="flex-shrink-0 rounded-xl overflow-hidden" style={{ background: "#111827", border: "1px solid #1E2535" }}>
          {/* Instructions indicator */}
          {customInstructions.trim() && (
            <div
              className="flex items-center gap-2 cursor-pointer"
              style={{ padding: "6px 14px", borderBottom: "1px solid #1E2535", fontSize: 10, color: "#0D9488" }}
              onClick={() => setShowInstructions(!showInstructions)}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838.838-2.872a2 2 0 0 1 .506-.855z"/>
              </svg>
              <span style={{ fontWeight: 600 }}>Instructions active</span>
              <span style={{ color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                — {customInstructions.trim().slice(0, 60)}{customInstructions.trim().length > 60 ? "…" : ""}
              </span>
            </div>
          )}
          {showInstructions && chatMode && (
            <div style={{ padding: "8px 14px", borderBottom: "1px solid #1E2535" }}>
              <textarea
                value={customInstructions}
                onChange={e => setCustomInstructions(e.target.value)}
                placeholder="Add custom instructions…"
                rows={2}
                style={{
                  width: "100%", background: "#0F1117", border: "1px solid #1E2535",
                  borderRadius: 6, padding: "8px 10px", fontSize: 11, lineHeight: 1.5,
                  color: "#e2e8f0", outline: "none", resize: "vertical",
                }}
              />
            </div>
          )}
          <div className="flex items-center gap-2" style={{ padding: "10px 12px" }}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              disabled={streaming}
              placeholder={streaming ? "Thinking…" : "Ask a follow-up…"}
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                fontSize: 13, fontWeight: 500, color: "#F8FAFC",
                opacity: streaming ? 0.5 : 1,
              }}
            />
            <button
              onClick={() => send()}
              disabled={streaming || !input.trim()}
              style={{
                padding: "8px 20px", borderRadius: 8, border: "none",
                background: streaming ? "#1E2535" : (!input.trim() ? "#1E2535" : "#0D9488"),
                color: streaming ? "#475569" : (!input.trim() ? "#334155" : "#fff"),
                fontSize: 12, fontWeight: 600,
                cursor: streaming || !input.trim() ? "default" : "pointer",
                transition: "all 0.15s", flexShrink: 0,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {streaming && (
                <span style={{
                  width: 12, height: 12, borderRadius: "50%",
                  border: "2px solid #334155", borderTopColor: "#475569",
                  animation: "spin 0.8s linear infinite",
                  display: "inline-block",
                }} />
              )}
              {streaming ? "Working" : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
