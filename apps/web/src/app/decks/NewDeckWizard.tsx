"use client";

import { useState, useEffect, useRef } from "react";
import { api, type Deck } from "@/lib/api";

// ─── Format definitions ───────────────────────────────────────────────────────

interface FormatDef {
  id: string;
  label: string;
  color: string;
  rgb: string;
  icon: string;
  needsCommander: boolean;
}

const FORMAT_GROUPS: { label: string; formats: FormatDef[] }[] = [
  {
    label: "Singleton",
    formats: [
      { id: "commander",      label: "Commander",     color: "#16a34a", rgb: "22,163,74",   icon: "👑", needsCommander: true },
      { id: "oathbreaker",    label: "Oathbreaker",   color: "#8b5cf6", rgb: "139,92,246",  icon: "⚔️", needsCommander: true },
      { id: "brawl",          label: "Brawl",         color: "#14b8a6", rgb: "20,184,166",  icon: "🏆", needsCommander: true },
      { id: "historic-brawl", label: "Historic Brawl",color: "#a78bfa", rgb: "167,139,250", icon: "📜", needsCommander: true },
    ],
  },
  {
    label: "60-Card Competitive",
    formats: [
      { id: "standard", label: "Standard", color: "#0D9488", rgb: "13,148,136",  icon: "🃏", needsCommander: false },
      { id: "pioneer",  label: "Pioneer",  color: "#6366f1", rgb: "99,102,241",  icon: "🃏", needsCommander: false },
      { id: "modern",   label: "Modern",   color: "#f59e0b", rgb: "245,158,11",  icon: "🃏", needsCommander: false },
      { id: "legacy",   label: "Legacy",   color: "#ec4899", rgb: "236,72,153",  icon: "🃏", needsCommander: false },
      { id: "vintage",  label: "Vintage",  color: "#ef4444", rgb: "239,68,68",   icon: "💎", needsCommander: false },
      { id: "pauper",   label: "Pauper",   color: "#64748b", rgb: "100,116,139", icon: "🃏", needsCommander: false },
    ],
  },
  {
    label: "Arena & Digital",
    formats: [
      { id: "explorer", label: "Explorer", color: "#22d3ee", rgb: "34,211,238",  icon: "🃏", needsCommander: false },
      { id: "historic", label: "Historic", color: "#818cf8", rgb: "129,140,248", icon: "🃏", needsCommander: false },
      { id: "alchemy",  label: "Alchemy",  color: "#f472b6", rgb: "244,114,182", icon: "🧪", needsCommander: false },
      { id: "timeless", label: "Timeless", color: "#fb923c", rgb: "251,146,60",  icon: "⏳", needsCommander: false },
    ],
  },
  {
    label: "Other",
    formats: [
      { id: "penny-dreadful", label: "Penny Dreadful", color: "#94a3b8", rgb: "148,163,184", icon: "🪙", needsCommander: false },
      { id: "custom",         label: "Custom",          color: "#475569", rgb: "71,85,105",   icon: "✏️", needsCommander: false },
    ],
  },
];

const DEFAULT_FORMAT = FORMAT_GROUPS[0].formats[0]; // commander

// ─── Scryfall types ───────────────────────────────────────────────────────────

interface ScryfallCard {
  name: string;
  type_line: string;
  color_identity: string[];
  image_uris?: { art_crop: string };
  card_faces?: Array<{ image_uris?: { art_crop: string } }>;
}

function cardArt(c: ScryfallCard): string | null {
  return c.image_uris?.art_crop ?? c.card_faces?.[0]?.image_uris?.art_crop ?? null;
}

const PIP_COLOR: Record<string, { bg: string; fg: string }> = {
  W: { bg: "#f9fafb", fg: "#1a1a1a" },
  U: { bg: "#60a5fa", fg: "#1a1a1a" },
  B: { bg: "#7e22ce", fg: "#e9d5ff" },
  R: { bg: "#ef4444", fg: "#ffffff" },
  G: { bg: "#16a34a", fg: "#ffffff" },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onCreated: (deck: Deck) => void;
}

