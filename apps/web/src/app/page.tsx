import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { NavBar } from "@/components/ui/NavBar";

const features = [
  {
    title: "Collection Tracking",
    desc: "Add cards, track condition, organize by binder or box. Offline-first with cloud sync.",
    iconBg: "bg-[var(--mana-U)]",
    iconColor: "text-[var(--mana-U-text)]",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
  },
  {
    title: "Camera Scanner",
    desc: "Point your phone at a card to identify it instantly using OCR and machine learning.",
    iconBg: "bg-[var(--mana-R)]",
    iconColor: "text-[var(--mana-R-text)]",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
      </svg>
    ),
  },
  {
    title: "Live Prices",
    desc: "Prices from TCGplayer and Cardmarket, updated daily. Set alerts via your watchlist.",
    iconBg: "bg-[var(--mana-W)]",
    iconColor: "text-[var(--mana-W-text)]",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Deck Builder",
    desc: "Build and validate decks for Standard, Modern, Pioneer, Commander, and more.",
    iconBg: "bg-[var(--mana-B)]",
    iconColor: "text-[var(--mana-B-text)]",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-1.243 1.007-2.25 2.25-2.25h13.5" />
      </svg>
    ),
  },
  {
    title: "Local Shops",
    desc: "Find nearby card shops, check in, and connect with local players.",
    iconBg: "bg-[var(--mana-G)]",
    iconColor: "text-[var(--mana-G-text)]",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
  },
  {
    title: "Rules Engine",
    desc: "Automatic deck validation against official format rules and up-to-date ban lists.",
    iconBg: "bg-accent-light",
    iconColor: "text-accent-text",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
      </svg>
    ),
  },
];

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <NavBar user={user} />

      <main className="mx-auto flex max-w-6xl flex-1 flex-col items-center px-6 py-20 text-center">
        {/* Hero */}
        <div className="animate-fade-in">
          <h1 className="font-display max-w-2xl text-5xl font-bold tracking-tight text-text-primary leading-[1.1]">
            Manage your MTG collection with{" "}
            <span style={{ color: "var(--accent)" }}>precision</span>
          </h1>
          <p className="mt-6 max-w-lg mx-auto text-lg text-text-secondary leading-relaxed">
            Track cards, build decks, monitor prices, scan with your camera,
            and find local game stores. All synced across devices.
          </p>
        </div>

        <div className="mt-10 flex gap-3 animate-slide-up">
          {user ? (
            <Link
              href="/collection"
              className="rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 hover:shadow-md active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, var(--accent), var(--accent-text))",
                boxShadow: "0 2px 10px rgba(201,168,76,0.3)",
              }}
            >
              Go to Collection
            </Link>
          ) : (
            <>
              <Link
                href="/register"
                className="rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 hover:shadow-md active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, var(--accent), var(--accent-text))",
                  boxShadow: "0 2px 10px rgba(201,168,76,0.3)",
                }}
              >
                Create free account
              </Link>
              <Link
                href="/login"
                className="rounded-xl border px-6 py-3 text-sm font-semibold transition-all hover:shadow-sm active:scale-[0.98]"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface-raised)",
                  color: "var(--text-primary)",
                }}
              >
                Sign in
              </Link>
            </>
          )}
        </div>

        {/* Feature cards */}
        <div className="mt-24 grid w-full max-w-4xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <div
              key={feature.title}
              className={`animate-slide-up stagger-${i + 1} card-hover rounded-2xl border border-border bg-surface p-6 text-left shadow-[var(--shadow-card)]`}
            >
              <div
                className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${feature.iconBg} ${feature.iconColor}`}
              >
                {feature.icon}
              </div>
              <h3 className="font-display mt-4 text-base font-semibold text-text-primary">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-text-muted">
        Card Engine &mdash; Open-source MTG collection platform
      </footer>
    </div>
  );
}
