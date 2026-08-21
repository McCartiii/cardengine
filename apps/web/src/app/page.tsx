import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { NavBar, FiveCardWheel } from "@/components/ui/NavBar";
import { HomeMarket } from "@/components/home/HomeMarket";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col jewel-atmosphere text-text-primary">
      <NavBar user={user} />

      <section className="relative flex flex-col items-center px-6 pb-12 pt-16 text-center md:pt-20">
        <div
          className="mb-6 flex h-16 w-16 items-center justify-center rounded-[var(--radius-xl)] animate-scale-in"
          style={{
            background: "var(--surface)",
            boxShadow:
              "0 0 0 1px var(--border), 0 12px 40px rgba(78,147,200,0.18), 0 0 60px rgba(232,178,74,0.08)",
          }}
        >
          <FiveCardWheel size={40} />
        </div>

        <h1 className="animate-slide-up text-4xl md:text-6xl font-bold tracking-[-0.04em] leading-[1.05]">
          <span className="italic text-text-primary">Card</span>
          <span className="text-accent">Engine</span>
        </h1>

        <p
          className="mt-4 max-w-lg text-base font-medium text-text-secondary animate-slide-up md:text-lg"
          style={{ animationDelay: "60ms" }}
        >
          Track the best price across markets. Build decks. Scan what you own.
        </p>

        <div
          className="mt-8 flex flex-wrap items-center justify-center gap-3 animate-slide-up"
          style={{ animationDelay: "120ms" }}
        >
          {user ? (
            <>
              <Link
                href="/collection"
                className="rounded-[var(--radius-lg)] px-8 py-3.5 text-base font-bold transition-transform hover:-translate-y-px active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, #4E93C8, #6BAADB)",
                  color: "#050508",
                  boxShadow: "0 4px 20px rgba(78,147,200,0.35)",
                }}
              >
                Open collection
              </Link>
              <Link
                href="/scan"
                className="rounded-[var(--radius-lg)] border border-border bg-surface-raised px-8 py-3.5 text-base font-semibold text-text-primary hover:border-border-strong transition-colors"
              >
                Scan cards
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/register"
                className="rounded-[var(--radius-lg)] px-8 py-3.5 text-base font-bold transition-transform hover:-translate-y-px active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, #4E93C8, #6BAADB)",
                  color: "#050508",
                  boxShadow: "0 4px 20px rgba(78,147,200,0.35)",
                }}
              >
                Get started
              </Link>
              <Link
                href="/login"
                className="rounded-[var(--radius-lg)] border border-border bg-surface-raised px-8 py-3.5 text-base font-semibold text-text-primary hover:border-border-strong transition-colors"
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      </section>

      <HomeMarket />
    </div>
  );
}
