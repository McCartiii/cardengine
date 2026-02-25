"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type Step = "email" | "otp";

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

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep]     = useState<Step>("email");
  const [email, setEmail]   = useState("");
  const [otp, setOtp]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: true },
      });
      if (err) throw err;
      setStep("otp");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp.trim(),
        type: "email",
      });
      if (err) throw err;
      router.replace("/");
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
          background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(139,92,246,0.15) 0%, transparent 70%)",
        }}
      />

      <div className="w-full max-w-sm relative animate-enter">
        {/* Brand */}
        <div className="text-center mb-10">
          {/* Logo mark */}
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{
              background: "linear-gradient(135deg, #4c1d95 0%, #0e4f6e 100%)",
              boxShadow: "0 0 40px rgba(139,92,246,0.4)",
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="url(#loginLg1)"/>
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="url(#loginLg2)" strokeWidth="2" strokeLinecap="round"/>
              <defs>
                <linearGradient id="loginLg1" x1="2" y1="2" x2="22" y2="12" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#c4b5fd"/><stop offset="1" stopColor="#06b6d4"/>
                </linearGradient>
                <linearGradient id="loginLg2" x1="2" y1="12" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#a78bfa"/><stop offset="1" stopColor="#67e8f9"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="text-3xl font-black tracking-tight">
            <span className="text-white">Card</span>
            <span className="gradient-text-violet">Engine</span>
          </h1>
          <p className="text-sm mt-2" style={{ color: "#7c6f9a" }}>Your all-in-one TCG companion</p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: "rgba(17,13,31,0.9)",
            border: "1px solid #2a1f4a",
            boxShadow: "0 0 60px rgba(139,92,246,0.1), 0 24px 48px rgba(0,0,0,0.5)",
            backdropFilter: "blur(12px)",
          }}
        >
          {step === "email" ? (
            <form onSubmit={handleSendOtp} className="flex flex-col gap-5">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Sign in</h2>
                <p className="text-sm" style={{ color: "#7c6f9a" }}>No password — we&apos;ll email you a magic code.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-widest font-semibold" style={{ color: "#7c6f9a" }}>Email</label>
                <input
                  type="email"
                  autoFocus
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={inputStyle}
                  onFocus={e => {
                    (e.target as HTMLInputElement).style.borderColor = "rgba(139,92,246,0.5)";
                    (e.target as HTMLInputElement).style.boxShadow = "0 0 0 3px rgba(139,92,246,0.12)";
                  }}
                  onBlur={e => {
                    (e.target as HTMLInputElement).style.borderColor = "#2a1f4a";
                    (e.target as HTMLInputElement).style.boxShadow = "none";
                  }}
                />
              </div>

              {error && (
                <p className="text-sm px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.2)" }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!email.trim() || loading}
                className="py-3.5 rounded-xl font-bold text-sm text-white transition-all duration-200 disabled:opacity-40"
                style={{
                  background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
                  boxShadow: "0 0 24px rgba(139,92,246,0.35)",
                }}
              >
                {loading ? "Sending…" : "Send Magic Code"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="flex flex-col gap-5">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Check your inbox</h2>
                <p className="text-sm" style={{ color: "#7c6f9a" }}>
                  We sent a code to{" "}
                  <span className="text-accent-light font-semibold">{email}</span>
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-widest font-semibold" style={{ color: "#7c6f9a" }}>6-digit code</label>
                <input
                  type="text"
                  autoFocus
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  style={{ ...inputStyle, fontSize: "28px", fontWeight: 900, letterSpacing: "0.5rem", textAlign: "center" }}
                  onFocus={e => {
                    (e.target as HTMLInputElement).style.borderColor = "rgba(139,92,246,0.5)";
                    (e.target as HTMLInputElement).style.boxShadow = "0 0 0 3px rgba(139,92,246,0.12)";
                  }}
                  onBlur={e => {
                    (e.target as HTMLInputElement).style.borderColor = "#2a1f4a";
                    (e.target as HTMLInputElement).style.boxShadow = "none";
                  }}
                />
              </div>

              {error && (
                <p className="text-sm px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.2)" }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={otp.length !== 6 || loading}
                className="py-3.5 rounded-xl font-bold text-sm text-white transition-all duration-200 disabled:opacity-40"
                style={{
                  background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
                  boxShadow: "0 0 24px rgba(139,92,246,0.35)",
                }}
              >
                {loading ? "Verifying…" : "Sign In"}
              </button>

              <button
                type="button"
                onClick={() => { setStep("email"); setOtp(""); setError(null); }}
                className="text-sm transition-colors duration-200 text-center"
                style={{ color: "#7c6f9a" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#ede9fe"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#7c6f9a"; }}
              >
                ← Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
