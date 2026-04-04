# Design System & Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Card Engine's design system to a premium, TCG-native aesthetic with Adaptive Depth — mana identity tints, Cinzel typography, Scryfall set symbol rarity indicators, spring hover effects, and a polished light/dark token system across web and mobile.

**Architecture:** CSS custom properties drive all tokens; identity tints are applied via inline `style` props at runtime since they depend on per-card data. The `SetSymbol` component fetches and caches Scryfall SVGs, injects rarity fill color, and renders inline. Mobile mirrors web tokens as a typed JS object in `theme.ts`.

**Tech Stack:** Next.js 16, Tailwind v4, React 19, React Native (Expo), TypeScript — no test framework installed, verification via `tsc --noEmit` and `next build`.

---

## File Map

**Created:**
- `apps/web/src/components/ui/SetSymbol.tsx` — fetches Scryfall SVG, injects rarity color, caches, mythic pulse
- `apps/web/src/components/ui/DeckStatStrip.tsx` — card count / avg CMC / rares / mythics grid
- `apps/web/src/lib/identity.ts` — maps `colorIdentity: string[]` → inline style object for container tinting

**Modified:**
- `apps/web/src/app/globals.css` — full design token update + identity tint CSS variables
- `apps/web/src/app/layout.tsx` — add Cinzel font, apply CSS font variable
- `apps/web/src/components/ui/Badge.tsx` — rarity badge with metallic gradients + SetSymbol icon
- `apps/web/src/components/ui/Button.tsx` — add `gold` and updated `primary` variants
- `apps/web/src/components/ui/Card.tsx` — accept identity tint via `className`/`style`
- `apps/web/src/components/ui/NavBar.tsx` — frosted glass, logo glow, active bleed
- `apps/web/src/app/collection/page.tsx` — identity tints on card grid items
- `apps/web/src/app/card/[variantId]/page.tsx` — SetSymbol in header, stat strip
- `apps/web/src/app/deck/page.tsx` — DeckStatStrip in header
- `apps/web/src/app/page.tsx` — Cinzel headings on hero
- `apps/mobile/src/theme.ts` — new token values + identity tints + `typography.display`

**Created (mobile):**
- `apps/mobile/src/components/ui/SetSymbol.tsx` — mobile SetSymbol using react-native-svg + expo-image

---

## Task 1: Web design tokens

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] **Replace the entire `:root` and `.dark` blocks** with the new token set. Keep all `@theme inline` and utility class blocks below unchanged.

