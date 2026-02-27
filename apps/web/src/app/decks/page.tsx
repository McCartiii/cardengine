"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Deck } from "@/lib/api";
import Link from "next/link";
import { NetworkError } from "@/components/NetworkError";

const FORMAT_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  commander: { bg: "rgba(139,92,246,0.12)", text: "#c4b5fd", border: "rgba(139,92,246,0.3)" },
  standard:  { bg: "rgba(16,185,129,0.12)", text: "#6ee7b7", border: "rgba(16,185,129,0.3)" },
  modern:    { bg: "rgba(59,130,246,0.12)", text: "#93c5fd", border: "rgba(59,130,246,0.3)" },
  pioneer:   { bg: "rgba(249,115,22,0.12)", text: "#fdba74", border: "rgba(249,115,22,0.3)" },
  legacy:    { bg: "rgba(239,68,68,0.12)",  text: "#fca5a5", border: "rgba(239,68,68,0.3)" },
  vintage:   { bg: "rgba(234,179,8,0.12)",  text: "#fde047", border: "rgba(234,179,8,0.3)" },
  pauper:    { bg: "rgba(107,114,128,0.12)", text: "#9ca3af", border: "rgba(107,114,128,0.3)" },
};

const FORMATS = ["commander", "standard", "modern", "pioneer", "legacy", "vintage", "pauper"];

const IMPORT_PLACEHOLDER = `Commander
1 Atraxa, Praetors' Voice

1 Sol Ring
1 Command Tower
1 Arcane Signet
4 Lightning Bolt

Sideboard
2 Negate`;

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

const onFocusBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
  (e.target as HTMLElement).style.borderColor = "rgba(139,92,246,0.5)";
};
const onBlurBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
  (e.target as HTMLElement).style.borderColor = "#2a1f4a";
};

