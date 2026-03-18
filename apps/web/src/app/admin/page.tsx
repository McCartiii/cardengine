"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function AdminPage() {
  const { user, session, loading: authLoading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!authLoading && !user) router.push("/login"); }, [authLoading, user, router]);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [ingestRunning, setIngestRunning] = useState(false);
  const [ingestLog, setIngestLog] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    setStatsLoading(true);
    fetch(`${API_BASE}/admin/stats`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(r => r.json()).then(d => setStats(d)).catch(() => setStats(null)).finally(() => setStatsLoading(false));
  }, [session]);

  async function triggerIngest() {
    if (!session) return;
    setIngestRunning(true); setIngestLog("Starting ingest…");
    try {
      const res = await fetch(`${API_BASE}/admin/ingest/scryfall`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      if (!res.ok) {
        setIngestLog(`Error ${res.status}: ${data.error ?? JSON.stringify(data)}`);
      } else {
        setIngestLog(`Done — ${data.cardsProcessed ?? 0} cards, ${data.pricesUpdated ?? 0} prices updated`);
      }
    } catch (err) { setIngestLog(err instanceof Error ? err.message : "Ingest failed."); }
    finally { setIngestRunning(false); }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display font-extrabold text-4xl text-white leading-none mb-2">Admin</h1>
        <p className="text-sm" style={{ color: "#3d5068" }}>System management</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {statsLoading ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />) :
         stats ? Object.entries(stats).map(([key, val]) => (
          <div key={key} className="glass rounded-2xl p-5" style={{ border: "1px solid rgba(0,212,255,0.08)" }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#3d5068" }}>{key}</p>
            <p className="font-display font-extrabold text-2xl" style={{ color: "#00d4ff" }}>{typeof val === "number" ? val.toLocaleString() : String(val)}</p>
          </div>
        )) : <div className="col-span-4 glass rounded-2xl p-4 text-sm" style={{ color: "#3d5068" }}>Stats unavailable</div>}
      </div>
      <div className="glass rounded-2xl p-6" style={{ border: "1px solid rgba(255,0,128,0.1)" }}>
        <h2 className="font-semibold text-white mb-1">Scryfall Ingest</h2>
        <p className="text-xs mb-5" style={{ color: "#3d5068" }}>Stream Scryfall bulk data and upsert all cards + prices</p>
        <button onClick={triggerIngest} disabled={ingestRunning || !session} className="px-6 py-3 rounded-xl text-sm font-bold transition-all"
          style={{ background: ingestRunning ? "#1e2d45" : "linear-gradient(135deg, #ff0080 0%, #7c3aed 100%)", color: "#fff", boxShadow: ingestRunning ? "none" : "0 0 20px rgba(255,0,128,0.3)" }}>
          {ingestRunning ? "Running…" : "Run Ingest"}
        </button>
        {ingestLog && (
          <p className="text-xs mt-4 font-mono" style={{ color: ingestLog.startsWith("Error") ? "#ff6bad" : ingestRunning ? "#00d4ff" : "#50c878" }}>
            {ingestLog}
          </p>
        )}
      </div>
    </div>
  );
}