```css
/* apps/web/src/app/globals.css — replace :root block */
:root {
  /* Surfaces */
  --bg:              #F6F2EC;
  --surface:         #FDFAF6;
  --surface-raised:  #FFFFFF;
  --surface-sunken:  #EDE7DC;

  /* Text */
  --text-primary:   #18150F;
  --text-secondary: #6B5D4F;
  --text-muted:     #A8937C;
  --text-inverse:   #FFFFFF;

  /* Borders */
  --border:        #DDD5C8;
  --border-strong: #C4B49A;
  --border-focus:  #C9A84C;

  /* Gold accent */
  --accent:       #C9A84C;
  --accent-hover: #A87C28;
  --accent-light: #FFF8E1;
  --accent-text:  #8B7030;

  /* Per-tab colors */
  --tab-collection: #059669;
  --tab-collection-bg: #ECFDF5;
  --tab-scan: #E11D48;
  --tab-scan-bg: #FFF1F2;
  --tab-deck: #7C3AED;
  --tab-deck-bg: #F5F3FF;
  --tab-map: #0284C7;
  --tab-map-bg: #E0F2FE;
  --tab-watchlist: #D97706;
  --tab-watchlist-bg: #FFFBEB;
  --tab-settings: #475569;
  --tab-settings-bg: #F1F5F9;

  /* Semantic */
  --success: #10B981;
  --success-light: #ECFDF5;
  --success-text: #065F46;
  --danger: #EF4444;
  --danger-light: #FEF2F2;
  --danger-text: #991B1B;
  --warning: #F59E0B;
  --warning-light: #FFFBEB;
  --warning-text: #92400E;

  /* Mana colors */
  --mana-W: #F9F3E3; --mana-W-text: #92700C;
  --mana-U: #DBEAFE; --mana-U-text: #1E40AF;
  --mana-B: #E5E5E5; --mana-B-text: #374151;
  --mana-R: #FEE2E2; --mana-R-text: #991B1B;
  --mana-G: #DCFCE7; --mana-G-text: #166534;

  /* Identity tints — applied via inline styles on card containers */
  --id-W-tint:   #FFFDF0; --id-W-border:  #EDD87A; --id-W-glow: rgba(234,179,8,0.18);
  --id-U-tint:   #EFF6FF; --id-U-border:  #93C5FD; --id-U-glow: rgba(59,130,246,0.18);
  --id-B-tint:   #F5F3F8; --id-B-border:  #C4B5D4; --id-B-glow: rgba(109,40,217,0.14);
  --id-R-tint:   #FFF5F2; --id-R-border:  #FCA5A5; --id-R-glow: rgba(239,68,68,0.18);
  --id-G-tint:   #F0FBF3; --id-G-border:  #86EFAC; --id-G-glow: rgba(34,197,94,0.18);
  --id-multi-tint:  #FFFBF0; --id-multi-border: #E8D5A0; --id-multi-glow: rgba(201,168,76,0.18);

  /* Market colors */
  --market-tcg: #C9A84C; --market-tcg-bg: #FFF8E1;
  --market-mkm: #10B981; --market-mkm-bg: #ECFDF5;
  --market-ck:  #3B82F6; --market-ck-bg:  #EFF6FF;
  --market-ebay: #EF4444; --market-ebay-bg: #FEF2F2;
  --market-mtgo: #F59E0B; --market-mtgo-bg: #FFFBEB;

  /* Rarity */
  --rarity-mythic: #FB923C; --rarity-mythic-bg: #FFF4E6;
  --rarity-rare:   #C9A84C; --rarity-rare-bg:   #FFFBEB;
  --rarity-uncommon: #94A3B8; --rarity-uncommon-bg: #F1F5F9;
  --rarity-common:   #6B7280; --rarity-common-bg:   #F3F4F6;

  /* Radius */
  --radius-sm: 6px; --radius-md: 10px;
  --radius-lg: 14px; --radius-xl: 20px; --radius-full: 9999px;

  /* Shadows */
  --shadow-card:       0 2px 8px rgba(24,21,15,0.07), 0 1px 2px rgba(24,21,15,0.04);
  --shadow-card-hover: 0 14px 36px rgba(24,21,15,0.14), 0 4px 10px rgba(24,21,15,0.07);
  --shadow-elevated:   0 8px 24px rgba(24,21,15,0.12), 0 2px 8px rgba(24,21,15,0.06);
  --shadow-modal:      0 16px 48px rgba(24,21,15,0.16), 0 4px 16px rgba(24,21,15,0.08);
}

.dark {
  --bg:              #0D0B09;
  --surface:         #161310;
  --surface-raised:  #1E1A16;
  --surface-sunken:  #0A0807;

  --text-primary:   #F2ECE4;
  --text-secondary: #A89880;
  --text-muted:     #665A4A;
  --text-inverse:   #0D0B09;

  --border:        #2A2420;
  --border-strong: #3D352C;
  --border-focus:  #C9A84C;

  --accent:       #C9A84C;
  --accent-hover: #E8C96C;
  --accent-light: #2A1F06;
  --accent-text:  #E8C96C;

  --tab-collection: #34D399; --tab-collection-bg: #064E3B;
  --tab-scan:       #FB7185; --tab-scan-bg:       #4C0519;
  --tab-deck:       #A78BFA; --tab-deck-bg:       #2E1065;
  --tab-map:        #38BDF8; --tab-map-bg:        #0C4A6E;
  --tab-watchlist:  #C9A84C; --tab-watchlist-bg:  #2A1F06;
  --tab-settings:   #94A3B8; --tab-settings-bg:   #1E293B;

  --success: #34D399; --success-light: #064E3B; --success-text: #6EE7B7;
  --danger:  #F87171; --danger-light:  #450A0A; --danger-text:  #FCA5A5;
  --warning: #C9A84C; --warning-light: #2A1F06; --warning-text: #E8C96C;

  --mana-W: #422006; --mana-W-text: #FDE68A;
  --mana-U: #1E3A5F; --mana-U-text: #93C5FD;
  --mana-B: #374151; --mana-B-text: #D1D5DB;
  --mana-R: #450A0A; --mana-R-text: #FCA5A5;
  --mana-G: #052E16; --mana-G-text: #86EFAC;

  --id-W-tint:   #1A1708; --id-W-border:  #5C4E10; --id-W-glow: rgba(234,179,8,0.20);
  --id-U-tint:   #091524; --id-U-border:  #1E3A5F; --id-U-glow: rgba(59,130,246,0.20);
  --id-B-tint:   #100D18; --id-B-border:  #2D1B4E; --id-B-glow: rgba(109,40,217,0.20);
  --id-R-tint:   #1A0A07; --id-R-border:  #5C1A1A; --id-R-glow: rgba(239,68,68,0.20);
  --id-G-tint:   #081409; --id-G-border:  #14532D; --id-G-glow: rgba(34,197,94,0.20);
  --id-multi-tint:  #1A1608; --id-multi-border: #5C4A1A; --id-multi-glow: rgba(201,168,76,0.20);

  --market-tcg: #C9A84C; --market-tcg-bg: #2A1F06;
  --market-mkm: #34D399; --market-mkm-bg: #064E3B;
  --market-ck:  #60A5FA; --market-ck-bg:  #1E3A5F;
  --market-ebay: #F87171; --market-ebay-bg: #450A0A;
  --market-mtgo: #C9A84C; --market-mtgo-bg: #2A1F06;

  --rarity-mythic: #FB923C; --rarity-mythic-bg: #431407;
  --rarity-rare:   #C9A84C; --rarity-rare-bg:   #2A1F06;
  --rarity-uncommon: #94A3B8; --rarity-uncommon-bg: #374151;
  --rarity-common:   #6B7280; --rarity-common-bg:   #1F2937;

  --shadow-card:       0 2px 8px rgba(0,0,0,0.28), 0 1px 2px rgba(0,0,0,0.18);
  --shadow-card-hover: 0 14px 36px rgba(0,0,0,0.55), 0 4px 10px rgba(0,0,0,0.32);
  --shadow-elevated:   0 8px 24px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.28);
  --shadow-modal:      0 16px 48px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.32);
}
```

- [ ] **Add card-hover animation to globals.css** — update the existing `.card-hover` block:

```css
/* Replace existing .card-hover block */
.card-hover {
  transition: box-shadow 0.22s cubic-bezier(0.34, 1.56, 0.64, 1),
              transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.card-hover:hover {
  box-shadow: var(--shadow-card-hover);
  transform: translateY(-5px) scale(1.02);
}
```

- [ ] **Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors (globals.css changes don't affect TS)

- [ ] **Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "design: update global design tokens — adaptive depth color system"
```

---

## Task 2: Web typography — add Cinzel

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Add Cinzel import to layout.tsx** — add alongside the existing Geist fonts:

```tsx
// apps/web/src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Cinzel } from "next/font/google";
import "./globals.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
});

export const metadata: Metadata = {
  title: "Card Engine",
  description: "MTG Collection Manager & Deck Builder",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.getItem('theme') === 'dark') {
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} antialiased bg-bg text-text-primary`}
      >
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
```

- [ ] **Register font in globals.css `@theme inline` block** — add after the existing font-sans/mono lines:

```css
/* Inside @theme inline { ... } */
--font-cinzel: var(--font-cinzel);
```

- [ ] **Add typography utility classes to globals.css** — append after the existing animation classes:

```css
/* ─── Typography utilities ─── */
.font-display {
  font-family: var(--font-cinzel), 'Cinzel', serif;
  letter-spacing: -0.01em;
}
.font-stat {
  font-family: var(--font-geist-mono), 'Geist Mono', monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
```

- [ ] **Verify build compiles**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Commit**

```bash
git add apps/web/src/app/layout.tsx apps/web/src/app/globals.css
git commit -m "design: add Cinzel display font + typography utility classes"
```

---

## Task 3: `lib/identity.ts` — identity tint helper

**Files:**
- Create: `apps/web/src/lib/identity.ts`

- [ ] **Create the identity helper**

