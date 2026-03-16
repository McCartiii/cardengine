"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode]         = useState<"signin" | "signup">("signin");
  const [error, setError]       = useState<string | null>(null);
  const [info, setInfo]         = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        setInfo("Check your email for a confirmation link.");
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        if (data.session?.access_token) setToken(data.session.access_token);
        router.push("/");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "#060810" }}
    >
      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,212,255,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex w-14 h-14 rounded-2xl items-center justify-center text-xl font-display font-extrabold mb-4"
            style={{
              background: "linear-gradient(135deg, #00d4ff 0%, #7c3aed 50%, #ff0080 100%)",
              backgroundSize: "200%",
              animation: "holo-shift 4s linear infinite",
              boxShadow: "0 0 30px rgba(0,212,255,0.25)",
            }}
          >
            <span style={{ color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>CE</span>
          </div>
          <h1 className="font-display font-extrabold text-2xl text-white">CardEngine</h1>
          <p className="text-xs mt-1" style={{ color: "#3d5068" }}>
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </p>
        </div>

        {/* Form card */}
        <div className="glass rounded-3xl p-7" style={{ border: "1px solid rgba(0,212,255,0.12)" }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#3d5068" }}>EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full bg-transparent text-white text-sm placeholder:text-muted/40 focus:outline-none py-2.5"
                style={{
                  borderBottom: "1px solid rgba(0,212,255,0.25)",
                  caretColor: "#00d4ff",
                }}
                onFocus={(e) => { e.target.style.borderBottomColor = "#00d4ff"; }}
                onBlur={(e) => { e.target.style.borderBottomColor = "rgba(0,212,255,0.25)"; }}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#3d5068" }}>PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-transparent text-white text-sm placeholder:text-muted/40 focus:outline-none py-2.5"
                style={{
                  borderBottom: "1px solid rgba(0,212,255,0.25)",
                  caretColor: "#00d4ff",
                }}
                onFocus={(e) => { e.target.style.borderBottomColor = "#00d4ff"; }}
                onBlur={(e) => { e.target.style.borderBottomColor = "rgba(0,212,255,0.25)"; }}
              />
            </div>

            {/* Error / info */}
            {error && (
              <p className="text-xs" style={{ color: "#ff6bad" }}>{error}</p>
            )}
            {info && (
              <p className="text-xs" style={{ color: "#00d4ff" }}>{info}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-bold transition-all duration-150 mt-2"
              style={{
                background: loading ? "#1e2d45" : "linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)",
                color: "#fff",
                boxShadow: loading ? "none" : "0 0 20px rgba(0,212,255,0.25)",
              }}
            >
              {loading ? "Loading…" : mode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>

          {/* Toggle */}
          <div className="mt-5 text-center">
            <button
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setInfo(null); }}
              className="text-xs transition-colors"
              style={{ color: "#3d5068" }}
              onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.color = "#00d4ff"; }}
              onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.color = "#3d5068"; }}
            >
              {mode === "signin" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
