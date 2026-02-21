"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type Step = "email" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: trimmed,
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
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black tracking-tight">
            Card<span className="text-accent-light">Engine</span>
          </h1>
          <p className="text-muted mt-2 text-sm">Your all-in-one TCG companion</p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-8">
          {step === "email" ? (
            <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-bold mb-1">Sign in</h2>
                <p className="text-muted text-sm">No password needed — we'll email you a code.</p>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted uppercase tracking-wider font-bold">Email</label>
                <input
                  type="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="bg-bg border border-border rounded-xl px-4 py-3 text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/60 text-sm"
                />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={!email.trim() || loading}
                className="py-3 bg-accent text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-accent/80 transition-colors"
              >
                {loading ? "Sending…" : "Send Code"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-bold mb-1">Check your email</h2>
                <p className="text-muted text-sm">
                  We sent a 6-digit code to{" "}
                  <span className="text-accent-light font-semibold">{email}</span>
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted uppercase tracking-wider font-bold">Code</label>
                <input
                  type="text"
                  autoFocus
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="bg-bg border border-border rounded-xl px-4 py-3 text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/60 text-3xl font-black tracking-[0.5rem] text-center"
                />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={otp.length !== 6 || loading}
                className="py-3 bg-accent text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-accent/80 transition-colors"
              >
                {loading ? "Verifying…" : "Sign In"}
              </button>

              <button
                type="button"
                onClick={() => { setStep("email"); setOtp(""); setError(null); }}
                className="text-muted text-sm hover:text-white transition-colors text-center"
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