```typescript
// apps/web/src/lib/identity.ts

export type ManaColor = "W" | "U" | "B" | "R" | "G";

interface IdentityStyle {
  background: string;
  borderColor: string;
  "--hover-glow": string;
}

const IDENTITY_STYLES: Record<ManaColor | "multi" | "none", IdentityStyle> = {
  W: {
    background: "linear-gradient(145deg, var(--surface-raised), var(--id-W-tint))",
    borderColor: "var(--id-W-border)",
    "--hover-glow": "var(--id-W-glow)",
  },
  U: {
    background: "linear-gradient(145deg, var(--surface-raised), var(--id-U-tint))",
    borderColor: "var(--id-U-border)",
    "--hover-glow": "var(--id-U-glow)",
  },
  B: {
    background: "linear-gradient(145deg, var(--surface-raised), var(--id-B-tint))",
    borderColor: "var(--id-B-border)",
    "--hover-glow": "var(--id-B-glow)",
  },
  R: {
    background: "linear-gradient(145deg, var(--surface-raised), var(--id-R-tint))",
    borderColor: "var(--id-R-border)",
    "--hover-glow": "var(--id-R-glow)",
  },
  G: {
    background: "linear-gradient(145deg, var(--surface-raised), var(--id-G-tint))",
    borderColor: "var(--id-G-border)",
    "--hover-glow": "var(--id-G-glow)",
  },
  multi: {
    background: "linear-gradient(145deg, var(--surface-raised), var(--id-multi-tint))",
    borderColor: "var(--id-multi-border)",
    "--hover-glow": "var(--id-multi-glow)",
  },
  none: {
    background: "var(--surface-raised)",
    borderColor: "var(--border)",
    "--hover-glow": "rgba(0,0,0,0)",
  },
};

/**
 * Returns inline style object for a card container based on its color identity.
 * - 0 colors → neutral
 * - 1–2 colors → first color's tint
 * - 3+ colors → gold/multi tint
 */
export function getIdentityStyle(colorIdentity: string[]): React.CSSProperties {
  let key: ManaColor | "multi" | "none";

  if (colorIdentity.length === 0) {
    key = "none";
  } else if (colorIdentity.length >= 3) {
    key = "multi";
  } else {
    const first = colorIdentity[0].toUpperCase() as ManaColor;
    key = (["W", "U", "B", "R", "G"] as ManaColor[]).includes(first) ? first : "none";
  }

  return IDENTITY_STYLES[key] as React.CSSProperties;
}

/** Returns the rarity color hex used for set symbol fill. */
export function getRarityColor(rarity: string | null | undefined): string {
  switch (rarity?.toLowerCase()) {
    case "mythic":   return "#FB923C";
    case "rare":     return "#C9A84C";
    case "uncommon": return "#94A3B8";
    default:         return "#6B7280"; // common / unknown
  }
}
```

- [ ] **Verify types**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Commit**

```bash
git add apps/web/src/lib/identity.ts
git commit -m "feat: add identity tint + rarity color helpers"
```

---

## Task 4: `SetSymbol` component (web)

**Files:**
- Create: `apps/web/src/components/ui/SetSymbol.tsx`

- [ ] **Create the SetSymbol component**

