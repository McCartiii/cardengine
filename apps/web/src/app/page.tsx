import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { NavBar } from "@/components/ui/NavBar";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text-primary">
      <NavBar user={user} />

      {/* ── Hero: Gallery / Editorial Layout ── */}
      <section className="relative w-full max-w-7xl mx-auto px-6 py-24 lg:py-32 grid lg:grid-cols-2 gap-16 lg:gap-8 items-center min-h-[calc(100vh-64px)]">
        
        {/* Left content: Editorial typography */}
        <div className="relative z-10 font-sans animate-slide-up">
          <div className="mb-6 inline-flex border border-border px-4 py-1.5 rounded-full text-xs font-bold text-text-secondary tracking-widest uppercase">
            MTG Collection Platform
          </div>

          <h1 className="text-5xl lg:text-7xl font-black leading-[1.05] tracking-[-0.04em] text-text-primary mb-6">
            Your deck.<br />
            Your engine.
          </h1>

          <p className="text-lg text-text-secondary leading-relaxed mb-10 max-w-md font-medium">
            Build decks with precision. Scan cards with your camera. Track physical values and curate your ultimate collection in an elegant, distraction-free gallery.
          </p>

          <div className="flex flex-wrap gap-4">
            {user ? (
              <Link
                href="/collection"
                className="card-hover-physical bg-accent text-white px-8 py-4 rounded-xl text-base font-bold shadow-card-rest transition-all block text-center"
              >
                Go to Collection
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className="card-hover-physical bg-accent text-white px-8 py-4 rounded-xl text-base font-bold shadow-card-rest transition-all inline-flex items-center justify-center"
                >
                  Get started
                </Link>
                <Link
                  href="/login"
                  className="bg-transparent border border-border text-text-primary px-8 py-4 rounded-xl text-base font-bold hover:bg-surface transition-all inline-flex items-center justify-center"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Right: Tactile Physical Card Stack */}
        <div className="relative z-10 flex justify-center lg:justify-end animate-fade-in stagger-3">
          <div className="relative w-[300px] h-[450px]">
            {[
              { 
                name: "Lightning Bolt", type: "Instant", 
                text: "Lightning Bolt deals 3 damage to any target.", 
                mana: [{ c: "R", bg: "var(--mana-R)", fg: "var(--mana-R-text)" }], 
                tint: "var(--id-R-tint)", borderColor: "var(--id-R-border)",
                rotate: -6, top: 0, left: 0, z: 1 
              },
              { 
                name: "Counterspell", type: "Instant", 
                text: "Counter target spell.", 
                mana: [{ c: "U", bg: "var(--mana-U)", fg: "var(--mana-U-text)" }, { c: "U", bg: "var(--mana-U)", fg: "var(--mana-U-text)" }], 
                tint: "var(--id-U-tint)", borderColor: "var(--id-U-border)",
                rotate: 3, top: 40, left: 30, z: 2 
              },
              { 
                name: "Sol Ring", type: "Artifact", 
                text: "Tap: Add two colorless mana.", 
                mana: [{ c: "1", bg: "#E5E7EB", fg: "#111827" }], 
                tint: "var(--surface)", borderColor: "var(--border)",
                rotate: -2, top: 80, left: -10, z: 3 
              },
            ].map((card) => (
              <div
                key={card.name}
                className="absolute overflow-hidden card-hover-physical bg-bg cursor-pointer"
                style={{
                  width: 240, height: 340, borderRadius: 16,
                  border: `1px solid ${card.borderColor}`,
                  top: card.top, left: card.left, zIndex: card.z,
                  transform: `rotate(${card.rotate}deg)`,
                  transformOrigin: "center center"
                }}
              >
                {/* Card Art Placeholder */}
                <div style={{ width: "100%", height: 140, background: card.tint, borderBottom: `1px solid ${card.borderColor}` }} />
                
                <div className="p-4" style={{ backgroundColor: "var(--bg)" }}>
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-[14px] font-bold text-text-primary tracking-tight">{card.name}</div>
                    <div className="flex gap-0.5">
                      {card.mana.map((m, i) => (
                        <span key={i} className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black shadow-sm border border-black/5" style={{ background: m.bg, color: m.fg }}>
                          {m.c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-[11px] font-bold text-text-secondary mb-3">{card.type}</div>
                  <div className="text-[12px] text-text-primary leading-snug">{card.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features: Stark Swiss Grid Layout ── */}
      <section className="border-t border-border bg-surface w-full">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="mb-16 md:flex md:items-end md:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-3xl md:text-5xl font-black text-text-primary tracking-tight mb-4">
                Structured for<br />the competitive edge.
              </h2>
              <p className="text-lg text-text-secondary font-medium">No glowing gimmicks. Just the data and tools you need.</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-16">
            {[
              {
                title: "Collection Engine", desc: "Minimalist tracking. Sort by condition, organize by physical binder. Perfectly synced.",
                num: "01",
                icon: <path d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />,
              },
              {
                title: "Physical Scanner", desc: "Point your camera. Fast, accurate identification utilizing optimized machine learning.",
                num: "02",
                icon: <><path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></>,
              },
              {
                title: "Market Value", desc: "Clean aggregates from TCGplayer and Cardmarket. Real-time shifts, zero noise.",
                num: "03",
                icon: <path d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
              },
              {
                title: "Deck Architect", desc: "Construct formats with automated rules validation and intelligent curve analysis.",
                num: "04",
                icon: <><path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></>,
              },
              {
                title: "Local Radar", desc: "High-contrast map visualization locating sanctioned events and local game stores.",
                num: "05",
                icon: <><path d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></>,
              },
              {
                title: "Rules Validator", desc: "Instant compliance testing against active DCI banlists and format errata.",
                num: "06",
                icon: <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />,
              },
            ].map((f) => (
              <div key={f.title} className="group cursor-default">
                <div className="flex items-center gap-4 mb-4">
                  <div className="text-xl font-mono font-black text-text-muted">{f.num}</div>
                  <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-bg border border-border shadow-sm text-accent group-hover:bg-accent group-hover:text-white transition-colors duration-300">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      {f.icon}
                    </svg>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-3 tracking-tight">{f.title}</h3>
                <p className="text-[15px] text-text-secondary leading-relaxed font-medium">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="w-full border-t border-border bg-bg px-6 py-12 text-center">
        <div className="text-sm font-bold text-text-primary tracking-widest uppercase opacity-80">
          Card Engine <span className="mx-2 text-text-muted font-normal">|</span> MTG Platform
        </div>
      </footer>
    </div>
  );
}
