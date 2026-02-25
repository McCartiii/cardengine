"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

interface AdminStats {
  users: number;
  cards: number;
  decks: number;
  collections: number;
  watchlist: number;
  notifications: number;
}

interface IngestResult {
  upserted: number;
  skipped: number;
  errors: number;
  duration: string;
}

function useAdminFetch<T>(path: string) {
  const [data, setData]       = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const refetch = () => {
    setLoading(true);
    import("@/lib/api").then(({ getToken }) => {
      fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      })
        .then(async r => {
          if (!r.ok) throw new Error((await r.json()).error ?? r.statusText);
          return r.json();
        })
        .then(setData)
        .catch((e: unknown) => setError((e as Error).message))
        .finally(() => setLoading(false));
    });
  };

  useEffect(() => { refetch(); }, []);
  return { data, loading, error, refetch };
}

const sectionStyle = {
  background: "#110d1f",
  border: "1px solid #2a1f4a",
  borderRadius: "16px",
  padding: "20px",
};

export default function AdminPage() {
  const [ingestRunning, setIngestRunning] = useState(false);
  const [ingestResult, setIngestResult]   = useState<IngestResult | null>(null);
  const [ingestError, setIngestError]     = useState<string | null>(null);
  const [maxCards, setMaxCards]           = useState("");
  const [banUserId, setBanUserId]         = useState("");
  const [banResult, setBanResult]         = useState<string | null>(null);

  const { data: stats, loading: statsLoading, refetch: refetchStats } =
    useAdminFetch<AdminStats>("/admin/stats");
  const { data: healthData, loading: healthLoading } =
    useAdminFetch<{ ok: boolean; db: string; version: string }>("/health");

  const handleIngest = async () => {
    setIngestRunning(true);
    setIngestResult(null);
    setIngestError(null);
    try {
      const { getToken } = await import("@/lib/api");
      const res = await fetch(`${API_BASE}/admin/ingest/scryfall`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ maxCards: maxCards ? parseInt(maxCards, 10) : undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      setIngestResult(await res.json());
      refetchStats();
    } catch (e: unknown) {
      setIngestError((e as Error).message);
    } finally {
      setIngestRunning(false);
    }
  };

  const handleBan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!banUserId.trim()) return;
    setBanResult(null);
    try {
      const { getToken } = await import("@/lib/api");
      const res = await fetch(`${API_BASE}/admin/users/${banUserId.trim()}/ban`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setBanResult(`✓ User ${banUserId.trim()} banned.`);
      setBanUserId("");
    } catch (e: unknown) {
      setBanResult(`Error: ${(e as Error).message}`);
    }
  };

  const inputStyle = {
    background: "#0a0614",
    border: "1px solid #2a1f4a",
    borderRadius: "12px",
    padding: "10px 16px",
    color: "#ede9fe",
    fontSize: "14px",
    outline: "none",
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-10">
        <h1 className="text-4xl font-black mb-2"><span className="gradient-text">Admin</span></h1>
        <p className="text-sm" style={{ color: "#7c6f9a" }}>System management &amp; controls</p>
      </div>

      {/* System health */}
      <div className="mb-6">
        <h2 className="font-bold text-white mb-3 text-sm uppercase tracking-wider" style={{ color: "#7c6f9a" }}>System Health</h2>
        <div style={sectionStyle}>
          {healthLoading ? (
            <div className="flex gap-3">
              {[0,1,2].map(i => <div key={i} className="skeleton h-9 w-28 rounded-xl" />)}
            </div>
          ) : healthData ? (
            <div className="flex flex-wrap gap-3">
              <StatusBadge label="API" ok={true} detail="Online" />
              <StatusBadge label="Database" ok={healthData.db === "ok"} detail={healthData.db} />
              <StatusBadge label="Version" ok={true} detail={healthData.version ?? "—"} />
            </div>
          ) : (
            <p className="text-sm" style={{ color: "#fca5a5" }}>Health check failed</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6">
        <h2 className="font-bold mb-3 text-sm uppercase tracking-wider" style={{ color: "#7c6f9a" }}>Database Stats</h2>
        <div style={sectionStyle}>
          {statsLoading ? (
            <div className="grid grid-cols-3 gap-4">
              {[0,1,2,3,4,5].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-3 gap-4">
              {[
                ["Users", stats.users],
                ["Cards", stats.cards],
                ["Decks", stats.decks],
                ["Collection Events", stats.collections],
                ["Watchlist Entries", stats.watchlist],
                ["Notifications", stats.notifications],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-xl p-4 text-center" style={{ background: "#0a0614", border: "1px solid #2a1f4a" }}>
                  <p className="text-2xl font-black text-white">{(value as number).toLocaleString()}</p>
                  <p className="text-xs mt-1 uppercase tracking-wider" style={{ color: "#7c6f9a" }}>{label}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: "#fca5a5" }}>Failed to load stats (admin access required)</p>
          )}
        </div>
      </div>

      {/* Scryfall ingest */}
      <div className="mb-6">
        <h2 className="font-bold mb-3 text-sm uppercase tracking-wider" style={{ color: "#7c6f9a" }}>Scryfall Ingest</h2>
        <div style={sectionStyle}>
          <p className="text-sm mb-4" style={{ color: "#7c6f9a" }}>
            Re-ingests the Scryfall bulk data, upserting all card variants. Leave Max Cards empty for a full ingest.
          </p>
          <div className="flex items-center gap-3 mb-4">
            <input
              type="number"
              placeholder="Max cards (optional)"
              value={maxCards}
              onChange={e => setMaxCards(e.target.value)}
              style={{ ...inputStyle, width: "220px" }}
            />
            <button
              onClick={handleIngest}
              disabled={ingestRunning}
              className="px-5 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-40 transition-all duration-200"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
            >
              {ingestRunning ? "Running…" : "Run Ingest"}
            </button>
          </div>
          {ingestRunning && (
            <p className="text-sm animate-pulse" style={{ color: "#7c6f9a" }}>
              Ingesting Scryfall data — this may take several minutes…
            </p>
          )}
          {ingestResult && (
            <div className="rounded-xl p-4 text-sm space-y-1 animate-enter"
              style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }}>
              <p className="font-bold" style={{ color: "#6ee7b7" }}>✓ Ingest complete</p>
              <p style={{ color: "#7c6f9a" }}>Upserted: <span className="text-white font-semibold">{ingestResult.upserted.toLocaleString()}</span></p>
              <p style={{ color: "#7c6f9a" }}>Skipped: <span className="text-white font-semibold">{ingestResult.skipped.toLocaleString()}</span></p>
              {ingestResult.errors > 0 && <p style={{ color: "#fde047" }}>Errors: {ingestResult.errors}</p>}
              <p style={{ color: "#7c6f9a" }}>Duration: <span className="text-white font-semibold">{ingestResult.duration}</span></p>
            </div>
          )}
          {ingestError && <p className="text-sm mt-2 animate-enter" style={{ color: "#fca5a5" }}>{ingestError}</p>}
        </div>
      </div>

      {/* Ban user */}
      <div className="mb-6">
        <h2 className="font-bold mb-3 text-sm uppercase tracking-wider" style={{ color: "#7c6f9a" }}>User Management</h2>
        <div style={sectionStyle}>
          <p className="text-sm mb-4" style={{ color: "#7c6f9a" }}>
            Ban a user by their UUID. Banned users receive a 403 on all authenticated endpoints.
          </p>
          <form onSubmit={handleBan} className="flex items-center gap-3">
            <input
              type="text"
              placeholder="User UUID"
              value={banUserId}
              onChange={e => setBanUserId(e.target.value)}
              style={{ ...inputStyle, flex: 1, fontFamily: "monospace", fontSize: "13px" }}
            />
            <button
              type="submit"
              disabled={!banUserId.trim()}
              className="px-5 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-40 transition-all duration-200"
              style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)" }}
            >
              Ban User
            </button>
          </form>
          {banResult && (
            <p className="text-sm mt-3 animate-enter"
              style={{ color: banResult.startsWith("✓") ? "#6ee7b7" : "#fca5a5" }}>
              {banResult}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
      style={{
        background: ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
        border: ok ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(239,68,68,0.3)",
      }}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ok ? "#4ade80" : "#f87171" }} />
      <span className="font-semibold text-white">{label}</span>
      <span style={{ color: "#7c6f9a" }}>{detail}</span>
    </div>
  );
}