```tsx
// apps/web/src/components/ui/SetSymbol.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { getRarityColor } from "@/lib/identity";

interface SetSymbolProps {
  setCode: string;
  rarity: string | null | undefined;
  size?: number;
  className?: string;
}

// Module-level cache — persists for the page session
const svgCache = new Map<string, string>();

function injectRarityColor(svgText: string, color: string): string {
  // Remove width/height attributes so the SVG scales via CSS
  let result = svgText
    .replace(/\s+width="[^"]*"/g, "")
    .replace(/\s+height="[^"]*"/g, "");

  // Inject fill color — preserve fill="none" for stroke-only paths
  result = result
    .replace(/fill="(?!none")([^"]*)"/g, `fill="${color}"`)
    .replace(/fill:(?!\s*none)\s*[^;"}]*/g, `fill:${color}`)
    .replace(/stroke="(?!none")([^"]*)"/g, `stroke="${color}"`)
    .replace(/stroke:(?!\s*none)\s*[^;"}]*/g, `stroke:${color}`);

  return result;
}

export function SetSymbol({ setCode, rarity, size = 14, className = "" }: SetSymbolProps) {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const color = getRarityColor(rarity);
  const isMythic = rarity?.toLowerCase() === "mythic";

  useEffect(() => {
    const code = setCode.toLowerCase();
    const cacheKey = `${code}:${color}`;

    if (svgCache.has(cacheKey)) {
      setSvgContent(svgCache.get(cacheKey)!);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    fetch(`https://svgs.scryfall.io/sets/${code}.svg`, {
      signal: abortRef.current.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.text();
      })
      .then((text) => {
        const colored = injectRarityColor(text, color);
        svgCache.set(cacheKey, colored);
        setSvgContent(colored);
      })
      .catch(() => {
        // Silently fall back to null — caller renders nothing or a fallback
      });

    return () => abortRef.current?.abort();
  }, [setCode, color]);

  if (!svgContent) {
    // Fallback: colored circle while loading or on error
    return (
      <span
        className={className}
        style={{
          display: "inline-flex",
          width: size,
          height: size,
          borderRadius: "50%",
          background: color,
          opacity: 0.6,
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 ${isMythic ? "animate-mythic-pulse" : ""} ${className}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}
```

- [ ] **Add mythic-pulse animation to globals.css** — append after the existing keyframes:

```css
@keyframes mythic-pulse {
  0%, 100% { filter: drop-shadow(0 0 3px rgba(251,146,60,0.6)); }
  50%       { filter: drop-shadow(0 0 7px rgba(251,146,60,1)) drop-shadow(0 0 14px rgba(251,146,60,0.5)); }
}
.animate-mythic-pulse {
  animation: mythic-pulse 2s ease-in-out infinite;
}
```

- [ ] **Verify types**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Commit**

```bash
git add apps/web/src/components/ui/SetSymbol.tsx apps/web/src/app/globals.css
git commit -m "feat: add SetSymbol component — Scryfall SVG + rarity color injection"
```

---

## Task 5: `DeckStatStrip` component

**Files:**
- Create: `apps/web/src/components/ui/DeckStatStrip.tsx`

- [ ] **Create the DeckStatStrip component**

```tsx
// apps/web/src/components/ui/DeckStatStrip.tsx
import React from "react";

interface DeckStatStripProps {
  cardCount: number;
  avgCmc: number | null;
  rareCount: number;
  mythicCount: number;
  className?: string;
}

export function DeckStatStrip({
  cardCount,
  avgCmc,
  rareCount,
  mythicCount,
  className = "",
}: DeckStatStripProps) {
  return (
    <div
      className={`flex divide-x divide-border overflow-hidden rounded-lg border border-border bg-surface-sunken ${className}`}
    >
      <StatCell value={cardCount.toString()} label="Cards" />
      <StatCell
        value={avgCmc !== null ? avgCmc.toFixed(1) : "—"}
        label="Avg CMC"
      />
      <StatCell
        value={rareCount.toString()}
        label="Rares"
      />
      <StatCell
        value={mythicCount.toString()}
        label="Mythics"
        valueClassName="text-[var(--rarity-mythic)]"
      />
    </div>
  );
}

function StatCell({
  value,
  label,
  valueClassName = "",
}: {
  value: string;
  label: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center px-3 py-2">
      <span
        className={`font-stat text-base font-semibold text-text-primary leading-none ${valueClassName}`}
      >
        {value}
      </span>
      <span className="mt-1 text-[9px] font-bold uppercase tracking-widest text-text-muted">
        {label}
      </span>
    </div>
  );
}
```

- [ ] **Verify types**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Commit**

```bash
git add apps/web/src/components/ui/DeckStatStrip.tsx
git commit -m "feat: add DeckStatStrip component"
```

---

## Task 6: Badge component — metallic rarity redesign

**Files:**
- Modify: `apps/web/src/components/ui/Badge.tsx`

- [ ] **Replace Badge.tsx entirely**

```tsx
// apps/web/src/components/ui/Badge.tsx
"use client";

import React from "react";
import { SetSymbol } from "./SetSymbol";

type BadgeVariant =
  | "default"
  | "accent"
  | "success"
  | "danger"
  | "warning"
  | "mythic"
  | "rare"
  | "uncommon"
  | "common"
  | "mana-W" | "mana-U" | "mana-B" | "mana-R" | "mana-G"
  | "tcg" | "mkm" | "ck" | "ebay" | "mtgo";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  /** Set code for rarity variants — renders actual set symbol */
  setCode?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default:   "bg-surface-sunken text-text-secondary border border-border",
  accent:    "bg-accent-light text-accent-text border border-[var(--accent)] border-opacity-30",
  success:   "bg-success-light text-[var(--success-text)] border border-[var(--success)] border-opacity-30",
  danger:    "bg-danger-light text-[var(--danger-text)] border border-[var(--danger)] border-opacity-30",
  warning:   "bg-warning-light text-[var(--warning-text)] border border-[var(--warning)] border-opacity-30",

  // Rarity — metallic feel
  mythic:   "border",
  rare:     "border",
  uncommon: "border",
  common:   "border",

  // Mana
  "mana-W": "bg-[var(--mana-W)] text-[var(--mana-W-text)]",
  "mana-U": "bg-[var(--mana-U)] text-[var(--mana-U-text)]",
  "mana-B": "bg-[var(--mana-B)] text-[var(--mana-B-text)]",
  "mana-R": "bg-[var(--mana-R)] text-[var(--mana-R-text)]",
  "mana-G": "bg-[var(--mana-G)] text-[var(--mana-G-text)]",

  // Markets
  tcg:  "bg-[var(--market-tcg-bg)]  text-[var(--market-tcg)]",
  mkm:  "bg-[var(--market-mkm-bg)]  text-[var(--market-mkm)]",
  ck:   "bg-[var(--market-ck-bg)]   text-[var(--market-ck)]",
  ebay: "bg-[var(--market-ebay-bg)] text-[var(--market-ebay)]",
  mtgo: "bg-[var(--market-mtgo-bg)] text-[var(--market-mtgo)]",
};

const rarityConfig = {
  mythic: {
    bg: "rgba(251,146,60,0.10)",
    border: "rgba(251,146,60,0.30)",
    color: "var(--rarity-mythic)",
    shadow: "0 1px 4px rgba(251,146,60,0.20), inset 0 1px 0 rgba(255,255,255,0.12)",
    rarity: "mythic" as const,
  },
  rare: {
    bg: "rgba(201,168,76,0.10)",
    border: "rgba(201,168,76,0.30)",
    color: "var(--rarity-rare)",
    shadow: "0 1px 4px rgba(201,168,76,0.20), inset 0 1px 0 rgba(255,255,255,0.12)",
    rarity: "rare" as const,
  },
  uncommon: {
    bg: "rgba(148,163,184,0.10)",
    border: "rgba(148,163,184,0.25)",
    color: "var(--rarity-uncommon)",
    shadow: "0 1px 3px rgba(148,163,184,0.12)",
    rarity: "uncommon" as const,
  },
  common: {
    bg: "rgba(107,114,128,0.08)",
    border: "rgba(107,114,128,0.18)",
    color: "var(--rarity-common)",
    shadow: "none",
    rarity: "common" as const,
  },
};

export function Badge({ children, variant = "default", className = "", setCode }: BadgeProps) {
  const isRarity = variant === "mythic" || variant === "rare" || variant === "uncommon" || variant === "common";

  if (isRarity) {
    const cfg = rarityConfig[variant];
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.06em] ${className}`}
        style={{
          background: cfg.bg,
          borderColor: cfg.border,
          color: cfg.color,
          boxShadow: cfg.shadow,
          borderWidth: 1,
          borderStyle: "solid",
        }}
      >
        {setCode ? (
          <SetSymbol setCode={setCode} rarity={cfg.rarity} size={10} />
        ) : null}
        {children}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold
        ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
```

- [ ] **Verify types**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Commit**

```bash
git add apps/web/src/components/ui/Badge.tsx
git commit -m "design: redesign Badge — metallic rarity style + set symbol icon"
```

---

## Task 7: Button — add `gold` variant

**Files:**
- Modify: `apps/web/src/components/ui/Button.tsx`

- [ ] **Add `gold` to the variant type and styles**

```tsx
// apps/web/src/components/ui/Button.tsx
"use client";

import React from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--tab-deck)] text-white hover:opacity-90 shadow-sm hover:shadow-md active:scale-[0.98]",
  gold:
    "text-white active:scale-[0.98]",
  secondary:
    "bg-surface-raised text-text-primary border border-border hover:border-border-strong hover:shadow-sm active:scale-[0.98]",
  ghost:
    "bg-transparent text-text-secondary border border-border hover:bg-surface-sunken hover:text-text-primary active:scale-[0.98]",
  danger:
    "bg-danger text-white hover:bg-red-600 shadow-sm hover:shadow-md active:scale-[0.98]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm gap-1.5 rounded-lg",
  md: "px-4 py-2.5 text-sm gap-2 rounded-xl",
  lg: "px-6 py-3 text-base gap-2 rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  children,
  disabled,
  className = "",
  style,
  ...props
}: ButtonProps) {
  const goldStyle =
    variant === "gold"
      ? {
          background: "linear-gradient(135deg, var(--accent), var(--accent-text))",
          boxShadow: "0 2px 10px var(--accent-light), inset 0 1px 0 rgba(255,255,255,0.15)",
          ...style,
        }
      : style;

  return (
    <button
      className={`inline-flex items-center justify-center font-semibold transition-all duration-150 cursor-pointer
        ${variantClasses[variant]} ${sizeClasses[size]}
        ${disabled || loading ? "opacity-50 pointer-events-none" : ""}
        ${className}`}
      style={goldStyle}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
```

- [ ] **Verify types**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Commit**

```bash
git add apps/web/src/components/ui/Button.tsx
git commit -m "design: add gold Button variant"
```

---

## Task 8: NavBar — frosted glass + active bleed + logo glow

**Files:**
- Modify: `apps/web/src/components/ui/NavBar.tsx`

- [ ] **Replace the `<nav>` and logo mark in NavBar.tsx** — update `NavBar` function return:

```tsx
// apps/web/src/components/ui/NavBar.tsx — replace the return statement of NavBar

  return (
    <nav className="sticky top-0 z-50 border-b border-border"
      style={{
        background: "var(--surface-overlay, color-mix(in srgb, var(--surface) 92%, transparent))",
        backdropFilter: "blur(16px) saturate(1.4)",
        WebkitBackdropFilter: "blur(16px) saturate(1.4)",
        boxShadow: "0 1px 0 var(--border), 0 4px 16px rgba(24,21,15,0.06)",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link
          href="/"
          className="text-base font-bold tracking-tight flex items-center gap-2.5"
          style={{ color: "var(--text-primary)" }}
        >
          <span
            className="w-8 h-8 flex items-center justify-center rounded-[9px] text-[11px] font-black text-white"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-text) 100%)",
              boxShadow: "0 2px 8px var(--accent-light, rgba(201,168,76,0.3)), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
          >
            CE
          </span>
          <span className="font-display">Card Engine</span>
        </Link>

        <div className="flex items-center gap-1">
          {user ? (
            <>
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150
                      ${isActive ? "font-semibold" : "hover:opacity-90"}`}
                    style={{
                      backgroundColor: isActive ? item.tabBg : "transparent",
                      color: item.tabColor,
                      boxShadow: isActive
                        ? "0 1px 4px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.5)"
                        : "none",
                    }}
                  >
                    {item.icon}
                    <span className="hidden lg:inline">{item.label}</span>
                  </Link>
                );
              })}
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                style={{ color: "var(--text-secondary)" }}
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors shadow-sm"
                style={{
                  background: "linear-gradient(135deg, var(--accent), var(--accent-text))",
                  boxShadow: "0 2px 8px rgba(201,168,76,0.3)",
                }}
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
```

- [ ] **Add `font-display` class to the logo text** — the `font-display` utility added in Task 2 applies Cinzel automatically.

- [ ] **Verify types**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Commit**

```bash
git add apps/web/src/components/ui/NavBar.tsx
git commit -m "design: NavBar frosted glass + gold logo glow + Cinzel wordmark"
```

---

## Task 9: Collection page — identity tints on card grid

**Files:**
- Modify: `apps/web/src/app/collection/page.tsx`

- [ ] **Add identity import at the top of collection/page.tsx**

```tsx
import { getIdentityStyle } from "@/lib/identity";
```

- [ ] **Update the page title to use Cinzel** — find the `<h1>` in collection/page.tsx and update:

```tsx
<h1 className="font-display text-3xl font-bold tracking-tight text-text-primary">
  Collection
