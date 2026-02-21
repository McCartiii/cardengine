"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { useAuth } from "@/components/AuthProvider";

const NAV = [
  { href: "/",            label: "Browse",     icon: "⚡" },
  { href: "/collection",  label: "Collection", icon: "📦" },
  { href: "/decks",       label: "Decks",      icon: "🗂" },
  { href: "/watchlist",   label: "Alerts",     icon: "🔔" },
  { href: "/shops",       label: "Shops",      icon: "🏪" },
  { href: "/profile",     label: "Profile",    icon: "👤" },
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
    <aside className="w-56 shrink-0 h-screen sticky top-0 flex flex-col bg-surface border-r border-border">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-border">
        <span className="text-xl font-black tracking-tight text-white">
          Card<span className="text-accent-light">Engine</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors",
                active
                  ? "bg-accent/20 text-accent-light"
                  : "text-muted hover:bg-surface-2 hover:text-white"
              )}
            >
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Auth footer */}
      <div className="px-4 py-4 border-t border-border">
        {!loading && (
          user ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted truncate">{user.email}</p>
              <button
                onClick={handleSignOut}
                className="text-xs text-muted hover:text-red-400 transition-colors text-left"
              >
                Sign out →
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="text-xs text-accent-light hover:underline"
            >
              Sign in →
            </Link>
          )
        )}
        <p className="text-xs text-muted/50 mt-3">CardEngine © 2025</p>
      </div>
    </aside>
  );
}
