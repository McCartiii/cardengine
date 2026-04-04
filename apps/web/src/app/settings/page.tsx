"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { NavBar } from "@/components/ui/NavBar";
import { Button } from "@/components/ui/Button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function SettingsPage() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [minorSafe, setMinorSafe] = useState(true);
  const [email, setEmail] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [user, setUser] = useState<{ email?: string } | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient();
      const {
        data: { user: u },
      } = await supabase.auth.getUser();
      if (!u) return;

      setEmail(u.email ?? "");
      setUser({ email: u.email ?? undefined });

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      try {
        const res = await fetch(`${API_URL}/v1/profile`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setDisplayName(data.displayName ?? "");
          setDateOfBirth(data.dateOfBirth?.split("T")[0] ?? "");
          setMinorSafe(data.minorSafe ?? true);
        }
      } catch {
        // Offline
      }
    }
    loadProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSavedMessage("");
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const res = await fetch(`${API_URL}/v1/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          displayName: displayName || null,
          dateOfBirth: dateOfBirth || null,
          minorSafe,
        }),
      });
      if (res.ok) {
        setSavedMessage("Settings saved.");
      }
    } catch {
      setSavedMessage("Failed to save.");
    }
    setSaving(false);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-bg">
      <NavBar user={user} />

      <main className="mx-auto max-w-2xl px-6 py-8 animate-fade-in">
        <h1 className="text-3xl font-bold text-text-primary">
          Settings
        </h1>

        <div className="mt-8 space-y-6">
          {/* Account info */}
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-card)] animate-slide-up">
            <h2 className="text-lg font-semibold text-text-primary">
              Profile
            </h2>
            <p className="mt-1 text-sm text-text-secondary">{email}</p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2 text-text-primary placeholder:text-text-muted focus:border-tab-settings focus:outline-none focus:ring-1 focus:ring-tab-settings"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2 text-text-primary focus:border-tab-settings focus:outline-none focus:ring-1 focus:ring-tab-settings"
                />
                <p className="mt-1 text-xs text-text-muted">
                  Used for minor-safe mode. Under-18 users get restricted
                  content.
                </p>
              </div>
            </div>
          </div>

          {/* Minor-safe mode */}
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-card)] animate-slide-up" style={{ animationDelay: "50ms" }}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  Minor-Safe Mode
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  When enabled, links are hidden, direct messages are
                  disabled, and content is filtered.
                </p>
              </div>
              <button
                onClick={() => setMinorSafe(!minorSafe)}
                className={`relative h-7 w-12 rounded-full transition-colors ${
                  minorSafe ? "bg-tab-settings" : "bg-surface-sunken border border-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                    minorSafe ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            {minorSafe && (
              <div className="mt-3 rounded-xl bg-tab-settings-bg px-4 py-2 text-sm text-tab-settings">
                Minor-safe mode is active. Links are hidden and content is
                filtered.
              </div>
            )}
          </div>

          {/* Save */}
          <div className="flex items-center gap-4 animate-slide-up" style={{ animationDelay: "100ms" }}>
            <Button onClick={handleSave} loading={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
            {savedMessage && (
              <span className="text-sm text-[var(--success-text)]">
                {savedMessage}
              </span>
            )}
          </div>

          {/* Danger zone */}
          <div className="rounded-2xl border border-danger bg-surface p-6 shadow-[var(--shadow-card)] animate-slide-up" style={{ animationDelay: "150ms" }}>
            <h2 className="text-lg font-semibold text-[var(--danger-text)]">
              Danger Zone
            </h2>
            <Button
              variant="danger"
              onClick={handleSignOut}
              loading={signingOut}
              className="mt-4"
            >
              {signingOut ? "Signing out..." : "Sign Out"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