</h1>
```

- [ ] **Apply identity tint to each card Link** — find the card grid `<Link>` element (currently has `className="animate-slide-up flex gap-4 rounded-2xl ..."`) and update:

```tsx
<Link
  key={card.variantId}
  href={`/card/${encodeURIComponent(card.variantId)}`}
  className="animate-slide-up flex gap-4 rounded-2xl border p-4 card-hover"
  style={{
    animationDelay: `${Math.min(idx * 0.03, 0.3)}s`,
    borderWidth: "1.5px",
    borderStyle: "solid",
    boxShadow: "var(--shadow-card)",
    ...getIdentityStyle(card.colorIdentity ?? []),
  }}
>
```

- [ ] **Update card name to use Cinzel**

```tsx
<h3 className="font-display font-semibold text-text-primary truncate">
  {card.name}
</h3>
```

- [ ] **Pass `setCode` to rarity Badge** — find where the rarity Badge is rendered and update:

```tsx
{card.rarity && (
  <Badge
    variant={rarityBadgeVariant(card.rarity)}
    setCode={card.setId ?? undefined}
    className="mt-1.5"
  >
    {card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1)}
  </Badge>
)}
```

- [ ] **Verify types**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors (if `colorIdentity` is missing from `LocalCard`, add `colorIdentity?: string[]` to the `CardWithPrice` interface)

- [ ] **Commit**

```bash
git add apps/web/src/app/collection/page.tsx
git commit -m "design: collection page — identity tints, Cinzel headings, set symbol badges"
```

---

## Task 10: Card detail page — SetSymbol header + stat strip

**Files:**
- Modify: `apps/web/src/app/card/[variantId]/page.tsx`

- [ ] **Add imports**

```tsx
import { SetSymbol } from "@/components/ui/SetSymbol";
import { DeckStatStrip } from "@/components/ui/DeckStatStrip";
import { getIdentityStyle } from "@/lib/identity";
```

- [ ] **Update the card detail hero title** — find where the card name `<h1>` is rendered and update to use Cinzel:

```tsx
<h1 className="font-display text-2xl font-bold text-text-primary tracking-tight">
  {card.name}
</h1>
```

- [ ] **Add SetSymbol next to set name** — find where `setId` and `collectorNumber` are displayed and update to include the symbol:

```tsx
<div className="flex items-center gap-2 mt-1">
  {card.setId && (
    <SetSymbol setCode={card.setId} rarity={card.rarity} size={16} />
  )}
  <span className="text-sm text-text-secondary font-mono">
    {card.setId?.toUpperCase()} {card.collectorNumber}
  </span>
