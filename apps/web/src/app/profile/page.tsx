"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Profile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.profile.get()
      .then((p) => { setProfile(p); setDisplayName(p.displayName ?? ""); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.profile.update({ displayName: displayName.trim() || undefined });
      setProfile((p) => p ? { ...p, displayName: displayName.trim() || null } : p);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const initials = profile?.displayName?.slice(0, 2).toUpperCase() ?? "?";

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-black mb-8">Profile</h1>

      {loading && <p className="text-muted animate-pulse">Loading…</p>}

      {!loading && !profile && (
        <div className="py-16 text-center">
          <p className="text-muted">Sign in to view your profile.</p>
        </div>
      )}

      {profile && (
        <div className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-5">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt={initials} className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-accent/30 border-2 border-accent/60 flex items-center justify-center text-2xl font-black text-accent-light">
                {initials}
              </div>
            )}
            <div>
              <p className="text-2xl font-black">{profile.displayName ?? "Anonymous"}</p>
              <p className="text-muted text-sm">Member since {new Date(profile.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
            </div>
          </div>

          {/* Edit form */}
          <div className="bg-surface border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">Display Name</h2>
              {!editing && (
                <button onClick={() => setEditing(true)} className="text-sm text-accent-light hover:underline">Edit</button>
              )}
            </div>
            {editing ? (
              <form onSubmit={handleSave} className="flex gap-3">
                <input
                  autoFocus
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display name"
                  maxLength={50}
                  className="flex-1 bg-bg border border-border rounded-xl px-4 py-2.5 text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/60 text-sm"
                />
                <button type="submit" disabled={saving} className="px-4 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-accent/80 transition-colors">
                  {saving ? "Saving…" : "Save"}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="px-4 py-2.5 bg-bg border border-border text-muted rounded-xl text-sm font-semibold hover:text-white transition-colors">
                  Cancel
                </button>
              </form>
            ) : (
              <p className="text-white">{profile.displayName ?? <span className="text-muted italic">Not set</span>}</p>
            )}
          </div>

          {/* Account info */}
          <div className="bg-surface border border-border rounded-2xl p-5 space-y-3">
            <h2 className="font-bold mb-2">Account</h2>
            <div className="flex justify-between text-sm">
              <span className="text-muted">User ID</span>
              <span className="font-mono text-xs text-muted">{profile.id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Member since</span>
              <span>{new Date(profile.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
