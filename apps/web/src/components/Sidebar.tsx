"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { useAuth } from "@/components/AuthProvider";

/* ─── SVG icons ──────────────────────────────────────────────────────── */
const Icons = {
  Browse: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  ),
  Collection: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  Decks: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    </svg>
  ),
  Alerts: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  Shops: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l1-5h16l1 5"/><path d="M21 9v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9"/><path d="M9 21V9M15 21V9"/>
    </svg>
  ),
  Profile: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  Admin: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  SignOut: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
};

const NAV = [
  { href: "/",           label: "Browse",     Icon: Icons.Browse },
  { href: "/collection", label: "Collection", Icon: Icons.Collection },
  { href: "/decks",      label: "Decks",      Icon: Icons.Decks },
  { href: "/watchlist",  label: "Alerts",     Icon: Icons.Alerts },
  { href: "/shops",      label: "Shops",      Icon: Icons.Shops },
  { href: "/profile",    label: "Profile",    Icon: Icons.Profile },
  { href: "/admin",      label: "Admin",      Icon: Icons.Admin },
];

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const { user, signOut, loading } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  return (
    <aside
      className="w-60 shrink-0 h-screen sticky top-0 flex flex-col"
      style={{
        background: "linear-gradient(180deg, #0e0a1e 0%, #0a0614 100%)",
        borderRight: "1px solid #1e1640",
      }}
    >
      {/* ── Logo ── */}
      <div
        className="px-5 py-[18px] flex items-center gap-3"
        style={{ borderBottom: "1px solid #1e1640" }}
      >
        {/* Logo mark */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, #4c1d95 0%, #0e4f6e 100%)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5z" fill="url(#sbl)"/>
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="url(#sbl2)" strokeWidth="2" strokeLinecap="round"/>
            <defs>
              <linearGradient id="sbl" x1="2" y1="2" x2="22" y2="12" gradientUnits="userSpaceOnUse">
                <stop stopColor="#c4b5fd"/><stop offset="1" stopColor="#06b6d4"/>
              </linearGradient>
              <linearGradient id="sbl2" x1="2" y1="12" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                <stop stopColor="#a78bfa"/><stop offset="1" stopColor="#67e8f9"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <span className="text-[17px] font-black tracking-tight">
          <span className="text-white">Card</span>
          <span className="gradient-text-violet">Engine</span>
        </span>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 group",
                active ? "text-white" : "text-muted hover:text-white"
              )}
              style={
                active
                  ? {
                      background:
                        "linear-gradient(135deg, rgba(139,92,246,0.20) 0%, rgba(99,102,241,0.12) 100%)",
                      boxShadow: "inset 0 0 0 1px rgba(139,92,246,0.28)",
                    }
                  : undefined
              }
            >
              {/* Hover bg */}
              {!active && (
                <span
                  className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  style={{ background: "rgba(139,92,246,0.08)" }}
                />
              )}

              <span
                className={clsx(
                  "relative shrink-0 transition-colors duration-200",
                  active
                    ? "text-accent-light"
                    : "text-muted group-hover:text-accent-light"
                )}
              >
                <Icon />
              </span>

              <span className="relative">{label}</span>

              {/* Active pip */}
              {active && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent-light" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── User footer ── */}
      <div className="px-4 py-4" style={{ borderTop: "1px solid #1e1640" }}>
        {!loading && (
          user ? (
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white"
                style={{ background: "linear-gradient(135deg, #7c3aed, #0891b2)" }}
              >
                {user.email?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/80 font-medium truncate">{user.email}</p>
                <button
                  onClick={handleSignOut}
                  className="text-[11px] text-muted hover:text-red-400 transition-colors flex items-center gap-1 mt-0.5"
                >
                  <Icons.SignOut /> Sign out
                </button>
              </div>
            </div>
          ) : (
            <Link
              href="/login"
              className="text-xs text-accent-light hover:text-white transition-colors font-semibold"
            >
              Sign in →
            </Link>
          )
        )}
        <p className="text-[10px] text-muted/30 mt-3 uppercase tracking-widest font-medium">
          CardEngine © 2025
        </p>
      </div>
    </aside>
  );
}
