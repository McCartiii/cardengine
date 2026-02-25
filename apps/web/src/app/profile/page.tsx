"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Profile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

const inputStyle = {
  background: "#0a0614",
  border: "1px solid #2a1f4a",
  borderRadius: "12px",
  padding: "10px 16px",
  color: "#ede9fe",
  fontSize: "14px",
  outline: "none",
  flex: 1,
};

export default function ProfilePage() {
  const [profile, setProfile]     = useState<Profile | null>(null);
  const [loading, setLoading]     = useState(true);
  const [editing, setEditing]     = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    api.profile.get()
      .then(p => { setProfile(p); setDisplayName(p.displayName ?? ""); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.profile.update({ displayName: displayName.trim() || undefined });
      setProfile(p => p ? { ...p, displayName: displayName.trim() || null } : p);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const initials = profile?.displayName?.slice(0, 2).toUpperCase() ?? "?";

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-10">
        <h1 className="text-4xl font-black mb-2"><span className="gradient-text">Profile</span></h1>
        <p className="text-sm" style={{ color: "#7c6f9a" }}>Your account details</p>
      </div>

      {loading && (
        <div className="space-y-6">
          <div className="flex items-center gap-5">
            <div className="skeleton w-20 h-20 rounded-full" />
            <div className="space-y-2">
              <div className="skeleton h-7 w-40 rounded" />
              <div className="skeleton h-4 w-28 rounded" />
            </div>
          </div>
          <div className="skeleton h-24 w-full rounded-2xl" />
        </div>
      )}

      {!loading && !profile && (
        <div className="py-20 text-center animate-enter">
          <p className="text-lg font-bold text-white mb-2">Not signed in</p>
          <p className="text-sm" style={{ color: "#7c6f9a" }}>Sign in to view your profile.</p>
        </div>
      )}

      {profile && (
        <div className="space-y-6 animate-enter">
          {/* Avatar + name */}
          <div className="flex items-center gap-5">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt={initials} className="w-20 h-20 rounded-full object-cover ring-2 ring-accent/40" />
            ) : (
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-black text-white shrink-0"
                style={{ background: "linear-gradient(135deg, #7c3aed, #0891b2)", boxShadow: "0 0 28px rgba(139,92,246,0.35)" }}
              >
                {initials}
              </div>
            )}
            <div>
              <p className="text-2xl font-black text-white">{profile.displayName ?? "Anonymous"}</p>
              <p className="text-sm mt-0.5" style={{ color: "#7c6f9a" }}>
                Member since {new Date(profile.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </p>
            </div>
          </div>

          {/* Display name */}
          <div className="rounded-2xl p-5" style={{ background: "#110d1f", border: "1px solid #2a1f4a" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-white">Display Name</h2>
              {!editing && (
                <button onClick={() => setEditing(true)}
                  className="text-sm font-semibold transition-colors duration-200"
                  style={{ color: "#c4b5fd" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#ede9fe"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#c4b5fd"; }}>
                  Edit
                </button>
              )}
            </div>
            {editing ? (
              <form onSubmit={handleSave} className="flex gap-3">
                <input
                  autoFocus
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Display name"
                  maxLength={50}
                  style={inputStyle}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = "rgba(139,92,246,0.5)"; }}
                  onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "#2a1f4a"; }}
                />
                <button type="submit" disabled={saving}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all duration-200"
                  style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)" }}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button type="button" onClick={() => setEditing(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-200"
                  style={{ background: "#1a1430", border: "1px solid #2a1f4a", color: "#7c6f9a" }}>
                  Cancel
                </button>
              </form>
            ) : (
              <p className="text-white">{profile.displayName ?? <span style={{ color: "#7c6f9a", fontStyle: "italic" }}>Not set</span>}</p>
            )}
          </div>

          {/* Account info */}
          <div className="rounded-2xl p-5 space-y-3" style={{ background: "#110d1f", border: "1px solid #2a1f4a" }}>
            <h2 className="font-bold text-white mb-2">Account</h2>
            <div className="flex justify-between text-sm" style={{ borderTop: "1px solid #1e1640", paddingTop: "12px" }}>
              <span style={{ color: "#7c6f9a" }}>User ID</span>
              <span className="font-mono text-xs" style={{ color: "#7c6f9a" }}>{profile.id}</span>
            </div>
            <div className="flex justify-between text-sm" style={{ borderTop: "1px solid #1e1640", paddingTop: "12px" }}>
              <span style={{ color: "#7c6f9a" }}>Member since</span>
              <span className="text-white">{new Date(profile.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
