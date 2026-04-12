"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import {
  type RichCard,
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
type PoolMode = "mixed" | "owned" | "new";

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
  "Infect", "Group Hug", "Flicker", "Stompy", "Storm",
  "Lifegain", "Equipment", "Wheels", "Counters", "Sacrifice",
  "Burn", "Hatebears", "Cascade", "Treasure", "Dredge",
];

const PIP: Record<string, { bg: string; fg: string; letter: string; glow: string }> = {
  W: { bg: "#f9fafb", fg: "#1a1a1a", letter: "W", glow: "rgba(249,250,251,0.25)" },
  U: { bg: "#60a5fa", fg: "#1a1a1a", letter: "U", glow: "rgba(96,165,250,0.25)" },
  B: { bg: "#7e22ce", fg: "#e9d5ff", letter: "B", glow: "rgba(126,34,206,0.25)" },
  R: { bg: "#ef4444", fg: "#ffffff", letter: "R", glow: "rgba(239,68,68,0.25)" },
  G: { bg: "#16a34a", fg: "#ffffff", letter: "G", glow: "rgba(22,163,74,0.25)" },
  C: { bg: "#94a3b8", fg: "#1a1a1a", letter: "C", glow: "rgba(148,163,184,0.25)" },
};

function parseCards(text: string): { name: string; qty: number }[] {
  const match = text.match(/CARDS:\n([\s\S]*?)END_CARDS/);
  if (!match) return [];
  return match[1].split("\n").map(l => l.trim()).filter(Boolean)
    .map(line => { const m = line.match(/^(\d+)\s+(.+)$/); return m ? { qty: parseInt(m[1]), name: m[2] } : null; })
    .filter(Boolean) as { name: string; qty: number }[];
}

// ── Fan of cards SVG icon ────────────────────────────────────────────────────

function CardFanIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="6" y="6" width="11" height="16" rx="1.5" transform="rotate(-20 11.5 14)" stroke="#0D9488" strokeWidth="1.5" fill="rgba(13,148,136,0.06)" />
      <rect x="10.5" y="4" width="11" height="16" rx="1.5" stroke="#14b8a6" strokeWidth="1.5" fill="rgba(13,148,136,0.15)" />
      <rect x="15" y="6" width="11" height="16" rx="1.5" transform="rotate(20 20.5 14)" stroke="#0D9488" strokeWidth="1.5" fill="rgba(13,148,136,0.06)" />
    </svg>
  );
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
    const style = { paddingLeft: 14, margin: "5px 0", fontSize: 11.5, color: "#cbd5e1", lineHeight: 1.7 };
    elements.push(listOrdered
      ? <ol key={elements.length} style={style}>{items}</ol>
      : <ul key={elements.length} style={{ ...style, listStyleType: "disc" }}>{items}</ul>
    );
    listItems = [];
  }

  function renderInline(s: string): React.ReactNode {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} style={{ color: "#F8FAFC", fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) { if (!listOrdered && listItems.length > 0) flushList(); listOrdered = true; listItems.push(numMatch[2]); continue; }
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) { if (listOrdered && listItems.length > 0) flushList(); listOrdered = false; listItems.push(bulletMatch[1]); continue; }
    flushList();
    if (!trimmed) { elements.push(<div key={elements.length} style={{ height: 5 }} />); continue; }
    if (trimmed.endsWith(":") && trimmed.length < 60) {
      elements.push(<div key={elements.length} style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", marginTop: 12, marginBottom: 4, paddingBottom: 3, borderBottom: "1px solid rgba(30,37,53,0.4)", letterSpacing: "0.04em", textTransform: "uppercase" }}>{renderInline(trimmed)}</div>);
      continue;
    }
    elements.push(<p key={elements.length} style={{ margin: "3px 0", fontSize: 12, lineHeight: 1.7, color: "#cbd5e1" }}>{renderInline(trimmed)}</p>);
  }
  flushList();
  return elements;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AIArchitectTab({ deck, totalValue }: { deck: DeckData; totalValue: number }) {
  const [bracket, setBracket] = useState(3);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [poolMode, setPoolMode] = useState<PoolMode>("mixed");

  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [suggestedCards, setSuggestedCards] = useState<{ name: string; qty: number }[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const chatMode = messages.length > 0;

  const stats = useMemo(() => computeStats(deck.cards, totalValue), [deck.cards, totalValue]);
  const issues = useMemo(() => analyzeDeckHealth(deck.cards, deck.format), [deck.cards, deck.format]);
  const grade = useMemo(() => computeHealthGrade(issues), [issues]);
  const landCount = useMemo(() => deck.cards.filter(c => c.variant?.typeLine?.includes("Land")).reduce((n, c) => n + c.quantity, 0), [deck.cards]);
  const colorTotal = stats.colorCounts.reduce((s, c) => s + c.count, 0);
  const curveMax = Math.max(...stats.manaCurve.map(c => c.count), 1);
  const gradeColor = grade.startsWith("A") ? "#22c55e" : grade.startsWith("B") ? "#f59e0b" : "#ef4444";

  const toggleGoal = (g: string) => setSelectedGoals(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);

  const commanderName = deck.commander ?? null;
  const deckContext = [
    `Deck: ${deck.name}`, `Format: ${deck.format}`,
    commanderName ? `Commander: ${commanderName}` : `Commander: not yet selected (deck name "${deck.name}" may hint at the intended commander — search Scryfall if unsure)`,
    `Power bracket: ${bracket} — ${BRACKET_LABELS[bracket]}`,
    selectedTheme ? `Deck theme/archetype: ${selectedTheme}` : "",
    selectedGoals.length > 0 ? `Strategy goals: ${selectedGoals.join(", ")}` : "",
    `Collection preference: ${{ mixed: "Prefer owned cards, but suggest new where upgrades exist.", owned: "Only suggest cards the user already owns.", new: "Suggest best cards regardless of collection." }[poolMode]}`,
    customInstructions.trim() ? `\nUser instructions: ${customInstructions.trim()}` : "",
    `Cards (${stats.totalCards} total):`,
    deck.cards.slice(0, 50).map(c => `${c.quantity}x ${c.cardName}`).join("\n"),
  ].filter(Boolean).join("\n");

  const send = useCallback(async (msg?: string) => {
    const text = msg ?? input;
    if (!text.trim() || streaming) return;
    const userMsg: AiMessage = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next); setInput(""); setStreaming(true); setSuggestedCards([]); setImportResult(null);
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/architect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next, deckContext }) });
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6); if (data === "[DONE]") break;
            try { full += JSON.parse(data).text; setMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: full }]); } catch {}
          }
        }
      }
      setSuggestedCards(parseCards(full));
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      setMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: `Error: ${(err as Error).message}` }]);
    } finally { setStreaming(false); }
  }, [input, messages, streaming, deckContext]);

  async function importToAPI() {
    if (!suggestedCards.length) return; setImporting(true);
    try {
      const lines = suggestedCards.map(c => `${c.qty} ${c.name}`).join("\n");
      const res = await api.decks.importText(deck.id, lines, false);
      setImportResult(`Imported ${res.imported} cards`);
    } catch (e: unknown) { setImportResult(`Error: ${(e as Error).message}`); }
    finally { setImporting(false); }
  }

  // ── Shared styles ──────────────────────────────────────────────────────────

  const glass = { background: "rgba(17,24,39,0.55)", backdropFilter: "blur(12px)", border: "1px solid rgba(30,37,53,0.6)" };
  const chipStyle = (active: boolean, color = "teal") => ({
    padding: "4px 11px", borderRadius: 18, fontSize: 10, fontWeight: 600 as const, cursor: "pointer" as const,
    whiteSpace: "nowrap" as const, transition: "all 0.12s",
    background: active ? (color === "purple" ? "rgba(99,102,241,0.08)" : "rgba(13,148,136,0.1)") : "rgba(22,27,39,0.6)",
    border: `1px solid ${active ? (color === "purple" ? "rgba(99,102,241,0.25)" : "rgba(13,148,136,0.35)") : "rgba(30,37,53,0.6)"}`,
    color: active ? (color === "purple" ? "#818cf8" : "#0D9488") : "#64748b",
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 260px)", minHeight: 500 }}>

      {/* ── Top config bar ── */}
      <div style={{ ...glass, borderRadius: 12, padding: "8px 14px", marginBottom: 10, position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 0, left: "10%", right: "10%", height: 1, background: "linear-gradient(90deg, transparent, rgba(13,148,136,0.3), transparent)" }} />
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setBracket(b => b >= 5 ? 1 : b + 1)} style={{
            display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 11px", borderRadius: 18, fontSize: 10, fontWeight: 700,
            background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", color: "#f59e0b", cursor: "pointer",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#f59e0b", boxShadow: "0 0 5px rgba(245,158,11,0.4)", display: "inline-block" }} />
            Bracket {bracket}
          </button>
          <div style={{ width: 1, height: 16, background: "rgba(30,37,53,0.7)", margin: "0 2px" }} />
          {GOALS.map(g => <button key={g} onClick={() => toggleGoal(g)} style={chipStyle(selectedGoals.includes(g))}>{g}</button>)}
          <div style={{ width: 1, height: 16, background: "rgba(30,37,53,0.7)", margin: "0 2px" }} />
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(71,85,105,0.6)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 3px" }}>Theme</span>
          {THEMES.slice(0, chatMode ? 6 : 14).map(t => <button key={t} onClick={() => setSelectedTheme(prev => prev === t ? null : t)} style={chipStyle(selectedTheme === t, "purple")}>{t}</button>)}
          {!chatMode && THEMES.length > 14 && <span style={{ fontSize: 9, color: "#334155", padding: "0 4px" }}>+{THEMES.length - 14}</span>}
          <div style={{ width: 1, height: 16, background: "rgba(30,37,53,0.7)", margin: "0 2px" }} />
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(71,85,105,0.6)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 3px" }}>Pool</span>
          {(["Mixed", "Owned", "New"] as const).map(label => {
            const val = label.toLowerCase() as PoolMode;
            return <button key={val} onClick={() => setPoolMode(val)} style={chipStyle(poolMode === val)}>{label}</button>;
          })}
        </div>
      </div>

      {/* ── Main layout: sidebar + chat ── */}
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 10, flex: 1, overflow: "hidden" }}>

        {/* ── Sidebar ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", paddingRight: 4 }}>

          {/* Stats */}
          <div style={{ ...glass, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(71,85,105,0.7)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Deck Health</div>
            {[
              { label: "Cards", val: `${stats.totalCards}`, sub: deck.format.toLowerCase().includes("commander") ? " / 100" : "", color: undefined },
              { label: "Avg CMC", val: stats.avgCmc.toFixed(1), sub: "", color: undefined },
              { label: "Lands", val: String(landCount), sub: "", color: undefined },
              { label: "Value", val: `$${Math.round(totalValue)}`, sub: "", color: undefined },
              { label: "Health", val: grade, sub: "", color: gradeColor },
            ].map(({ label, val, sub, color }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "3px 0", borderBottom: "1px solid rgba(30,37,53,0.3)" }}>
                <span style={{ fontSize: 10, color: "#475569", fontWeight: 500 }}>{label}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: color ?? "#F8FAFC", letterSpacing: "-0.02em" }}>
                  {val}<span style={{ fontSize: 9, color: "#475569", fontWeight: 500 }}>{sub}</span>
                </span>
              </div>
            ))}
          </div>

          {/* Mana Curve */}
          <div style={{ ...glass, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(71,85,105,0.7)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Mana Curve</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 32 }}>
              {stats.manaCurve.map(({ cmc, count }) => {
                const pct = curveMax > 0 ? (count / curveMax) * 100 : 0;
                const isPeak = count === curveMax && count > 0;
                return (
                  <div key={cmc} style={{ flex: 1, height: `${pct}%`, minHeight: count > 0 ? 3 : 1 }}>
                    <div style={{
                      width: "100%", height: "100%", borderRadius: "2px 2px 0 0",
                      background: isPeak
                        ? "linear-gradient(180deg, #14b8a6, rgba(13,148,136,0.3))"
                        : `linear-gradient(180deg, rgba(13,148,136,${0.3 + (count / curveMax) * 0.3}), rgba(13,148,136,0.1))`,
                      boxShadow: isPeak ? "0 -2px 6px rgba(13,148,136,0.25)" : "none",
                    }} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Colors */}
          <div style={{ ...glass, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(71,85,105,0.7)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Colors</div>
            {colorTotal > 0 ? (
              <>
                <div style={{ display: "flex", gap: 1.5, height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                  {stats.colorCounts.map(({ color, count }) => (
                    <div key={color} style={{ width: `${(count / colorTotal) * 100}%`, background: PIP[color]?.bg ?? "#94a3b8", borderRadius: 2 }} />
                  ))}
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {stats.colorCounts.map(({ color }) => {
                    const p = PIP[color];
                    return p ? (
                      <span key={color} style={{ width: 14, height: 14, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 800, background: p.bg, color: p.fg, boxShadow: `0 0 5px ${p.glow}` }}>{p.letter}</span>
                    ) : null;
                  })}
                </div>
              </>
            ) : <span style={{ fontSize: 10, color: "#334155" }}>No cards yet</span>}
          </div>

          {/* Issues */}
          {issues.length > 0 && (
            <div style={{ ...glass, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(71,85,105,0.7)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Issues</div>
              {issues.map((issue, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: i < issues.length - 1 ? "1px solid rgba(30,37,53,0.25)" : "none", fontSize: 10, color: "#94a3b8", fontWeight: 500 }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                    background: issue.severity === "critical" ? "#ef4444" : issue.severity === "warning" ? "#f59e0b" : "#22c55e",
                    boxShadow: `0 0 4px ${issue.severity === "critical" ? "rgba(239,68,68,0.4)" : issue.severity === "warning" ? "rgba(245,158,11,0.3)" : "rgba(34,197,94,0.3)"}`,
                  }} />
                  <span style={{ flex: 1 }}>{issue.text}</span>
                  {issue.action && (
                    <button onClick={() => send(`${issue.action} — ${issue.text}`)} style={{
                      marginLeft: "auto", fontSize: 9, fontWeight: 600, color: "#0D9488", cursor: "pointer",
                      padding: "2px 8px", borderRadius: 6, background: "rgba(13,148,136,0.06)", border: "1px solid rgba(13,148,136,0.15)",
                    }}>{issue.action}</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Chat column ── */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Command hero (before chat starts) */}
          {!chatMode && (
            <div style={{ ...glass, borderRadius: 14, marginBottom: 10, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: "5%", right: "5%", height: 1, background: "linear-gradient(90deg, transparent, rgba(13,148,136,0.4), transparent)" }} />
              <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: 40, background: "radial-gradient(ellipse at center top, rgba(13,148,136,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: "linear-gradient(135deg, rgba(13,148,136,0.2), rgba(13,148,136,0.05))",
                  border: "1px solid rgba(13,148,136,0.25)", display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 0 10px rgba(13,148,136,0.1)",
                }}>
                  <CardFanIcon size={18} />
                </div>
                <input
                  type="text" value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && send()}
                  placeholder="What do you want to build?"
                  style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 14, fontWeight: 500, color: "#F8FAFC" }}
                />
                <button onClick={() => send()} disabled={!input.trim()} style={{
                  padding: "8px 22px", borderRadius: 9, border: "none",
                  background: input.trim() ? "linear-gradient(135deg, #0D9488, #0f766e)" : "rgba(30,37,53,0.6)",
                  color: input.trim() ? "#fff" : "#334155", fontSize: 11, fontWeight: 600,
                  cursor: input.trim() ? "pointer" : "default", flexShrink: 0, transition: "all 0.15s",
                  boxShadow: input.trim() ? "0 0 16px rgba(13,148,136,0.2)" : "none",
                }}>Send</button>
              </div>
              {/* Instructions toggle */}
              <div style={{ padding: "0 16px 8px" }}>
                <button onClick={() => setShowInstructions(!showInstructions)} style={{
                  fontSize: 9, fontWeight: 600, color: customInstructions.trim() ? "#0D9488" : "#334155",
                  background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, marginBottom: showInstructions ? 6 : 0,
                }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838.838-2.872a2 2 0 0 1 .506-.855z"/></svg>
                  {showInstructions ? "Hide instructions" : customInstructions.trim() ? "Edit instructions" : "Add custom instructions"}
                </button>
                {showInstructions && (
                  <textarea value={customInstructions} onChange={e => setCustomInstructions(e.target.value)}
                    placeholder="e.g. Keep budget under $200, avoid infinite combos, focus on ETB triggers..."
                    rows={2} style={{
                      width: "100%", background: "#0F1117", border: "1px solid rgba(30,37,53,0.6)", borderRadius: 6,
                      padding: "8px 10px", fontSize: 11, lineHeight: 1.5, color: "#e2e8f0", outline: "none", resize: "vertical",
                    }} />
                )}
              </div>
              {/* Quick actions */}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "0 10px 10px" }}>
                {["Build remaining deck", "Suggest upgrades", "Find synergies", "Budget swaps", "How to pilot"].map(label => (
                  <button key={label} onClick={() => send(label)} style={{
                    padding: "6px 14px", borderRadius: 8, fontSize: 10.5, fontWeight: 500,
                    background: "rgba(15,17,23,0.5)", border: "1px solid rgba(30,37,53,0.5)", color: "#64748b",
                    cursor: "pointer", transition: "all 0.12s", display: "flex", alignItems: "center", gap: 5,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(13,148,136,0.3)"; e.currentTarget.style.color = "#0D9488"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(30,37,53,0.5)"; e.currentTarget.style.color = "#64748b"; }}
                  >
                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(13,148,136,0.35)", display: "inline-block" }} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat messages */}
          {chatMode && (
            <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 14, justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  {msg.role === "assistant" && (
                    <div style={{
                      width: 28, height: 28, borderRadius: 9, flexShrink: 0, marginTop: 2,
                      background: "linear-gradient(135deg, rgba(13,148,136,0.2), rgba(13,148,136,0.05))",
                      border: "1px solid rgba(13,148,136,0.25)", display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "0 0 8px rgba(13,148,136,0.08)",
                    }}>
                      <CardFanIcon size={14} />
                    </div>
                  )}
                  <div style={{
                    maxWidth: msg.role === "user" ? "82%" : "88%",
                    padding: msg.role === "user" ? "10px 16px" : "14px 18px",
                    borderRadius: msg.role === "user" ? "13px 13px 4px 13px" : "13px 13px 13px 4px",
                    background: msg.role === "user" ? "rgba(13,148,136,0.07)" : undefined,
                    ...(msg.role === "assistant" ? glass : {}),
                    border: `1px solid ${msg.role === "user" ? "rgba(13,148,136,0.18)" : "rgba(30,37,53,0.6)"}`,
                    boxShadow: msg.role === "assistant" ? "0 3px 16px rgba(0,0,0,0.12)" : "none",
                  }}>
                    {msg.role === "user" ? (
                      <span style={{ fontSize: 12.5, lineHeight: 1.6, color: "#e2e8f0", fontWeight: 500 }}>{msg.content}</span>
                    ) : (
                      <div>{renderMarkdown(msg.content)}</div>
                    )}
                    {i === messages.length - 1 && streaming && (
                      <span style={{ display: "inline-block", width: 2, height: 14, background: "#0D9488", borderRadius: 1, animation: "blink 1s step-end infinite", marginLeft: 2, verticalAlign: "text-bottom" }} />
                    )}
                  </div>
                </div>
              ))}

              {/* Suggested cards */}
              {suggestedCards.length > 0 && !streaming && (
                <div style={{ ...glass, borderRadius: 10, overflow: "hidden", margin: "6px 0 14px 38px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", borderBottom: "1px solid rgba(30,37,53,0.4)" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>Suggested Cards</span>
                    <span style={{ fontSize: 9, color: "#334155" }}>{suggestedCards.length} cards</span>
                  </div>
                  <div style={{ maxHeight: 160, overflowY: "auto" }}>
                    {suggestedCards.map((card, i) => (
                      <div key={card.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderBottom: i < suggestedCards.length - 1 ? "1px solid rgba(30,37,53,0.2)" : "none" }}>
                        <span style={{ width: 16, fontSize: 10, fontWeight: 700, color: "#475569", textAlign: "right", flexShrink: 0 }}>{card.qty}x</span>
                        <span style={{ fontSize: 11, fontWeight: 500, color: "#e2e8f0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.name}</span>
                      </div>
                    ))}
                  </div>
                  {importResult ? (
                    <div style={{ padding: "7px 12px", borderTop: "1px solid rgba(30,37,53,0.4)", fontSize: 10, fontWeight: 600, color: importResult.startsWith("Error") ? "#f87171" : "#4ade80" }}>{importResult}</div>
                  ) : (
                    <button onClick={importToAPI} disabled={importing} style={{
                      display: "block", width: "100%", padding: 7, border: "none", borderTop: "1px solid rgba(30,37,53,0.4)",
                      background: "rgba(13,148,136,0.05)", color: "#0D9488", fontSize: 10, fontWeight: 600, cursor: importing ? "not-allowed" : "pointer",
                    }}>{importing ? "Importing…" : `+ Add All ${suggestedCards.length} Cards`}</button>
                  )}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Bottom input (chat mode) */}
          {chatMode && (
            <div style={{ ...glass, borderRadius: 12, overflow: "hidden", marginTop: 8, flexShrink: 0 }}>
              {customInstructions.trim() && (
                <div onClick={() => setShowInstructions(!showInstructions)} style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "6px 14px",
                  borderBottom: "1px solid rgba(30,37,53,0.3)", fontSize: 9, fontWeight: 600, color: "#0D9488", cursor: "pointer",
                }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838.838-2.872a2 2 0 0 1 .506-.855z"/></svg>
                  Instructions active
                  <span style={{ color: "#334155", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>— {customInstructions.trim().slice(0, 60)}</span>
                </div>
              )}
              {showInstructions && chatMode && (
                <div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(30,37,53,0.3)" }}>
                  <textarea value={customInstructions} onChange={e => setCustomInstructions(e.target.value)} placeholder="Add instructions…" rows={2}
                    style={{ width: "100%", background: "#0F1117", border: "1px solid rgba(30,37,53,0.5)", borderRadius: 6, padding: "8px 10px", fontSize: 11, lineHeight: 1.5, color: "#e2e8f0", outline: "none", resize: "vertical" }} />
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
                <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
                  disabled={streaming} placeholder={streaming ? "Thinking…" : "Ask a follow-up…"}
                  style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, fontWeight: 500, color: "#F8FAFC", opacity: streaming ? 0.5 : 1 }} />
                <button onClick={() => send()} disabled={streaming || !input.trim()} style={{
                  padding: "8px 20px", borderRadius: 9, border: "none", fontSize: 11, fontWeight: 600, cursor: streaming || !input.trim() ? "default" : "pointer",
                  flexShrink: 0, display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
                  background: streaming ? "rgba(30,37,53,0.6)" : !input.trim() ? "rgba(30,37,53,0.6)" : "linear-gradient(135deg, #0D9488, #0f766e)",
                  color: streaming ? "#475569" : !input.trim() ? "#334155" : "#fff",
                  boxShadow: !streaming && input.trim() ? "0 0 12px rgba(13,148,136,0.15)" : "none",
                }}>
                  {streaming && <span style={{ width: 11, height: 11, borderRadius: "50%", border: "2px solid rgba(71,85,105,0.3)", borderTopColor: "#475569", animation: "spin 0.8s linear infinite", display: "inline-block" }} />}
                  {streaming ? "Working" : "Send"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
