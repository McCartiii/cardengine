"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { api, type Deck } from "@/lib/api";
import Link from "next/link";

const FORMAT_COLOR: Record<string, string> = {
  standard: "#00d4ff", pioneer: "#7c3aed", modern: "#f59e0b", legacy: "#ff0080",
  vintage: "#ff5000", commander: "#50c878", pauper: "#8ca0b8", explorer: "#00d4ff", historic: "#a78bfa",
};

export default function DecksPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!authLoading && !user) router.push("/login"); }, [authLoading, user, router]);
  const { data, isLoading, mutate } = useSWR<{ decks: Deck[] }>(user ? "decks" : null, () => api.decks.list());
  const [creating, setCreating]   = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName]     = useState("");
  const [newFormat, setNewFormat] = useState("commander");

  async function createDeck() {
    if (!newName.trim()) return;
    setCreating(true);
    try { await api.decks.create({ name: newName, format: newFormat }); setNewName(""); setShowModal(false); mutate(); }
    finally { setCreating(false); }
  }

  const decks = data?.decks ?? [];
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-display font-extrabold text-4xl text-white leading-none mb-2">Decks</h1>
          <p className="text-sm" style={{ color: "#3d5068" }}>Build and manage your decks</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
          style={{ background: "linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)", color: "#fff", boxShadow: "0 0 20px rgba(0,212,255,0.2)" }}>
          + New Deck
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3,4,5,6].map(i => <div key={i} className="skeleton h-36 rounded-2xl" />)}</div>
      ) : decks.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center" style={{ border: "1px solid rgba(0,212,255,0.08)" }}>
          <p className="font-display font-bold text-lg text-white mb-1">No decks yet</p>
          <p className="text-sm mb-6" style={{ color: "#3d5068" }}>Create your first deck to get started</p>
          <button onClick={() => setShowModal(true)} className="inline-flex px-5 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: "rgba(0,212,255,0.1)", color: "#00d4ff", border: "1px solid rgba(0,212,255,0.2)" }}>Create Deck</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-enter">
          {decks.map((deck) => {
            const fmtColor = FORMAT_COLOR[deck.format?.toLowerCase()] ?? "#3d5068";
            return (
              <Link key={deck.id} href={`/decks/${deck.id}`} className="glass rounded-2xl overflow-hidden group transition-all duration-150"
                style={{ border: "1px solid rgba(0,212,255,0.08)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = `${fmtColor}33`; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(0,212,255,0.08)"; }}>
                <div style={{ height: 3, background: `linear-gradient(90deg, ${fmtColor} 0%, transparent 100%)` }} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-white leading-tight group-hover:text-neon transition-colors">{deck.name}</h3>
                    <span className="shrink-0 px-2 py-0.5 rounded-md text-xs font-semibold capitalize"
                      style={{ background: `${fmtColor}15`, color: fmtColor }}>{deck.format}</span>
                  </div>
                  {deck.commander && <p className="text-xs mb-2" style={{ color: "#3d5068" }}>&#9876; {deck.commander}</p>}
                  {deck.description && <p className="text-xs line-clamp-2 mb-3" style={{ color: "#3d5068" }}>{deck.description}</p>}
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "#3d5068" }}>{deck._count?.cards ?? 0} cards</span>
                    <span className="text-xs" style={{ color: "#3d5068" }}>{new Date(deck.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(6,8,16,0.85)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="glass rounded-3xl p-7 w-full max-w-sm animate-enter" style={{ border: "1px solid rgba(0,212,255,0.15)" }}>
            <h2 className="font-display font-bold text-xl text-white mb-5">New Deck</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "#3d5068" }}>NAME</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus placeholder="My Deck"
                  className="w-full bg-transparent text-white text-sm focus:outline-none py-2.5"
                  style={{ borderBottom: "1px solid rgba(0,212,255,0.25)", caretColor: "#00d4ff" }}
                  onKeyDown={(e) => { if (e.key === "Enter") createDeck(); }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "#3d5068" }}>FORMAT</label>
                <select value={newFormat} onChange={(e) => setNewFormat(e.target.value)}
                  className="w-full bg-transparent text-white text-sm focus:outline-none py-2.5"
                  style={{ borderBottom: "1px solid rgba(0,212,255,0.25)" }}>
                  {["commander","standard","pioneer","modern","legacy","vintage","pauper","explorer","historic"].map(f => (
                    <option key={f} value={f} style={{ background: "#0d1220" }}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={createDeck} disabled={creating || !newName.trim()} className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                  style={{ background: "linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)", color: "#fff" }}>
                  {creating ? "Creating…" : "Create"}
                </button>
                <button onClick={() => setShowModal(false)} className="px-5 py-2.5 rounded-xl text-sm" style={{ background: "rgba(30,45,69,0.5)", color: "#3d5068" }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
