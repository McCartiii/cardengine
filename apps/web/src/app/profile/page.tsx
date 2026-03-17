"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!authLoading && !user) router.push("/login"); }, [authLoading, user, router]);
  const { data, mutate } = useSWR(user ? "profile" : null, () => api.profile.get());
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (data?.displayName) setDisplayName(data.displayName); }, [data]);
  async function handleSave() {
    setSaving(true);
    try { await api.profile.update({ displayName }); mutate(); setSaved(true); setEditing(false); setTimeout(() => setSaved(false), 2500); }
    finally { setSaving(false); }
  }
  const initials = (data?.displayName ?? user?.email ?? "?").slice(0, 2).toUpperCase();
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display font-extrabold text-4xl text-white leading-none mb-2">Profile</h1>
        <p className="text-sm" style={{ color: "#3d5068" }}>Your account settings</p>
      </div>
      <div className="glass rounded-3xl p-8 mb-6 flex items-center gap-6 animate-enter" style={{ border: "1px solid rgba(0,212,255,0.1)" }}>
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center font-display font-extrabold text-2xl shrink-0"
          style={{ background: "linear-gradient(135deg, #00d4ff 0%, #7c3aed 50%, #ff0080 100%)", backgroundSize: "200%", animation: "holo-shift 4s linear infinite", boxShadow: "0 0 30px rgba(0,212,255,0.3)", color: "#fff" }}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-xl text-white">{data?.displayName ?? "—"}</p>
          <p className="text-sm mt-1 truncate" style={{ color: "#3d5068" }}>{user?.email}</p>
          <p className="text-xs mt-2" style={{ color: "#3d5068" }}>Joined {data?.createdAt ? new Date(data.createdAt).toLocaleDateString() : "—"}</p>
        </div>
      </div>
      <div className="glass rounded-2xl p-6 animate-enter" style={{ border: "1px solid rgba(0,212,255,0.08)" }}>
        <h2 className="font-semibold text-white mb-4">Display Name</h2>
        {editing ? (
          <div className="flex gap-3">
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus
              className="flex-1 bg-transparent text-white text-sm focus:outline-none py-2.5"
              style={{ borderBottom: "1px solid #00d4ff", caretColor: "#00d4ff" }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }} />
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: "rgba(0,212,255,0.1)", color: "#00d4ff", border: "1px solid rgba(0,212,255,0.2)" }}>{saving ? "…" : "Save"}</button>
            <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-xl text-sm" style={{ color: "#3d5068" }}>Cancel</button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: data?.displayName ? "#e2e8f0" : "#3d5068" }}>{data?.displayName ?? "Not set"}</span>
            <button onClick={() => setEditing(true)} className="px-4 py-2 rounded-xl text-xs font-semibold"
              style={{ background: "rgba(0,212,255,0.06)", color: "#00d4ff", border: "1px solid rgba(0,212,255,0.15)" }}>Edit</button>
          </div>
        )}
        {saved && <p className="text-xs mt-3" style={{ color: "#50c878" }}>Saved!</p>}
      </div>
    </div>
  );
}
