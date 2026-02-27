"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type Tab  = "signin" | "signup";
type Step = "form" | "verify_sent";

const inputStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid #2a1f4a",
  borderRadius: "14px",
  padding: "14px 18px",
  color: "#ede9fe",
  fontSize: "15px",
  outline: "none",
  width: "100%",
  transition: "border-color 0.2s, box-shadow 0.2s",
};

function InputField({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs uppercase tracking-widest font-semibold" style={{ color: "#7c6f9a" }}>
        {label}
      </label>
      <input
        type={type}
        autoFocus={autoFocus}
        required
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
        onFocus={e => {
          e.currentTarget.style.borderColor = "rgba(139,92,246,0.5)";
          e.currentTarget.style.boxShadow  = "0 0 0 3px rgba(139,92,246,0.12)";
        }}
        onBlur={e => {
          e.currentTarget.style.borderColor = "#2a1f4a";
          e.currentTarget.style.boxShadow   = "none";
        }}
      />
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();

  const [tab,      setTab]      = useState<Tab>("signin");
  const [step,     setStep]     = useState<Step>("form");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  function switchTab(t: Tab) {
    setTab(t);
    setStep("form");
    setError(null);
    setPassword("");
    setConfirm("");
  }

  // ── Sign In ──────────────────────────────────────────────────────────────
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email:    email.trim().toLowerCase(),
        password,
      });
      if (err) throw err;
      router.replace("/");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // ── Sign Up ──────────────────────────────────────────────────────────────
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signUp({
        email:    email.trim().toLowerCase(),
        password,
      });
      if (err) throw err;
      setStep("verify_sent");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#0a0614" }}
    >
      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(139,92,246,0.15) 0%, transparent 70%)",
        }}
      />

      <div className="w-full max-w-sm relative animate-enter">
        {/* Brand */}
        <div className="text-center mb-10">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{
              background: "linear-gradient(135deg, #4c1d95 0%, #0e4f6e 100%)",
              boxShadow: "0 0 40px rgba(139,92,246,0.4)",
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="url(#loginLg1)" />
              <path
                d="M2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="url(#loginLg2)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="loginLg1" x1="2" y1="2" x2="22" y2="12" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#c4b5fd" /><stop offset="1" stopColor="#06b6d4" />
                </linearGradient>
                <linearGradient id="loginLg2" x1="2" y1="12" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#a78bfa" /><stop offset="1" stopColor="#67e8f9" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="text-3xl font-black tracking-tight">
            <span className="text-white">Card</span>
            <span className="gradient-text-violet">Engine</span>
          </h1>
          <p className="text-sm mt-2" style={{ color: "#7c6f9a" }}>
            Your all-in-one TCG companion
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: "rgba(17,13,31,0.9)",
            border: "1px solid #2a1f4a",
            boxShadow:
              "0 0 60px rgba(139,92,246,0.1), 0 24px 48px rgba(0,0,0,0.5)",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* ── Verify sent state ─────────────────────────────────────────── */}
          {step === "verify_sent" ? (
            <div className="flex flex-col items-center gap-5 text-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    stroke="#a78bfa"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Check your inbox</h2>
                <p className="text-sm" style={{ color: "#7c6f9a" }}>
                  We sent a verification link to{" "}
                  <span className="font-semibold" style={{ color: "#c4b5fd" }}>{email}</span>.
                  Click it to activate your account, then sign in.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setStep("form"); switchTab("signin"); }}
                className="text-sm transition-colors duration-200"
                style={{ color: "#7c6f9a" }}
                onMouseEnter={e => { e.currentTarget.style.color = "#ede9fe"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "#7c6f9a"; }}
              >
                ← Back to sign in
              </button>
            </div>
          ) : (
            <>
              {/* ── Tabs ──────────────────────────────────────────────────── */}
              <div
                className="flex rounded-xl mb-6 p-1"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2a1f4a" }}
              >
                {(["signin", "signup"] as Tab[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => switchTab(t)}
                    className="flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200"
                    style={
                      tab === t
                        ? {
                            background: "linear-gradient(135deg, #4c1d95 0%, #1e3a5f 100%)",
                            color: "#ede9fe",
                            boxShadow: "0 2px 8px rgba(139,92,246,0.25)",
                          }
                        : { color: "#7c6f9a" }
                    }
                  >
                    {t === "signin" ? "Sign In" : "Sign Up"}
                  </button>
                ))}
              </div>

              {/* ── Sign In form ───────────────────────────────────────────── */}
              {tab === "signin" && (
                <form onSubmit={handleSignIn} className="flex flex-col gap-5">
                  <InputField label="Email"    type="email"    value={email}    onChange={setEmail}    placeholder="you@example.com" autoFocus />
                  <InputField label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />

                  {error && (
                    <p
                      className="text-sm px-3 py-2 rounded-lg"
                      style={{ background: "rgba(239,68,68,0.1)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.2)" }}
                    >
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={!email.trim() || !password || loading}
                    className="py-3.5 rounded-xl font-bold text-sm text-white transition-all duration-200 disabled:opacity-40"
                    style={{
                      background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
                      boxShadow: "0 0 24px rgba(139,92,246,0.35)",
                    }}
                  >
                    {loading ? "Signing in…" : "Sign In"}
                  </button>

                  <p className="text-xs text-center" style={{ color: "#7c6f9a" }}>
                    No account?{" "}
                    <button
                      type="button"
                      onClick={() => switchTab("signup")}
                      className="underline transition-colors duration-200"
                      style={{ color: "#a78bfa" }}
                    >
                      Create one
                    </button>
                  </p>
                </form>
              )}

              {/* ── Sign Up form ───────────────────────────────────────────── */}
              {tab === "signup" && (
                <form onSubmit={handleSignUp} className="flex flex-col gap-5">
                  <InputField label="Email"            type="email"    value={email}    onChange={setEmail}    placeholder="you@example.com" autoFocus />
                  <InputField label="Password"         type="password" value={password} onChange={setPassword} placeholder="Min. 8 characters" />
                  <InputField label="Confirm Password" type="password" value={confirm}  onChange={setConfirm}  placeholder="Repeat password" />

                  {error && (
                    <p
                      className="text-sm px-3 py-2 rounded-lg"
                      style={{ background: "rgba(239,68,68,0.1)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.2)" }}
                    >
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={!email.trim() || !password || !confirm || loading}
                    className="py-3.5 rounded-xl font-bold text-sm text-white transition-all duration-200 disabled:opacity-40"
                    style={{
                      background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
                      boxShadow: "0 0 24px rgba(139,92,246,0.35)",
                    }}
                  >
                    {loading ? "Creating account…" : "Create Account"}
                  </button>

                  <p className="text-xs text-center" style={{ color: "#7c6f9a" }}>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => switchTab("signin")}
                      className="underline transition-colors duration-200"
                      style={{ color: "#a78bfa" }}
                    >
                      Sign in
                    </button>
                  </p>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
