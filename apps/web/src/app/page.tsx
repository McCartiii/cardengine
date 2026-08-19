import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { NavBar } from "@/components/ui/NavBar";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "#080d18" }}>
      <NavBar user={user} />

      {/* ── Hero: Split layout ── */}
      <section
        className="relative flex-1 grid items-center overflow-hidden"
        style={{ gridTemplateColumns: "1fr 1fr", minHeight: "calc(100vh - 56px)", padding: "80px 48px", gap: 40 }}
      >
        {/* Ambient glow */}
        <div className="pointer-events-none absolute" style={{ top: "20%", right: 0, width: 600, height: 600, background: "radial-gradient(circle, rgba(8,145,178,0.08) 0%, transparent 60%)" }} />

        {/* Left content */}
        <div className="relative z-10">
          <div
            className="inline-flex items-center gap-2 mb-7"
            style={{ padding: "6px 18px", borderRadius: 20, background: "rgba(8,145,178,0.06)", border: "1px solid rgba(34,211,238,0.12)", fontSize: 11, fontWeight: 600, color: "#22d3ee" }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22d3ee", boxShadow: "0 0 8px rgba(34,211,238,0.5)", display: "inline-block" }} />
            MTG Collection Platform
          </div>

          <h1 style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.06, letterSpacing: "-0.04em", color: "#f0fdff", marginBottom: 18 }}>
            Your deck.<br />
            <span style={{ background: "linear-gradient(135deg, #22d3ee, #06b6d4, #67e8f9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Your engine.
            </span>
          </h1>

          <p style={{ fontSize: 16, color: "#3d5068", lineHeight: 1.75, marginBottom: 32, maxWidth: 420 }}>
            Build decks with AI-powered recommendations. Scan cards with your camera. Track prices and find local game stores.
          </p>

          <div className="flex gap-3">
            {user ? (
              <Link
                href="/collection"
                style={{
                  padding: "14px 36px", borderRadius: 12, fontSize: 15, fontWeight: 700,
                  background: "linear-gradient(135deg, #0891b2, #0e7490)", color: "#fff",
                  boxShadow: "0 0 30px rgba(8,145,178,0.3), 0 8px 24px rgba(0,0,0,0.4)",
                  textDecoration: "none", transition: "all 0.2s",
                }}
              >
                Go to Collection
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  style={{
                    padding: "14px 36px", borderRadius: 12, fontSize: 15, fontWeight: 700,
                    background: "linear-gradient(135deg, #0891b2, #0e7490)", color: "#fff",
                    boxShadow: "0 0 30px rgba(8,145,178,0.3), 0 8px 24px rgba(0,0,0,0.4)",
                    textDecoration: "none",
                  }}
                >
                  Get started
                </Link>
                <Link
                  href="/login"
                  style={{
                    padding: "14px 36px", borderRadius: 12, fontSize: 15, fontWeight: 600,
                    background: "rgba(12,20,36,0.6)", border: "1px solid rgba(34,211,238,0.12)",
                    color: "#22d3ee", textDecoration: "none",
                  }}
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Right: Floating card stack */}
        <div className="relative z-10 flex justify-center">
          <div className="relative" style={{ width: 280, height: 420 }}>
            {[
              { name: "Lightning Bolt", type: "Instant", text: "Lightning Bolt deals 3 damage to any target.", mana: [{ c: "R", bg: "#ef4444", fg: "#fff" }], rotate: -4, top: 0, left: 0, z: 1, glow: false },
              { name: "Counterspell", type: "Instant", text: "Counter target spell.", mana: [{ c: "U", bg: "#60a5fa", fg: "#1a1a1a" }, { c: "U", bg: "#60a5fa", fg: "#1a1a1a" }], rotate: 2, top: 50, left: 40, z: 2, glow: false },
              { name: "Sol Ring", type: "Artifact", text: "Tap: Add two colorless mana.", mana: [{ c: "1", bg: "#94a3b8", fg: "#1a1a1a" }], rotate: -1, top: 100, left: 20, z: 3, glow: true },
            ].map((card) => (
              <div
                key={card.name}
                className="absolute overflow-hidden"
                style={{
                  width: 220, borderRadius: 14,
                  border: `1px solid rgba(34,211,238,${card.glow ? 0.25 : 0.1})`,
                  background: "rgba(12,20,36,0.7)", backdropFilter: "blur(8px)",
                  boxShadow: card.glow
                    ? "0 16px 48px rgba(0,0,0,0.4), 0 0 20px rgba(8,145,178,0.08)"
                    : "0 16px 48px rgba(0,0,0,0.4)",
                  top: card.top, left: card.left, zIndex: card.z,
                  transform: `rotate(${card.rotate}deg)`,
                }}
              >
                <div style={{ width: "100%", height: 100, background: "linear-gradient(135deg, #0c1a2e, #101828)" }} />
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#e0f7ff", marginBottom: 3 }}>{card.name}</div>
                  <div style={{ fontSize: 10, color: "#3d5068", marginBottom: 8 }}>{card.type}</div>
                  <div style={{ fontSize: 9, color: "#3d5068", lineHeight: 1.5 }}>{card.text}</div>
                  <div className="flex gap-1 mt-2">
                    {card.mana.map((m, i) => (
                      <span key={i} style={{
                        width: 14, height: 14, borderRadius: "50%", fontSize: 8, fontWeight: 800,
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        background: m.bg, color: m.fg,
                      }}>{m.c}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ maxWidth: 1060, margin: "0 auto", padding: "80px 24px 100px", width: "100%" }}>
        <div className="text-center mb-12">
          <h2 style={{ fontSize: 34, fontWeight: 800, color: "#f0fdff", letterSpacing: "-0.02em", marginBottom: 8 }}>
            Built for the game
          </h2>
          <p style={{ fontSize: 14, color: "#3d5068" }}>Everything you need to collect, build, and compete.</p>
        </div>

        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {[
            {
              title: "Collection", desc: "Track cards, condition, organize by binder. Cloud synced.",
              color: "#60a5fa", rgb: "96,165,250",
              icon: <path d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />,
            },
            {
              title: "Scanner", desc: "Point and identify instantly via OCR and machine learning.",
              color: "#f87171", rgb: "239,68,68",
              icon: <><path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></>,
            },
            {
              title: "Live Prices", desc: "TCGplayer + Cardmarket, daily updates. Watchlist alerts.",
              color: "#fbbf24", rgb: "251,191,36",
              icon: <path d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
            },
            {
              title: "AI Advisor", desc: "EDHREC + Scryfall powered deck building with AI. Every format.",
              color: "#22d3ee", rgb: "34,211,238",
              icon: <><path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></>,
            },
            {
              title: "Shop Finder", desc: "Find local game stores on the map and connect with players.",
              color: "#34d399", rgb: "52,211,153",
              icon: <><path d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></>,
            },
            {
              title: "Rules Engine", desc: "Format validation and ban list enforcement, always current.",
              color: "#06b6d4", rgb: "8,145,178",
              icon: <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />,
            },
          ].map((f) => (
            <div
              key={f.title}
              className="relative overflow-hidden transition-all duration-200"
              style={{
                background: "rgba(12,20,36,0.5)", backdropFilter: "blur(12px)",
                border: "1px solid rgba(34,211,238,0.06)", borderRadius: 16,
                padding: "28px 24px",
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12, marginBottom: 16,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: `rgba(${f.rgb},0.08)`, border: `1px solid rgba(${f.rgb},0.15)`, color: f.color,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  {f.icon}
                </svg>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#e0f7ff", marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: "#3d5068", lineHeight: 1.65 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ borderTop: "1px solid rgba(34,211,238,0.04)", padding: 28, textAlign: "center", fontSize: 12, color: "#1e2d40" }}>
        Card Engine — MTG Collection Platform
      </footer>
    </div>
  );
}