export default function DecksPage() {
  const router = useRouter();
  const [decks, setDecks]           = useState<Deck[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createTab, setCreateTab]   = useState<"blank" | "import">("blank");

  // Shared form state
  const [newName, setNewName]           = useState("");
  const [newFormat, setNewFormat]       = useState("commander");
  const [newCommander, setNewCommander] = useState("");

  // Import-specific state
  const [importText, setImportText]     = useState("");
  const [importResult, setImportResult] = useState<string | null>(null);
  const [creating, setCreating]         = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    api.decks.list()
      .then(({ decks: d }) => setDecks(d))
      .catch((e: Error) => {
        const isNet = e.message === "Load failed" || e.message === "Failed to fetch" || e.name === "TypeError";
        setError(isNet ? "network" : e.message);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const resetModal = () => {
    setShowCreate(false);
    setCreateTab("blank");
    setNewName(""); setNewCommander(""); setNewFormat("commander");
    setImportText(""); setImportResult(null);
  };

  const handleCreateBlank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.decks.create({ name: newName.trim(), format: newFormat, commander: newCommander.trim() || undefined });
      resetModal();
      load();
    } finally {
      setCreating(false);
    }
  };

  const handleCreateImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !importText.trim()) return;
    setCreating(true);
    setImportResult(null);
    try {
      const { deck } = await api.decks.create({
        name: newName.trim(),
        format: newFormat,
        commander: newCommander.trim() || undefined,
      });
      const res = await api.decks.importText(deck.id, importText.trim());
      const resolved = (res as typeof res & { resolved?: number }).resolved ?? res.imported;
      setImportResult(`✓ Imported ${res.imported} cards (${resolved} resolved to prices)`);
      setTimeout(() => {
        resetModal();
        router.push(`/decks/${deck.id}`);
      }, 900);
    } catch (err: unknown) {
      setImportResult(`Error: ${(err as Error).message}`);
      setCreating(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-4xl font-black mb-2"><span className="gradient-text">Decks</span></h1>
          <p className="text-sm" style={{ color: "#7c6f9a" }}>Build and manage your decklists</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-200"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 0 20px rgba(124,58,237,0.25)" }}
        >
          <span className="text-lg leading-none">+</span> New Deck
        </button>
      </div>

      {/* Error */}
      {!loading && error === "network" && <NetworkError onRetry={load} />}
      {!loading && error && error !== "network" && (
        <p className="text-sm animate-enter" style={{ color: "#fca5a5" }}>{error}</p>
      )}

      {/* Skeleton */}
      {loading && (
        <div className="space-y-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="rounded-2xl p-4 flex items-center gap-4" style={{ background: "#110d1f", border: "1px solid #2a1f4a" }}>
              <div className="skeleton h-5 w-24 rounded-lg shrink-0" />
              <div className="skeleton h-5 flex-1 rounded" />
              <div className="skeleton h-4 w-16 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Deck list */}
      {!loading && !error && (
        <div className="space-y-3">
          {decks.map((deck, i) => {
            const fc = FORMAT_COLOR[deck.format] ?? { bg: "rgba(107,114,128,0.12)", text: "#9ca3af", border: "rgba(107,114,128,0.3)" };
            return (
              <Link
                key={deck.id}
                href={`/decks/${deck.id}`}
                className="group flex items-center gap-4 rounded-2xl p-4 transition-all duration-200 animate-enter"
                style={{ background: "#110d1f", border: "1px solid #2a1f4a", animationDelay: `${i * 50}ms` }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLAnchorElement).style.background = "#1a1430";
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(139,92,246,0.35)";
                  (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 0 20px rgba(139,92,246,0.12)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLAnchorElement).style.background = "#110d1f";
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = "#2a1f4a";
                  (e.currentTarget as HTMLAnchorElement).style.boxShadow = "none";
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="text-xs px-2.5 py-1 rounded-lg font-semibold"
                      style={{ background: fc.bg, color: fc.text, border: `1px solid ${fc.border}` }}>
                      {deck.format}
                    </span>
                    <h3 className="font-bold text-white truncate">{deck.name}</h3>
                  </div>
                  {deck.commander && <p className="text-sm truncate" style={{ color: "#7c6f9a" }}>{deck.commander}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium text-white">{deck._count?.cards ?? 0} cards</p>
                  <p className="text-xs mt-0.5" style={{ color: "#7c6f9a" }}>{new Date(deck.updatedAt).toLocaleDateString()}</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c6f9a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="shrink-0 group-hover:stroke-white transition-colors duration-200">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </Link>
            );
          })}

          {decks.length === 0 && (
            <div className="py-28 text-center animate-enter">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-5"
                style={{ background: "linear-gradient(135deg, #2d1b69, #0e4f6e)", boxShadow: "0 0 40px rgba(139,92,246,0.25)" }}>
                🗂
              </div>
              <p className="text-xl font-bold text-white mb-2">No decks yet</p>
              <p className="text-sm" style={{ color: "#7c6f9a" }}>Click &ldquo;New Deck&rdquo; to create your first decklist</p>
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
          onClick={e => { if (e.target === e.currentTarget) resetModal(); }}
        >
          <div
            className="rounded-2xl w-full max-w-lg flex flex-col animate-enter overflow-hidden"
            style={{ background: "#0e0a1e", border: "1px solid #2a1f4a", boxShadow: "0 0 60px rgba(139,92,246,0.2)", maxHeight: "90vh", overflowY: "auto" }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <div>
                <h2 className="text-xl font-bold text-white">New Deck</h2>
                <p className="text-xs mt-0.5" style={{ color: "#7c6f9a" }}>Create a blank deck or paste a full decklist</p>
              </div>
              <button
                onClick={resetModal}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-xl transition-colors"
                style={{ color: "#7c6f9a" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#7c6f9a"; }}
              >
                ×
              </button>
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 mx-6 mb-5 rounded-xl p-1" style={{ background: "#0a0614", border: "1px solid #2a1f4a" }}>
              {(["blank", "import"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setCreateTab(t); setImportResult(null); }}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200"
                  style={createTab === t
                    ? { background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "#fff" }
                    : { color: "#7c6f9a" }
                  }
                >
                  {t === "blank" ? "Blank Deck" : "Import Decklist"}
                </button>
              ))}
            </div>

            {/* Blank tab */}
            {createTab === "blank" && (
              <form onSubmit={handleCreateBlank} className="flex flex-col gap-4 px-6 pb-6">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-widest font-semibold" style={{ color: "#7c6f9a" }}>Name</label>
                  <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="My Commander Deck" style={inputStyle} onFocus={onFocusBorder} onBlur={onBlurBorder} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-widest font-semibold" style={{ color: "#7c6f9a" }}>Format</label>
                  <select value={newFormat} onChange={e => setNewFormat(e.target.value)} style={inputStyle} onFocus={onFocusBorder} onBlur={onBlurBorder}>
                    {FORMATS.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                  </select>
                </div>
                {(newFormat === "commander" || newFormat === "oathbreaker") && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs uppercase tracking-widest font-semibold" style={{ color: "#7c6f9a" }}>Commander (optional)</label>
                    <input value={newCommander} onChange={e => setNewCommander(e.target.value)}
                      placeholder="Atraxa, Praetors' Voice" style={inputStyle} onFocus={onFocusBorder} onBlur={onBlurBorder} />
                  </div>
                )}
                <div className="flex gap-3 mt-2">
                  <button type="button" onClick={resetModal}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-200"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2a1f4a", color: "#7c6f9a" }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={!newName.trim() || creating}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-200 disabled:opacity-40"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                    {creating ? "Creating…" : "Create Deck"}
                  </button>
                </div>
              </form>
            )}

            {/* Import tab */}
            {createTab === "import" && (
              <form onSubmit={handleCreateImport} className="flex flex-col gap-4 px-6 pb-6">
                <div className="flex gap-3">
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <label className="text-xs uppercase tracking-widest font-semibold" style={{ color: "#7c6f9a" }}>Name</label>
                    <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                      placeholder="My Commander Deck" style={inputStyle} onFocus={onFocusBorder} onBlur={onBlurBorder} />
                  </div>
                  <div className="flex flex-col gap-1.5" style={{ width: "136px" }}>
                    <label className="text-xs uppercase tracking-widest font-semibold" style={{ color: "#7c6f9a" }}>Format</label>
                    <select value={newFormat} onChange={e => setNewFormat(e.target.value)} style={inputStyle} onFocus={onFocusBorder} onBlur={onBlurBorder}>
                      {FORMATS.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
                {(newFormat === "commander" || newFormat === "oathbreaker") && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs uppercase tracking-widest font-semibold" style={{ color: "#7c6f9a" }}>Commander (optional)</label>
                    <input value={newCommander} onChange={e => setNewCommander(e.target.value)}
                      placeholder="Atraxa, Praetors' Voice" style={inputStyle} onFocus={onFocusBorder} onBlur={onBlurBorder} />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-widest font-semibold" style={{ color: "#7c6f9a" }}>Decklist</label>
                  <textarea
                    value={importText}
                    onChange={e => setImportText(e.target.value)}
                    rows={12}
                    placeholder={IMPORT_PLACEHOLDER}
                    style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", fontSize: "13px", resize: "vertical", lineHeight: "1.6" }}
                    onFocus={onFocusBorder}
                    onBlur={onBlurBorder}
                  />
                  <p className="text-xs" style={{ color: "#5a4f7a" }}>
                    Accepts <code className="font-mono">4 Card Name</code> or <code className="font-mono">4x Card Name</code>.
                    Use <code className="font-mono">Commander</code> / <code className="font-mono">Sideboard</code> section headers.
                  </p>
                </div>
                {importResult && (
                  <p className="text-sm font-semibold" style={{ color: importResult.startsWith("✓") ? "#4ade80" : "#fca5a5" }}>
                    {importResult}
                  </p>
                )}
                <div className="flex gap-3 mt-1">
                  <button type="button" onClick={resetModal}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-200"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2a1f4a", color: "#7c6f9a" }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={!newName.trim() || !importText.trim() || creating}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-200 disabled:opacity-40"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                    {creating ? "Creating…" : "Create & Import"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
