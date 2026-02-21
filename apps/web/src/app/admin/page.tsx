"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { clsx } from "clsx";

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
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = () => {
    setLoading(true);
    import("@/lib/api").then(({ getToken }) => {
      fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      })
        .then(async (r) => {
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

export default function AdminPage() {
  const [ingestRunning, setIngestRunning] = useState(false);
  const [ingestResult, setIngestResult] = useState<IngestResult | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [maxCards, setMaxCards] = useState("");
  const [banUserId, setBanUserId] = useState("");
  const [banResult, setBanResult] = useState<string | null>(null);

  const { data: stats, loading: statsLoading, refetch: refetchStats } = useAdminFetch<AdminStats>("/admin/stats");
  const { data: healthData, loading: healthLoading } = useAdminFetch<{ ok: boolean; db: string; version: string }>("/health");

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

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-1">Admin</h1>
        <p className="text-muted">System management & controls</p>
      </div>

      {/* System health */}
      <Section title="System Health">
        {healthLoading ? (
          <p className="text-muted text-sm animate-pulse">Checking…</p>
        ) : healthData ? (
          <div className="flex flex-wrap gap-4">
            <StatusBadge label="API" ok={true} detail="Online" />
            <StatusBadge label="Database" ok={healthData.db === "ok"} detail={healthData.db} />
            <StatusBadge label="Version" ok={true} detail={healthData.version ?? "—"} />
          </div>
        ) : (
          <p className="text-red-400 text-sm">Health check failed</p>
        )}
      </Section>

      {/* Stats */}
      <Section title="Database Stats">
        {statsLoading ? (
          <p className="text-muted text-sm animate-pulse">Loading…</p>
        ) : stats ? (
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Users" value={stats.users} />
            <StatCard label="Cards" value={stats.cards} />
            <StatCard label="Decks" value={stats.decks} />
            <StatCard label="Collection Events" value={stats.collections} />
            <StatCard label="Watchlist Entries" value={stats.watchlist} />
            <StatCard label="Notifications" value={stats.notifications} />
          </div>
        ) : (
          <p className="text-red-400 text-sm">Failed to load stats (admin access required)</p>
        )}
      </Section>

      {/* Scryfall ingest */}
      <Section title="Scryfall Ingest">
        <p className="text-muted text-sm mb-4">
          Re-ingests the Scryfall bulk data file, upserting all card variants and price caches.
          Leave Max Cards empty for a full ingest.
        </p>
        <div className="flex items-center gap-3 mb-4">
          <input
            type="number"
            placeholder="Max cards (optional)"
            value={maxCards}
            onChange={(e) => setMaxCards(e.target.value)}
            className="bg-bg border border-border rounded-xl px-4 py-2.5 text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/60 text-sm w-52"
          />
          <button
            onClick={handleIngest}
            disabled={ingestRunning}
            className="px-5 py-2.5 bg-accent text-white rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-accent/80 transition-colors"
          >
            {ingestRunning ? "Running…" : "Run Ingest"}
          </button>
        </div>
        {ingestRunning && (
          <p className="text-muted text-sm animate-pulse">Ingesting Scryfall data — this may take several minutes…</p>
        )}
        {ingestResult && (
          <div className="bg-green-900/20 border border-green-700 rounded-xl p-4 text-sm space-y-1">
            <p className="text-green-300 font-bold">✓ Ingest complete</p>
            <p className="text-muted">Upserted: <span className="text-white">{ingestResult.upserted.toLocaleString()}</span></p>
            <p className="text-muted">Skipped: <span className="text-white">{ingestResult.skipped.toLocaleString()}</span></p>
            {ingestResult.errors > 0 && <p className="text-yellow-400">Errors: {ingestResult.errors}</p>}
            <p className="text-muted">Duration: <span className="text-white">{ingestResult.duration}</span></p>
          </div>
        )}
        {ingestError && <p className="text-red-400 text-sm">{ingestError}</p>}
      </Section>

      {/* Ban user */}
      <Section title="User Management">
        <p className="text-muted text-sm mb-4">Ban a user by their UUID. Banned users receive a 403 on all authenticated endpoints.</p>
        <form onSubmit={handleBan} className="flex items-center gap-3">
          <input
            type="text"
            placeholder="User UUID"
            value={banUserId}
            onChange={(e) => setBanUserId(e.target.value)}
            className="flex-1 bg-bg border border-border rounded-xl px-4 py-2.5 text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-500/60 text-sm font-mono"
          />
          <button
            type="submit"
            disabled={!banUserId.trim()}
            className="px-5 py-2.5 bg-red-600 text-white rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-red-700 transition-colors"
          >
            Ban User
          </button>
        </form>
        {banResult && (
          <p className={clsx("text-sm mt-3", banResult.startsWith("✓") ? "text-green-400" : "text-red-400")}>
            {banResult}
          </p>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="font-bold text-lg mb-4">{title}</h2>
      <div className="bg-surface border border-border rounded-2xl p-5">{children}</div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-bg rounded-xl p-4 text-center">
      <p className="text-2xl font-black">{value.toLocaleString()}</p>
      <p className="text-muted text-xs mt-1">{label}</p>
    </div>
  );
}

function StatusBadge({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className={clsx("flex items-center gap-2 px-3 py-2 rounded-lg border text-sm", ok ? "bg-green-900/20 border-green-700" : "bg-red-900/20 border-red-700")}>
      <span className={clsx("w-2 h-2 rounded-full", ok ? "bg-green-400" : "bg-red-400")} />
      <span className="font-semibold">{label}</span>
      <span className="text-muted">{detail}</span>
    </div>
  );
}