export function NewDeckWizard({ onClose, onCreated }: Props) {
  const [step, setStep]               = useState<1 | 2>(1);
  const [name, setName]               = useState("");
  const [format, setFormat]           = useState<FormatDef>(DEFAULT_FORMAT);
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [cmdQuery, setCmdQuery]       = useState("");
  const [cmdResults, setCmdResults]   = useState<ScryfallCard[]>([]);
  const [selectedCmd, setSelectedCmd] = useState<ScryfallCard | null>(null);
  const [creating, setCreating]       = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  // Debounced Scryfall commander/planeswalker search
  useEffect(() => {
    if (!format.needsCommander || !cmdQuery.trim()) {
      setCmdResults([]);
      return;
    }
    const q = format.id === "oathbreaker"
      ? `type:planeswalker name:/${encodeURIComponent(cmdQuery)}/`
      : `is:commander name:/${encodeURIComponent(cmdQuery)}/`;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.scryfall.com/cards/search?q=${q}&order=edhrec`,
          { headers: { Accept: "application/json" } }
        );
        if (!res.ok) { setCmdResults([]); return; }
        const data = await res.json() as { data: ScryfallCard[] };
        const results = data.data.slice(0, 6);
        setCmdResults(results);
        // Auto-select the first result
        if (results.length > 0 && !selectedCmd) {
          setSelectedCmd(results[0]);
        }
      } catch {
        setCmdResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [cmdQuery, format]);

  function pickFormat(f: FormatDef) {
    setFormat(f);
    setDrawerOpen(false);
    setSelectedCmd(null);
    setCmdQuery("");
    setCmdResults([]);
  }

  async function handleCreate() {
    if (!name.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const hasCommander = format.needsCommander && selectedCmd;
      const res = await api.decks.create({
        name: name.trim(),
        format: format.id,
        ...(hasCommander ? {
          commander: selectedCmd.name,
          cards: [{ cardName: selectedCmd.name, quantity: 1, section: "commander" as const }],
        } : {}),
      });
      onCreated(res.deck);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create deck. Please try again.");
      setCreating(false);
    }
  }

  const canProceed = name.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(6,8,16,0.88)", backdropFilter: "blur(10px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col w-full"
        style={{
          maxWidth: 520,
          maxHeight: "calc(100vh - 80px)",
          background: "#111827",
          border: "1px solid #1E2535",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(13,148,136,0.08)",
        }}
      >
        {/* Progress dots + close button */}
        <div className="flex items-center flex-shrink-0" style={{ padding: "20px 28px 0" }}>
          <div className="flex items-center gap-2 flex-1">
            {([1, 2] as const).map((n) => (
              <div
                key={n}
                style={{
                  height: 6,
                  borderRadius: step === n ? 3 : "50%",
                  width: step === n ? 24 : 6,
                  background: n <= step ? "#0D9488" : "#1E2535",
                  opacity: n < step ? 0.4 : 1,
                  transition: "all 0.25s",
                }}
              />
            ))}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8, border: "none",
              background: "transparent", color: "#475569", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, lineHeight: 1,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#1E2535"; (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#475569"; }}
          >
            ×
          </button>
        </div>

        {/* ── STEP 1: Name ── */}
        {step === 1 && (
          <>
            <div className="flex-1 overflow-y-auto">
              <div style={{ padding: "20px 28px 0" }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#0D9488", textTransform: "uppercase", marginBottom: 4 }}>
                  Step 1 of 2
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#F8FAFC" }}>Name your deck</div>
                <div style={{ fontSize: 13, color: "#475569", marginTop: 3 }}>You can always rename it later</div>
              </div>
              <div style={{ padding: "24px 28px 20px" }}>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && canProceed) setStep(2); }}
                  placeholder="e.g. Atraxa Superfriends, Budget Burn…"
                  style={{
                    width: "100%",
                    background: "#0F1117",
                    border: "1px solid #1E2535",
                    borderRadius: 12,
                    padding: "14px 16px",
                    fontSize: 16,
                    fontWeight: 500,
                    color: "#F8FAFC",
                    outline: "none",
                    caretColor: "#0D9488",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#0D9488"; }}
                  onBlur={(e)  => { (e.target as HTMLInputElement).style.borderColor = "#1E2535"; }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, padding: "14px 28px 22px", borderTop: "1px solid #1E2535", background: "#111827", flexShrink: 0 }}>
              <button
                onClick={() => setStep(2)}
                disabled={!canProceed}
                style={{
                  flex: 1, padding: "11px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                  background: canProceed ? "#0D9488" : "#1E2535",
                  color: canProceed ? "#fff" : "#334155",
                  border: "none", cursor: canProceed ? "pointer" : "not-allowed",
                  transition: "all 0.15s",
                }}
              >
                Continue →
              </button>
            </div>
          </>
        )}

        {/* ── STEP 2: Commander / Format ── */}
        {step === 2 && (
          <>
            <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
              <div style={{ padding: "20px 28px 0" }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#0D9488", textTransform: "uppercase", marginBottom: 4 }}>
                  Step 2 of 2
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#F8FAFC" }}>
                  {format.id === "oathbreaker"
                    ? "Choose your oathbreaker"
                    : format.needsCommander
                    ? "Choose your commander"
                    : "Format selected"}
                </div>
                <div style={{ fontSize: 13, color: "#475569", marginTop: 3 }}>
                  {format.id === "oathbreaker"
                    ? "Pick a planeswalker to lead your 60-card deck"
                    : format.needsCommander
                    ? "Search for a legendary creature to lead your deck"
                    : `${format.label} · no commander needed`}
                </div>
              </div>

              <div style={{ padding: "16px 28px 0" }}>
                {/* Active format pill + change button */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "6px 12px 6px 10px", borderRadius: 20,
                    background: `rgba(${format.rgb},0.10)`,
                    border: `1px solid rgba(${format.rgb},0.25)`,
                    fontSize: 12, fontWeight: 600, color: format.color,
                  }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: format.color }} />
                    {format.label}
                  </div>
                  <button
                    onClick={() => setDrawerOpen(!drawerOpen)}
                    style={{
                      fontSize: 11, color: "#334155", background: "none",
                      border: "1px solid #1E2535", cursor: "pointer",
                      padding: "4px 10px", borderRadius: 6, fontWeight: 500,
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.color = "#94a3b8"; }}
                    onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.color = "#334155"; }}
                  >
                    {drawerOpen ? "Close ↑" : "Change format ↓"}
                  </button>
                </div>

                {/* Format drawer */}
                <div style={{
                  background: "#0F1117",
                  border: drawerOpen ? "1px solid #1E2535" : "none",
                  borderRadius: 14,
                  overflow: "hidden",
                  marginBottom: drawerOpen ? 14 : 0,
                  maxHeight: drawerOpen ? 420 : 0,
                  transition: "max-height 0.28s ease, margin-bottom 0.28s ease",
                }}>
                  <div style={{ padding: 12 }}>
                    {FORMAT_GROUPS.map((group) => (
                      <div key={group.label}>
                        <div style={{
                          fontSize: "9.5px", fontWeight: 700, letterSpacing: "0.1em",
                          textTransform: "uppercase", color: "#334155",
                          margin: "8px 4px 6px", display: "block",
                        }}>
                          {group.label}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 4 }}>
                          {group.formats.map((f) => (
                            <button
                              key={f.id}
                              onClick={() => pickFormat(f)}
                              style={{
                                padding: "5px 11px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                                whiteSpace: "nowrap", cursor: "pointer",
                                background: format.id === f.id ? `rgba(${f.rgb},0.10)` : "#161B27",
                                border: `1px solid ${format.id === f.id ? f.color : "#1E2535"}`,
                                color: format.id === f.id ? f.color : "#94a3b8",
                                transition: "all 0.12s",
                              }}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Commander search (singleton formats) */}
                {format.needsCommander && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: "#475569", textTransform: "uppercase", marginBottom: 8 }}>
                      {format.id === "oathbreaker" ? "Oathbreaker (Planeswalker)" : "Commander"}
                    </div>
                    <input
                      type="text"
                      value={cmdQuery}
                      onChange={(e) => setCmdQuery(e.target.value)}
                      placeholder={format.id === "oathbreaker" ? "Search planeswalkers…" : "Search legendary creatures…"}
                      style={{
                        width: "100%", background: "#0F1117", border: "1px solid #1E2535",
                        borderRadius: 10, padding: "11px 14px", fontSize: 13,
                        color: "#F8FAFC", outline: "none", caretColor: "#16a34a",
                        transition: "border-color 0.15s",
                      }}
                      onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#16a34a"; }}
                      onBlur={(e)  => { (e.target as HTMLInputElement).style.borderColor = "#1E2535"; }}
                    />
                    {/* Selected commander indicator */}
                    {selectedCmd && (
                      <div style={{
                        marginTop: 8, padding: "8px 12px", borderRadius: 8,
                        background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.25)",
                        display: "flex", alignItems: "center", gap: 8,
                        fontSize: 12, color: "#22c55e", fontWeight: 600,
                      }}>
                        <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#22c55e", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>✓</span>
                        {selectedCmd.name}
                      </div>
                    )}
                    {cmdResults.length > 0 && (
                      <div style={{ marginTop: 6, background: "#0F1117", border: "1px solid #1E2535", borderRadius: 10, overflow: "hidden" }}>
                        {cmdResults.map((card, i) => {
                          const isSelected = selectedCmd?.name === card.name;
                          return (
                            <div
                              key={card.name}
                              onClick={() => setSelectedCmd(card)}
                              style={{
                                display: "flex", alignItems: "center", gap: 10,
                                padding: "9px 12px", cursor: "pointer",
                                background: isSelected ? "rgba(22,163,74,0.09)" : "transparent",
                                borderLeft: isSelected ? "3px solid #22c55e" : "3px solid transparent",
                                borderBottom: i < cmdResults.length - 1 ? "1px solid #1E2535" : "none",
                                transition: "all 0.1s",
                              }}
                            >
                              <div style={{ width: 30, height: 22, borderRadius: 3, overflow: "hidden", background: "#1E2535", flexShrink: 0 }}>
                                {cardArt(card) && (
                                  <img src={cardArt(card)!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                )}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: isSelected ? 600 : 500, color: isSelected ? "#F8FAFC" : "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {card.name}
                                </div>
                                <div style={{ fontSize: 10, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {card.type_line}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                                {card.color_identity.map((c) => {
                                  const pip = PIP_COLOR[c];
                                  return pip ? (
                                    <div key={c} style={{
                                      width: 11, height: 11, borderRadius: "50%",
                                      fontSize: 7, fontWeight: 900,
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                      background: pip.bg, color: pip.fg,
                                    }}>
                                      {c}
                                    </div>
                                  ) : null;
                                })}
                              </div>
                              {isSelected && (
                                <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 700, flexShrink: 0 }}>Selected</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Non-commander note */}
                {!format.needsCommander && (
                  <div style={{
                    padding: "14px 16px", background: "#0F1117", border: "1px solid #1E2535",
                    borderRadius: 10, fontSize: 12, color: "#475569", lineHeight: 1.6,
                  }}>
                    <span style={{ color: "#94a3b8", fontWeight: 600 }}>{format.label}</span> doesn&apos;t use a commander.
                    Your deck will start empty — you can import a list or search for cards in the editor.
                  </div>
                )}
              </div>
              <div style={{ height: 12 }} />
            </div>

            {/* Footer */}
            <div style={{ flexShrink: 0, borderTop: "1px solid #1E2535", background: "#111827" }}>
              {error && (
                <div style={{ padding: "10px 28px 0", fontSize: 12, color: "#f87171" }}>
                  {error}
                </div>
              )}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "14px 28px 22px",
            }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  flexShrink: 0, padding: "10px 18px", borderRadius: 10,
                  fontSize: 13, fontWeight: 500, background: "transparent",
                  color: "#475569", border: "1px solid #1E2535", cursor: "pointer",
                }}
              >
                Back
              </button>
              {format.needsCommander && (
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  style={{
                    fontSize: 12, color: "#334155", background: "none",
                    border: "none", cursor: creating ? "not-allowed" : "pointer",
                    padding: "10px 12px", whiteSpace: "nowrap",
                  }}
                >
                  Skip commander
                </button>
              )}
              <button
                onClick={handleCreate}
                disabled={creating}
                style={{
                  flex: 1, padding: "11px 20px", borderRadius: 10,
                  fontSize: 13, fontWeight: 600,
                  background: "linear-gradient(135deg, #0D9488, #0f766e)",
                  color: "#fff", border: "none",
                  cursor: creating ? "not-allowed" : "pointer",
                  opacity: creating ? 0.6 : 1,
                  boxShadow: "0 0 24px rgba(13,148,136,0.22)",
                  transition: "opacity 0.15s",
                }}
              >
                {creating ? "Creating…" : "Create Deck →"}
              </button>
            </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
