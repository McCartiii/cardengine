"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

/** Five-card wheel mark — gold → garnet foil ramp */
export function FiveCardWheel({ size = 28 }: { size?: number }) {
  const colors = ["#E8B24A", "#D4894F", "#C24667", "#A84A5E", "#8B3A52"];
  const cx = 12;
  const cy = 12;
  const cards = colors.map((fill, i) => {
    const angle = (i * 72 - 90) * (Math.PI / 180);
    const x = cx + Math.cos(angle) * 3.2;
    const y = cy + Math.sin(angle) * 3.2;
    const rot = i * 72;
    return (
      <rect
        key={i}
        x={x - 2.2}
        y={y - 3.4}
        width={4.4}
        height={6.8}
        rx={0.7}
        fill={fill}
        transform={`rotate(${rot} ${x} ${y})`}
        opacity={0.95}
      />
    );
  });
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {cards}
    </svg>
  );
}

function CollectionIcon() {
  return (
    <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}

function DeckIcon() {
  return (
    <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-1.243 1.007-2.25 2.25-2.25h13.5" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
    </svg>
  );
}

function WatchlistIcon() {
  return (
    <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

const desktopNav: NavItem[] = [
  { href: "/collection", label: "Collection", icon: <CollectionIcon /> },
  { href: "/decks", label: "Decks", icon: <DeckIcon /> },
  { href: "/scan", label: "Scan", icon: <ScanIcon /> },
  { href: "/watchlist", label: "Watchlist", icon: <WatchlistIcon /> },
  { href: "/settings", label: "Settings", icon: <SettingsIcon /> },
];

/** Mobile bottom tabs — app-shell IA */
const mobileTabs: NavItem[] = [
  { href: "/collection", label: "Collection", icon: <CollectionIcon /> },
  { href: "/decks", label: "Decks", icon: <DeckIcon /> },
  { href: "/scan", label: "Scan", icon: <ScanIcon /> },
  { href: "/watchlist", label: "Watchlist", icon: <WatchlistIcon /> },
  { href: "/settings", label: "Profile", icon: <SettingsIcon /> },
];

function BrandMark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 shrink-0">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)]"
        style={{
          background: "var(--surface-raised)",
          boxShadow: "0 0 0 1px var(--border), 0 2px 8px rgba(78,147,200,0.2)",
        }}
      >
        <FiveCardWheel size={22} />
      </span>
      <span className="leading-none">
        <span className="text-base font-semibold tracking-tight text-text-primary italic">Card</span>
        <span className="text-base font-bold tracking-tight text-accent">Engine</span>
      </span>
    </Link>
  );
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function NavBar({ user }: { user: { email?: string } | null }) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop / tablet top bar */}
      <nav
        aria-label="Main navigation"
        className="sticky top-0 z-50 border-b border-border hidden md:block"
        style={{
          background: "var(--surface-overlay)",
          backdropFilter: "blur(16px) saturate(1.3)",
          WebkitBackdropFilter: "blur(16px) saturate(1.3)",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <BrandMark />

          <div className="flex items-center gap-1">
            {user ? (
              desktopNav.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-all duration-150
                      ${active ? "font-semibold text-accent" : "font-medium text-text-secondary hover:text-text-primary"}`}
                    style={{
                      backgroundColor: active ? "var(--accent-light)" : "transparent",
                      boxShadow: active ? "inset 0 0 0 1px rgba(78,147,200,0.35)" : "none",
                    }}
                  >
                    {item.icon}
                    <span className="hidden lg:inline">{item.label}</span>
                  </Link>
                );
              })
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="rounded-[var(--radius-lg)] px-4 py-2 text-sm font-semibold transition-colors"
                  style={{
                    background: "linear-gradient(135deg, #4E93C8, #6BAADB)",
                    color: "#050508",
                    boxShadow: "0 2px 10px rgba(78,147,200,0.35)",
                  }}
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile top brand strip */}
      <div
        className="sticky top-0 z-50 border-b border-border md:hidden px-4 py-3 flex items-center justify-between"
        style={{ background: "var(--surface-overlay)", backdropFilter: "blur(16px)" }}
      >
        <BrandMark />
        {!user && (
          <Link href="/login" className="text-sm font-medium text-accent-text">
            Sign in
          </Link>
        )}
      </div>

      {/* Mobile bottom tab bar */}
      {user && (
        <nav
          aria-label="Mobile tabs"
          className="fixed bottom-0 inset-x-0 z-50 border-t border-border md:hidden"
          style={{
            background: "var(--surface-overlay)",
            backdropFilter: "blur(16px) saturate(1.3)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <div className="flex items-stretch justify-around px-1 pt-1.5 pb-1">
            {mobileTabs.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="flex flex-1 flex-col items-center gap-0.5 rounded-[var(--radius-md)] px-1 py-1.5 text-[10px] font-medium transition-colors"
                  style={{
                    color: active ? "var(--accent)" : "var(--text-muted)",
                    background: active ? "var(--accent-light)" : "transparent",
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* Spacer so content clears bottom tabs on mobile */}
      {user && <div className="h-16 md:hidden" aria-hidden />}
    </>
  );
}
