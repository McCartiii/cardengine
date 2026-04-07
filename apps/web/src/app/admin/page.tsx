"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { NavBar } from "@/components/ui/NavBar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface Report {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  createdAt: string;
  resolved: boolean;
}

interface ScannerStats {
  period: string;
  total: number;
  overrides: number;
  noMatch: number;
  lowConfidence: number;
  overrideRate: string;
}

interface RulesStats {
  period: string;
  total: number;
  disputed: number;
  disputeRate: string;
  topDisputedCodes: Array<{ code: string; count: number }>;
}

export default function AdminPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [scannerStats, setScannerStats] = useState<ScannerStats | null>(null);
  const [rulesStats, setRulesStats] = useState<RulesStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [user, setUser] = useState<{ email?: string } | null>(null);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError("Not authenticated. Please sign in.");
        setLoading(false);
        return;
      }
      setToken(session.access_token);

      supabase.auth.getUser().then(({ data: { user: u } }) => {
        setUser(u ? { email: u.email ?? undefined } : null);
      });

      try {
        const headers = { Authorization: `Bearer ${session.access_token}` };
        const [reportsRes, scannerRes, rulesRes] = await Promise.all([
          fetch(`${API_URL}/admin/reports?resolved=false&limit=20`, { headers }),
          fetch(`${API_URL}/admin/telemetry/scanner-stats?days=7`, { headers }),
          fetch(`${API_URL}/admin/telemetry/rules-stats?days=7`, { headers }),
        ]);

        if (reportsRes.status === 403) {
          setError("Access denied. You are not an admin.");
          setLoading(false);
          return;
        }

        if (reportsRes.ok) setReports((await reportsRes.json()).reports ?? []);
        if (scannerRes.ok) setScannerStats(await scannerRes.json());
        if (rulesRes.ok) setRulesStats(await rulesRes.json());
      } catch {
        setError("Failed to load admin data.");
      }
      setLoading(false);
    }
    init();
  }, []);

  const logAction = (msg: string) =>
    setActionLog((prev) => [`${new Date().toLocaleTimeString()} - ${msg}`, ...prev.slice(0, 19)]);

  const resolveReport = async (id: string) => {
    if (!token) return;
    try {
      await fetch(`${API_URL}/admin/reports/${id}/resolve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setReports((prev) => prev.filter((r) => r.id !== id));
      logAction(`Resolved report ${id.slice(0, 8)}`);
    } catch {
      logAction(`Failed to resolve report ${id.slice(0, 8)}`);
    }
  };

  const hideMessage = async (id: string) => {
    if (!token) return;
    try {
      await fetch(`${API_URL}/admin/messages/${id}/hide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      logAction(`Hidden message ${id.slice(0, 8)}`);
    } catch {
      logAction(`Failed to hide message ${id.slice(0, 8)}`);
    }
  };

  const banUser = async (id: string) => {
    if (!token) return;
    if (!confirm(`Ban user ${id.slice(0, 12)}...? This will hide all their content.`))
      return;
    try {
      await fetch(`${API_URL}/admin/users/${id}/ban`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      logAction(`Banned user ${id.slice(0, 8)}`);
    } catch {
      logAction(`Failed to ban user ${id.slice(0, 8)}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <NavBar user={user} />
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="mt-10 h-6 w-32" />
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg">
        <NavBar user={user} />
        <div className="flex flex-1 items-center justify-center py-32">
          <div className="text-center animate-fade-in">
            <p className="text-lg font-semibold text-[var(--danger-text)]">{error}</p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <NavBar user={user} />

      <main className="mx-auto max-w-6xl px-6 py-8 animate-fade-in">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-text-primary">
            Admin Dashboard
          </h1>
          <Badge variant="danger">ADMIN</Badge>
        </div>

        {/* Stats Cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] animate-slide-up">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Scanner Scans (7d)
            </p>
            <p className="mt-1 text-3xl font-bold text-text-primary">
              {scannerStats?.total ?? 0}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Override rate: {scannerStats?.overrideRate ?? "0%"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] animate-slide-up" style={{ animationDelay: "50ms" }}>
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Low Confidence (7d)
            </p>
            <p className="mt-1 text-3xl font-bold text-[var(--warning-text)]">
              {scannerStats?.lowConfidence ?? 0}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              No match: {scannerStats?.noMatch ?? 0}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] animate-slide-up" style={{ animationDelay: "100ms" }}>
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Rules Checks (7d)
            </p>
            <p className="mt-1 text-3xl font-bold text-text-primary">
              {rulesStats?.total ?? 0}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Dispute rate: {rulesStats?.disputeRate ?? "0%"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] animate-slide-up" style={{ animationDelay: "150ms" }}>
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Open Reports
            </p>
            <p className="mt-1 text-3xl font-bold text-[var(--danger-text)]">
              {reports.length}
            </p>
          </div>
        </div>

        {/* Reports */}
        <h2 className="mt-10 text-xl font-semibold text-text-primary">
          Open Reports
        </h2>
        {reports.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-text-muted">No open reports. All clear.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {reports.map((report, i) => (
              <div
                key={report.id}
                className="flex items-start justify-between rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] animate-slide-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">{report.targetType}</Badge>
                    <span className="font-mono text-xs text-text-muted">
                      {report.targetId.slice(0, 12)}...
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-text-secondary">
                    {report.reason}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    Reporter: {report.reporterId.slice(0, 8)}... &middot;{" "}
                    {new Date(report.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="ml-4 flex flex-shrink-0 gap-2">
                  {report.targetType === "message" && (
                    <button
                      onClick={() => hideMessage(report.targetId)}
                      className="rounded-lg bg-warning-light px-3 py-1.5 text-xs font-medium text-[var(--warning-text)] hover:opacity-80 transition-opacity"
                    >
                      Hide Msg
                    </button>
                  )}
                  <button
                    onClick={() =>
                      banUser(
                        report.targetType === "user"
                          ? report.targetId
                          : report.reporterId
                      )
                    }
                    className="rounded-lg bg-danger-light px-3 py-1.5 text-xs font-medium text-[var(--danger-text)] hover:opacity-80 transition-opacity"
                  >
                    Ban User
                  </button>
                  <button
                    onClick={() => resolveReport(report.id)}
                    className="rounded-lg bg-success-light px-3 py-1.5 text-xs font-medium text-[var(--success-text)] hover:opacity-80 transition-opacity"
                  >
                    Resolve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Top Disputed Rules */}
        {rulesStats?.topDisputedCodes &&
          rulesStats.topDisputedCodes.length > 0 && (
            <>
              <h2 className="mt-10 text-xl font-semibold text-text-primary">
                Top Disputed Rules
              </h2>
              <div className="mt-4 space-y-2">
                {rulesStats.topDisputedCodes.map((item, i) => (
                  <div
                    key={item.code}
                    className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3 shadow-[var(--shadow-card)] animate-slide-up"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <span className="font-mono text-sm text-text-primary">
                      {item.code}
                    </span>
                    <Badge variant="default">{item.count} disputes</Badge>
                  </div>
                ))}
              </div>
            </>
          )}

        {/* Action Log */}
        {actionLog.length > 0 && (
          <>
            <h2 className="mt-10 text-xl font-semibold text-text-primary">
              Action Log
            </h2>
            <div className="mt-4 rounded-2xl border border-border bg-surface-sunken p-4 font-mono text-xs shadow-[var(--shadow-card)]">
              {actionLog.map((log, i) => (
                <p key={i} className="text-[var(--success-text)]">
                  {log}
                </p>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
