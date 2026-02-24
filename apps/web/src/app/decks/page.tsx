"use client";

import { useEffect, useState } from "react";
import { api, type Deck } from "@/lib/api";
import Link from "next/link";
import { clsx } from "clsx";

const FORMAT_COLOR: Record<string, string> = {
  commander: "bg-purple-900/50 text-purple-300 border-purple-700",
  standard: "bg-green-900/50 text-green-300 border-green-700",
  modern: "bg-blue-900/50 text-blue-300 border-blue-700",
  pioneer: "bg-orange-900/50 text-orange-300 border-orange-700",
  legacy: "bg-red-900/50 text-red-300 border-red-700",
  vintage: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
  pauper: "bg-gray-800/50 text-gray-400 border-gray-600",
};

export default function DecksPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFormat, setNewFormat] = useState("commander");
  const [newCommander, setNewCommander] = useState("");
  const [creating, setCreating] = useState(false);

  const load = () => {
    api.decks.list()
      .then(({ decks: d }) => setDecks(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.decks.create({ name: newName.trim(), format: newFormat, commander: newCommander.trim() || undefined });
      setShowCreate(false);
      setNewName(""); setNewCommander(""); setNewFormat("commander");
      load();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black mb-1">Decks</h1>
          <p className="text-muted">Build and manage your decklists</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-accent text-white rounded-xl font-semibold text-sm hover:bg-accent/80 transition-colors"
        >
          + New Deck
        </button>
      </div>

      {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}
      {loading && <p className="text-muted animate-pulse">Loading…</p>}

      <div className="grid gap-3">
        {decks.map((deck) => (
          <Link
            key={deck.id}
            href={`/decks/${deck.id}`}
            className="group flex items-center gap-4 bg-surface border border-border hover:border-accent/40 rounded-2xl p-4 transition-all"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={clsx("text-xs px-2 py-0.5 rounded-md border font-semibold", FORMAT_COLOR[deck.format] ?? "bg-surface-2 text-muted border-border")}>
                  {deck.format}
                </span>
                <h3 className="font-bold truncate">{deck.name}</h3>
              </div>
              {deck.commander && <p className="text-muted text-sm truncate">{deck.commander}</p>}
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm text-muted">{deck._count?.cards ?? 0} cards</p>
              <p className="text-xs text-muted/60">{new Date(deck.updatedAt).toLocaleDateString()}</p>
            </div>
            <span className="text-muted group-hover:text-white transition-colors">→</span>
          </Link>
        ))}

        {!loading && decks.length === 0 && (
          <div className="py-24 text-center">
            <p className="text-5xl mb-4">🗂</p>
            <p className="text-xl font-bold mb-2">No decks yet</p>
            <p className="text-muted">Click "New Deck" to create your first decklist</p>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreate}
            className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md flex flex-col gap-4"
          >
            <h2 className="text-xl font-bold">New Deck</h2>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted uppercase tracking-wider font-bold">Name</label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Commander Deck"
                className="bg-bg border border-border rounded-xl px-4 py-2.5 text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/60 text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted uppercase tracking-wider font-bold">Format</label>
              <select
                value={newFormat}
                onChange={(e) => setNewFormat(e.target.value)}
                className="bg-bg border border-border rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-accent/60 text-sm"
              >
                {["commander","standard","modern","pioneer","legacy","vintage","pauper"].map((f) => (
                  <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
                ))}
              </select>
            </div>

            {(newFormat === "commander" || newFormat === "oathbreaker") && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted uppercase tracking-wider font-bold">Commander (optional)</label>
                <input
                  value={newCommander}
                  onChange={(e) => setNewCommander(e.target.value)}
                  placeholder="Atraxa, Praetors' Voice"
                  className="bg-bg border border-border rounded-xl px-4 py-2.5 text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/60 text-sm"
                />
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl bg-bg border border-border text-muted font-semibold text-sm hover:text-white transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newName.trim() || creating}
                className="flex-1 py-2.5 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50 hover:bg-accent/80 transition-colors"
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