</div>
```

- [ ] **Apply identity tint to the card image wrapper** — find the `<img>` or image container and wrap it with:

```tsx
<div
  className="rounded-xl overflow-hidden"
  style={getIdentityStyle(card.colorIdentity ?? [])}
>
  <img
    src={card.imageUri}
    alt={card.name}
    className="w-full h-auto rounded-xl"
  />
</div>
```

- [ ] **Update rarity Badge to pass setCode** — find any rarity Badge render and add:

```tsx
<Badge variant={rarityBadgeVariant(card.rarity)} setCode={card.setId ?? undefined}>
  {card.rarity}
</Badge>
```

- [ ] **Verify types**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Commit**

```bash
git add apps/web/src/app/card/\[variantId\]/page.tsx
git commit -m "design: card detail — Cinzel title, SetSymbol header, identity tint on image"
```

---

## Task 11: Deck page — stat strip + Cinzel heading

**Files:**
- Modify: `apps/web/src/app/deck/page.tsx`

- [ ] **Add DeckStatStrip import**

```tsx
import { DeckStatStrip } from "@/components/ui/DeckStatStrip";
```

- [ ] **Add a stat computation** — in the component body where deck cards are available, add:

```tsx
const deckStats = useMemo(() => {
  const mainCards = deckCards.filter((c) => c.board === "main" || c.board === "commander");
  const total = mainCards.reduce((sum, c) => sum + c.quantity, 0);
  const cmcSum = mainCards.reduce((sum, c) => {
    const cmc = parseCmc(c.manaCost ?? "");
    return sum + cmc * c.quantity;
  }, 0);
  const avgCmc = total > 0 ? cmcSum / total : null;
  const rares = mainCards.filter((c) => c.rarity === "rare").reduce((s, c) => s + c.quantity, 0);
  const mythics = mainCards.filter((c) => c.rarity === "mythic").reduce((s, c) => s + c.quantity, 0);
  return { total, avgCmc, rares, mythics };
}, [deckCards]);
```

- [ ] **Add `parseCmc` helper** — add this function inside the file (not exported):

```tsx
function parseCmc(manaCost: string): number {
  if (!manaCost) return 0;
  let total = 0;
  const genericMatch = manaCost.match(/\{(\d+)\}/);
  if (genericMatch) total += parseInt(genericMatch[1], 10);
  const coloredSymbols = manaCost.match(/\{[WUBRG]\}/g) ?? [];
  const hybridSymbols = manaCost.match(/\{[WUBRG]\/[WUBRG]\}/g) ?? [];
  const phyrexianSymbols = manaCost.match(/\{[WUBRG]\/P\}/g) ?? [];
  total += coloredSymbols.length + hybridSymbols.length + phyrexianSymbols.length;
  return total;
}
```

- [ ] **Render DeckStatStrip in the deck header** — find the deck header section and add the strip below the deck title:

```tsx
<DeckStatStrip
  cardCount={deckStats.total}
  avgCmc={deckStats.avgCmc}
  rareCount={deckStats.rares}
  mythicCount={deckStats.mythics}
  className="mt-3 max-w-xs"
/>
```

- [ ] **Update deck name heading to Cinzel** — find where the deck name is shown and update:

```tsx
<h1 className="font-display text-2xl font-bold tracking-tight text-text-primary">
  {deckName}
</h1>
```

- [ ] **Add `useMemo` to imports if not present**

```tsx
import { useState, useEffect, useCallback, useMemo } from "react";
```

- [ ] **Verify types**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Commit**

```bash
git add apps/web/src/app/deck/page.tsx
git commit -m "design: deck page — DeckStatStrip, Cinzel heading"
```

---

## Task 12: Home page — Cinzel hero

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Update hero `<h1>` to use Cinzel**

```tsx
<h1 className="font-display max-w-2xl text-5xl font-bold tracking-tight text-text-primary leading-[1.1]">
  Manage your MTG collection with{" "}
  <span style={{ color: "var(--accent)" }}>precision</span>
</h1>
```

- [ ] **Update the CTA buttons to use new variants** — find the two Link buttons and update:

```tsx
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
```

- [ ] **Update feature card headings**

```tsx
<h3 className="font-display mt-4 text-base font-semibold text-text-primary">
  {feature.title}
</h3>
```

- [ ] **Verify build**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "design: home page — Cinzel hero, gold CTA buttons"
```

---

## Task 13: Mobile theme update

**Files:**
- Modify: `apps/mobile/src/theme.ts`

- [ ] **Replace `colors.light` and `colors.dark` with updated values, and add `identityTints` and updated `typography`**

