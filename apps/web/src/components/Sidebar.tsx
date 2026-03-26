"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { useAuth } from "@/components/AuthProvider";

/* ─── Icons ────────────────────────────────────────────────────────────── */
const Icons = {
  Browse: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  ),
  Collection: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  Decks: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    </svg>
  ),
  Life: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ),
  Alerts: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  Shops: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l1-5h16l1 5"/><path d="M21 9H3v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9z"/><path d="M9 21V9m6 12V9"/>
    </svg>
  ),
  Profile: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  Admin: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  SignOut: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
};

const NAV = [
  { href: "/",           label: "Browse",     Icon: Icons.Browse     },
  { href: "/collection", label: "Collection", Icon: Icons.Collection },
  { href: "/decks",      label: "Decks",      Icon: Icons.Decks      },
  { href: "/life",       label: "Life",       Icon: Icons.Life       },
  { href: "/watchlist",  label: "Alerts",     Icon: Icons.Alerts     },
  { href: "/shops",      label: "Shops",      Icon: Icons.Shops      },
  { href: "/profile",    label: "Profile",    Icon: Icons.Profile    },
  { href: "/admin",      label: "Admin",      Icon: Icons.Admin      },
];

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, loading, signOut } = useAuth();

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "?";

  return (
    <aside
      className="flex flex-col w-[220px] min-h-screen shrink-0 relative z-20"
      style={{
        background: "rgba(6,8,16,0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRight: "1px solid rgba(0,212,255,0.10)",
      }}
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <Link href="/" className="flex items-center gap-3 group">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-display font-bold shrink-0 relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #00d4ff 0%, #7c3aed 50%, #ff0080 100%)",
              backgroundSize: "200%",
              animation: "holo-shift 4s linear infinite",
            }}
          >
            <span style={{ color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>CE</span>
          </div>
          <div>
            <p className="text-sm font-display font-bold leading-none text-white">CardEngine</p>
            <p className="text-[10px] leading-none mt-0.5" style={{ color: "#3d5068" }}>TCG Platform</p>
          </div>
        </Link>
      </div>

      {/* Divider */}
      <div className="mx-4 mb-4" style={{ height: 1, background: "rgba(0,212,255,0.08)" }} />

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {NAV.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group",
                active
                  ? "text-white"
                  : "text-muted hover:text-white"
              )}
              style={active ? {
                background: "rgba(0,212,255,0.08)",
                borderLeft: "2px solid #00d4ff",
                paddingLeft: "10px",
                boxShadow: "inset 0 0 16px rgba(0,212,255,0.04)",
              } : {}}
            >
              <span
                className="shrink-0 transition-colors duration-150"
                style={{ color: active ? "#00d4ff" : undefined }}
              >
                <Icon />
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      {!loading && user && (
        <div className="px-4 pb-5 pt-4 border-t" style={{ borderColor: "rgba(0,212,255,0.08)" }}>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: "linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)", color: "#fff" }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user.email}</p>
              <p className="text-[10px]" style={{ color: "#3d5068" }}>Signed in</p>
            </div>
          </div>
          <button
            onClick={async () => { await signOut(); router.push("/login"); }}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{ color: "#3d5068" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#ff0080"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#3d5068"; }}
          >
            <Icons.SignOut />
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
