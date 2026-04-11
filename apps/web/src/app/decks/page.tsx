"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { api, type Deck } from "@/lib/api";
import Link from "next/link";
import { NewDeckWizard } from "./NewDeckWizard";

const FORMAT_COLOR: Record<string, string> = {
  standard: "#0D9488", pioneer: "#6366f1", modern: "#f59e0b", legacy: "#ec4899",
  vintage: "#ef4444", commander: "#16a34a", pauper: "#64748b", explorer: "#22d3ee",
  historic: "#818cf8", alchemy: "#f472b6", timeless: "#fb923c",
  oathbreaker: "#8b5cf6", brawl: "#14b8a6", "historic-brawl": "#a78bfa",
  "penny-dreadful": "#94a3b8", custom: "#475569",
};

export default function DecksPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!authLoading && !user) router.push("/login"); }, [authLoading, user, router]);

  const { data, isLoading, mutate } = useSWR<{ decks: Deck[] }>(
    user ? "decks" : null,
    () => api.decks.list()
  );
  const [showWizard, setShowWizard] = useState(false);

  function handleCreated(deck: Deck) {
    setShowWizard(false);
    mutate();
    router.push(`/decks/${deck.id}`);
  }

  const decks = data?.decks ?? [];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-extrabold text-4xl text-white leading-none mb-2">Decks</h1>
          <p className="text-sm" style={{ color: "#3d5068" }}>Build and manage your decks</p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
          style={{ background: "#0D9488", color: "#fff", boxShadow: "0 0 20px rgba(13,148,136,0.2)" }}
        >
          + New Deck
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton h-36 rounded-2xl" />)}
        </div>
      ) : decks.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center" style={{ border: "1px solid rgba(13,148,136,0.08)" }}>
          <p className="font-bold text-lg text-white mb-1">No decks yet</p>
          <p className="text-sm mb-6" style={{ color: "#3d5068" }}>Create your first deck to get started</p>
          <button
            onClick={() => setShowWizard(true)}
            className="inline-flex px-5 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: "rgba(13,148,136,0.1)", color: "#0D9488", border: "1px solid rgba(13,148,136,0.2)" }}
          >
            Create Deck
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-enter">
          {decks.map((deck) => {
            const fmtColor = FORMAT_COLOR[deck.format?.toLowerCase()] ?? "#3d5068";
            return (
              <Link
                key={deck.id}
                href={`/decks/${deck.id}`}
                className="glass rounded-2xl overflow-hidden group transition-all duration-150"
                style={{ border: "1px solid rgba(13,148,136,0.08)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = `${fmtColor}33`; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(13,148,136,0.08)"; }}
              >
                <div style={{ height: 3, background: `linear-gradient(90deg, ${fmtColor} 0%, transparent 100%)` }} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-white leading-tight group-hover:opacity-80 transition-opacity">{deck.name}</h3>
                    <span
                      className="shrink-0 px-2 py-0.5 rounded-md text-xs font-semibold capitalize"
                      style={{ background: `${fmtColor}15`, color: fmtColor }}
                    >
                      {deck.format}
                    </span>
                  </div>
                  {deck.commander && (
                    <p className="text-xs mb-2" style={{ color: "#3d5068" }}>⚔ {deck.commander}</p>
                  )}
                  {deck.description && (
                    <p className="text-xs line-clamp-2 mb-3" style={{ color: "#3d5068" }}>{deck.description}</p>
                  )}
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

      {showWizard && (
        <NewDeckWizard
          onClose={() => setShowWizard(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