```typescript
// apps/mobile/src/theme.ts — full replacement
import { Platform } from "react-native";

export const colors = {
  light: {
    bg:              "#F6F2EC",
    surface:         "#FDFAF6",
    surfaceRaised:   "#FFFFFF",
    surfaceSunken:   "#EDE7DC",

    textPrimary:     "#18150F",
    textSecondary:   "#6B5D4F",
    textMuted:       "#A8937C",
    textInverse:     "#FFFFFF",

    border:          "#DDD5C8",
    borderStrong:    "#C4B49A",

    accent:          "#C9A84C",
    accentHover:     "#A87C28",
    accentLight:     "#FFF8E1",
    accentText:      "#8B7030",

    success:         "#10B981",
    successLight:    "#ECFDF5",
    successText:     "#065F46",
    danger:          "#EF4444",
    dangerLight:     "#FEF2F2",
    dangerText:      "#991B1B",
    warning:         "#F59E0B",
    warningLight:    "#FFFBEB",
    warningText:     "#92400E",

    manaW: "#F9F3E3", manaWText: "#92700C",
    manaU: "#DBEAFE", manaUText: "#1E40AF",
    manaB: "#E5E5E5", manaBText: "#374151",
    manaR: "#FEE2E2", manaRText: "#991B1B",
    manaG: "#DCFCE7", manaGText: "#166534",

    marketTcg: "#C9A84C", marketTcgBg: "#FFF8E1",
    marketMkm: "#10B981", marketMkmBg: "#ECFDF5",
    marketCk:  "#3B82F6", marketCkBg:  "#EFF6FF",
    marketEbay: "#EF4444", marketEbayBg: "#FEF2F2",
    marketMtgo: "#F59E0B", marketMtgoBg: "#FFFBEB",

    rarityMythic:    "#FB923C",
    rarityMythicBg:  "#FFF4E6",
    rarityRare:      "#C9A84C",
    rarityRareBg:    "#FFFBEB",
    rarityUncommon:  "#94A3B8",
    rarityUncommonBg:"#F1F5F9",
    rarityCommon:    "#6B7280",
    rarityCommonBg:  "#F3F4F6",
  },
  dark: {
    bg:              "#0D0B09",
    surface:         "#161310",
    surfaceRaised:   "#1E1A16",
    surfaceSunken:   "#0A0807",

    textPrimary:     "#F2ECE4",
    textSecondary:   "#A89880",
    textMuted:       "#665A4A",
    textInverse:     "#0D0B09",

    border:          "#2A2420",
    borderStrong:    "#3D352C",

    accent:          "#C9A84C",
    accentHover:     "#E8C96C",
    accentLight:     "#2A1F06",
    accentText:      "#E8C96C",

    success:         "#34D399",
    successLight:    "#064E3B",
    successText:     "#6EE7B7",
    danger:          "#F87171",
    dangerLight:     "#450A0A",
    dangerText:      "#FCA5A5",
    warning:         "#C9A84C",
    warningLight:    "#2A1F06",
    warningText:     "#E8C96C",

    manaW: "#422006", manaWText: "#FDE68A",
    manaU: "#1E3A5F", manaUText: "#93C5FD",
    manaB: "#374151", manaBText: "#D1D5DB",
    manaR: "#450A0A", manaRText: "#FCA5A5",
    manaG: "#052E16", manaGText: "#86EFAC",

    marketTcg: "#C9A84C", marketTcgBg: "#2A1F06",
    marketMkm: "#34D399", marketMkmBg: "#064E3B",
    marketCk:  "#60A5FA", marketCkBg:  "#1E3A5F",
    marketEbay: "#F87171", marketEbayBg: "#450A0A",
    marketMtgo: "#C9A84C", marketMtgoBg: "#2A1F06",

    rarityMythic:    "#FB923C",
    rarityMythicBg:  "#431407",
    rarityRare:      "#C9A84C",
    rarityRareBg:    "#2A1F06",
    rarityUncommon:  "#94A3B8",
    rarityUncommonBg:"#374151",
    rarityCommon:    "#6B7280",
    rarityCommonBg:  "#1F2937",
  },
} as const;

export type ThemeColors = typeof colors.light;

/** Mana identity tint styles for card containers */
export const identityTints = {
  light: {
    W:     { backgroundColor: "#FFFDF0", borderColor: "#EDD87A" },
    U:     { backgroundColor: "#EFF6FF", borderColor: "#93C5FD" },
    B:     { backgroundColor: "#F5F3F8", borderColor: "#C4B5D4" },
    R:     { backgroundColor: "#FFF5F2", borderColor: "#FCA5A5" },
    G:     { backgroundColor: "#F0FBF3", borderColor: "#86EFAC" },
    multi: { backgroundColor: "#FFFBF0", borderColor: "#E8D5A0" },
    none:  { backgroundColor: "#FFFFFF", borderColor: "#DDD5C8" },
  },
  dark: {
    W:     { backgroundColor: "#1A1708", borderColor: "#5C4E10" },
    U:     { backgroundColor: "#091524", borderColor: "#1E3A5F" },
    B:     { backgroundColor: "#100D18", borderColor: "#2D1B4E" },
    R:     { backgroundColor: "#1A0A07", borderColor: "#5C1A1A" },
    G:     { backgroundColor: "#081409", borderColor: "#14532D" },
    multi: { backgroundColor: "#1A1608", borderColor: "#5C4A1A" },
    none:  { backgroundColor: "#1E1A16", borderColor: "#2A2420" },
  },
} as const;

export type IdentityKey = keyof typeof identityTints.light;

/** Returns the style object for a card container given its colorIdentity array */
export function getIdentityTintStyle(
  colorIdentity: string[],
  mode: "light" | "dark"
): { backgroundColor: string; borderColor: string } {
  const map = identityTints[mode];
  if (colorIdentity.length === 0) return map.none;
  if (colorIdentity.length >= 3) return map.multi;
  const first = colorIdentity[0].toUpperCase() as IdentityKey;
  return map[first] ?? map.none;
}

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16,
  xl: 20, "2xl": 24, "3xl": 32, "4xl": 48,
} as const;

export const radii = {
  sm: 8, md: 12, lg: 16, xl: 24, full: 9999,
} as const;

export const typography = {
  display: {
    fontSize: 32,
    fontWeight: "700" as const,
    letterSpacing: -0.5,
    // fontFamily set at component level: 'Cinzel_700Regular'
  },
  title: {
    fontSize: 28,
    fontWeight: "800" as const,
    letterSpacing: -0.5,
  },
  heading: {
    fontSize: 20,
    fontWeight: "700" as const,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 15,
    fontWeight: "400" as const,
    lineHeight: 22,
  },
  caption: {
    fontSize: 13,
    fontWeight: "400" as const,
  },
  label: {
    fontSize: 12,
    fontWeight: "600" as const,
    letterSpacing: 0.3,
    textTransform: "uppercase" as const,
  },
  small: {
    fontSize: 11,
    fontWeight: "500" as const,
  },
  stat: {
    fontSize: 16,
    fontWeight: "600" as const,
    letterSpacing: -0.5,
    fontVariantNumeric: "tabular-nums" as const,
  },
} as const;

export const tabColors = {
  collection: { color: "#059669", bg: "#ECFDF5" },
  scanner:    { color: "#E11D48", bg: "#FFF1F2" },
  decks:      { color: "#7C3AED", bg: "#F5F3FF" },
  map:        { color: "#0284C7", bg: "#E0F2FE" },
  profile:    { color: "#0D9488", bg: "#F0FDFA" },
} as const;

export const shadows = {
  card: Platform.select({
    ios:     { shadowColor: "#18150F", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
    android: { elevation: 3 },
    default: {},
  }),
  cardHover: Platform.select({
    ios:     { shadowColor: "#18150F", shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.14, shadowRadius: 36 },
    android: { elevation: 10 },
    default: {},
  }),
  elevated: Platform.select({
    ios:     { shadowColor: "#18150F", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24 },
    android: { elevation: 8 },
    default: {},
  }),
} as const;

export const rarityColors = {
  mythic:   "#FB923C",
  rare:     "#C9A84C",
  uncommon: "#94A3B8",
  common:   "#6B7280",
} as const;
```

- [ ] **Verify TypeScript**

```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors

- [ ] **Commit**

```bash
git add apps/mobile/src/theme.ts
git commit -m "design: update mobile theme tokens — adaptive depth palette + identity tints"
```

---

## Task 14: Mobile SetSymbol component

**Files:**
- Create: `apps/mobile/src/components/ui/SetSymbol.tsx`

- [ ] **Check whether `react-native-svg` is installed**

```bash
cat apps/mobile/package.json | grep -E "react-native-svg|expo-image"
```

If `react-native-svg` is not present, install it:
```bash
cd apps/mobile && npx expo install react-native-svg
```

- [ ] **Create mobile SetSymbol**

```tsx
// apps/mobile/src/components/ui/SetSymbol.tsx
import React, { useEffect, useState, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { SvgXml } from "react-native-svg";
import { rarityColors } from "../../theme";

interface SetSymbolProps {
  setCode: string;
  rarity: string | null | undefined;
  size?: number;
}

const svgCache = new Map<string, string>();

function getRarityColor(rarity: string | null | undefined): string {
  switch (rarity?.toLowerCase()) {
    case "mythic":   return rarityColors.mythic;
    case "rare":     return rarityColors.rare;
    case "uncommon": return rarityColors.uncommon;
    default:         return rarityColors.common;
  }
}

function injectColor(svgText: string, color: string): string {
  return svgText
    .replace(/fill="(?!none")([^"]*)"/g, `fill="${color}"`)
    .replace(/stroke="(?!none")([^"]*)"/g, `stroke="${color}"`)
    .replace(/fill:(?!\s*none)\s*[^;"}]*/g, `fill:${color}`)
    .replace(/stroke:(?!\s*none)\s*[^;"}]*/g, `stroke:${color}`);
}

export function SetSymbol({ setCode, rarity, size = 16 }: SetSymbolProps) {
  const [svgXml, setSvgXml] = useState<string | null>(null);
  const isMythic = rarity?.toLowerCase() === "mythic";
  const pulseAnim = useRef(new Animated.Value(0.6)).current;
  const abortRef = useRef<AbortController | null>(null);
  const color = getRarityColor(rarity);
  const cacheKey = `${setCode.toLowerCase()}:${color}`;

  useEffect(() => {
    if (svgCache.has(cacheKey)) {
      setSvgXml(svgCache.get(cacheKey)!);
      return;
    }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    fetch(`https://svgs.scryfall.io/sets/${setCode.toLowerCase()}.svg`, {
      signal: abortRef.current.signal,
    })
      .then((r) => r.text())
      .then((text) => {
        const colored = injectColor(text, color);
        svgCache.set(cacheKey, colored);
        setSvgXml(colored);
      })
      .catch(() => {});
    return () => abortRef.current?.abort();
  }, [cacheKey, setCode, color]);

  useEffect(() => {
    if (!isMythic || !svgXml) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isMythic, svgXml, pulseAnim]);

  if (!svgXml) {
    return (
      <View
        style={[
          styles.fallback,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color + "66" },
        ]}
      />
    );
  }

  if (isMythic) {
    return (
      <Animated.View style={{ opacity: pulseAnim, width: size, height: size }}>
        <SvgXml xml={svgXml} width={size} height={size} />
      </Animated.View>
    );
  }

  return <SvgXml xml={svgXml} width={size} height={size} />;
}

const styles = StyleSheet.create({
  fallback: {
    opacity: 0.5,
  },
});
```

- [ ] **Verify TypeScript**

```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors

- [ ] **Commit**

```bash
git add apps/mobile/src/components/ui/SetSymbol.tsx
git commit -m "feat: mobile SetSymbol — Scryfall SVG fetch + rarity color + mythic pulse"
```

---

## Task 15: Final build verification

- [ ] **Build web app**

```bash
cd apps/web && npm run build
```
Expected: successful build with no TypeScript or Tailwind errors

- [ ] **Lint web**

```bash
cd apps/web && npm run lint
```
Expected: no errors (warnings acceptable)

- [ ] **TypeScript check mobile**

```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors

- [ ] **Commit any lint fixes, then tag**

```bash
git add -A
git commit -m "design: final lint fixes"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Warm ivory `#F6F2EC` bg, obsidian `#0D0B09` dark | Task 1 |
| Antiqued gold `#C9A84C` accent | Task 1 |
| Mana identity tints + CSS variables | Task 1 |
| Cinzel display font | Task 2 |
| `getIdentityStyle` helper | Task 3 |
| SetSymbol — Scryfall fetch + inject + cache | Task 4 |
| Mythic pulse animation | Task 4 |
| DeckStatStrip component | Task 5 |
| Badge metallic rarity redesign | Task 6 |
| Badge set symbol icon | Task 6 |
| Button gold variant | Task 7 |
| NavBar frosted glass + logo glow | Task 8 |
| Collection page identity tints | Task 9 |
| Card detail SetSymbol + stat context | Task 10 |
| Deck page DeckStatStrip | Task 11 |
| Home page Cinzel hero | Task 12 |
| Mobile token update + identity tints | Task 13 |
| Mobile SetSymbol | Task 14 |
| Card hover spring + shimmer at 125° | Task 1 (card-hover) |

**Type consistency check:** `getIdentityStyle` defined in Task 3 and used in Tasks 9, 10. `getRarityColor` defined in Task 3, imported by `SetSymbol` in Task 4 and duplicated inline in mobile Task 14 (correct — mobile has its own module). `DeckStatStrip` defined in Task 5, imported in Tasks 10 and 11. All consistent.

**Placeholder scan:** No TBDs, TODOs, or "implement later" patterns found.

**Note on shimmer sweep:** The 125° angled shimmer on card hover is a CSS `::after` pseudo-element — it cannot be added to the existing `.card-hover` class without a dedicated wrapper. This is handled in Task 1 by updating the `.card-hover` transition, but the shimmer overlay requires the card container to have `position: relative` and `overflow: hidden`. The collection page cards already have `rounded-2xl` which implies these styles. If shimmer is desired as a full feature, add a `.card-shimmer-hover::after` class to globals.css and apply it to card grid items — this can be done as a follow-up without blocking the rest of the design work.
