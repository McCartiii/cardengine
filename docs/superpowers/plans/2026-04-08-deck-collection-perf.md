# Deck UX, Collection Add & Image Performance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the decks list page with card art fan heroes, add manual card-to-collection flow on the collection page, and fix image loading with progressive small→normal Scryfall images.

**Architecture:** Three independent feature tracks that share a common `scryfallSmall` utility. The image perf utility is built first since both the decks page and collection page consume it. The decks list API gets a small extension to return featured card images per deck. No new database tables; all APIs already exist.

**Tech Stack:** Next.js 14 (React), Tailwind CSS v4, Supabase auth, Fastify API (Prisma), Dexie (IndexedDB), Scryfall CDN images.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `apps/web/src/lib/scryfallImage.ts` | **Create.** `scryfallSmall()` URL rewrite utility |
| `apps/web/src/components/ui/CardImage.tsx` | **Modify.** Add `progressive` prop for small→normal crossfade |
| `apps/api/src/routes/decks.ts` | **Modify.** Deck list endpoint returns `featuredImages` and `colorIdentity` per deck |
| `apps/web/src/lib/api.ts` | **Modify.** Extend `Deck` type with `featuredImages`, `colorIdentity`, `totalValue` |
| `apps/web/src/app/decks/page.tsx` | **Modify.** Full redesign with fan card art, new deck card, creation modal |
| `apps/web/src/app/collection/page.tsx` | **Modify.** Stats bar, All/Owned toggle, one-tap add button, owned badge |
| `apps/web/src/app/card/[variantId]/page.tsx` | **Modify.** Use progressive loading for main card image |
| `apps/web/src/app/deck/page.tsx` | **Modify.** Use `scryfallSmall()` for thumbnails |
| `apps/web/src/app/watchlist/page.tsx` | **Modify.** Use `scryfallSmall()` for thumbnails |

---

### Task 1: Scryfall Image Utility

**Files:**
- Create: `apps/web/src/lib/scryfallImage.ts`

- [ ] **Step 1: Create the utility file**

```typescript
// apps/web/src/lib/scryfallImage.ts

/**
 * Rewrites a Scryfall image URL from `normal` (745×1040) to `small` (146×204).
 * Works for both CDN URLs (cards.scryfall.io/normal/...) and API redirect URLs
 * (...&version=normal).
 * Returns the original string unchanged if it doesn't match either pattern.
 */
export function scryfallSmall(imageUri: string | undefined | null): string | undefined {
  if (!imageUri) return undefined;
  // CDN pattern: https://cards.scryfall.io/normal/front/...
  if (imageUri.includes("/normal/")) {
    return imageUri.replace("/normal/", "/small/");
  }
  // API redirect pattern: ...&version=normal
  if (imageUri.includes("version=normal")) {
    return imageUri.replace("version=normal", "version=small");
  }
  return imageUri;
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd /Users/carterchurch/card-engine-platform/apps/web && npx next build 2>&1 | tail -5`
Expected: Build succeeds (the file is not imported yet, but should not cause errors)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/scryfallImage.ts
git commit -m "feat: add scryfallSmall URL rewrite utility"
```

---

### Task 2: CardImage Progressive Loading

**Files:**
- Modify: `apps/web/src/components/ui/CardImage.tsx`

- [ ] **Step 1: Update CardImage with progressive prop**

Replace the entire file with:

```tsx
// apps/web/src/components/ui/CardImage.tsx
"use client";

import { useState, useEffect } from "react";
import { scryfallSmall } from "@/lib/scryfallImage";

interface CardImageProps {
  src: string;
  alt: string;
  className?: string;
  /** Applied to the outer wrapper div — use for sizing (e.g. "h-32 w-auto") */
  wrapperClassName?: string;
  /** Whether to show the rainbow foil hover effect. Default: true */
  foil?: boolean;
  /**
   * Progressive loading: loads small Scryfall image first, then swaps to
   * full-size once it loads. Use for large display contexts (card detail page,
   * hover previews). Default: false — loads src directly.
   */
  progressive?: boolean;
}

/**
 * Drop-in replacement for <img> on card art.
 * Shows a teal conic-spin overlay while loading, fades it out on load.
 * Wraps with rainbow foil hover effect by default.
 */
export function CardImage({
  src,
  alt,
  className = "",
  wrapperClassName = "",
  foil = true,
  progressive = false,
}: CardImageProps) {
  const [smallLoaded, setSmallLoaded] = useState(false);
  const [fullLoaded, setFullLoaded] = useState(false);

  const smallSrc = scryfallSmall(src);
  const isProgressive = progressive && smallSrc && smallSrc !== src;

  useEffect(() => {
    setSmallLoaded(false);
    setFullLoaded(false);
  }, [src]);

  // Non-progressive: single image, spinner until loaded
  if (!isProgressive) {
    return (
      <div
        className={`relative inline-block ${foil ? "card-foil-hover" : ""} ${wrapperClassName}`}
      >
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-[120ms]"
          style={{
            opacity: smallLoaded ? 0 : 1,
            borderRadius: "inherit",
            background: `conic-gradient(
              from var(--spin-a) at 50% 50%,
              #0d2020 0deg,
              #0D9488 60deg,
              #2DD4BF 90deg,
              #0D9488 120deg,
              #0d2020 180deg,
              #0d2020 360deg
            )`,
            animation: "conic-spin 1.2s linear infinite",
            zIndex: 3,
          }}
        >
          <div
            className="absolute"
            style={{
              inset: "3px",
              borderRadius: "inherit",
              background: "var(--surface-sunken)",
            }}
          />
        </div>

        <img
          src={src}
          alt={alt}
          className={`block transition-opacity duration-[120ms] ${smallLoaded ? "opacity-100" : "opacity-0"} ${className}`}
          loading="lazy"
          onLoad={() => setSmallLoaded(true)}
          onError={() => setSmallLoaded(true)}
        />
      </div>
    );
  }

  // Progressive: small loads fast → spinner gone, then full fades over small
  return (
    <div
      className={`relative inline-block ${foil ? "card-foil-hover" : ""} ${wrapperClassName}`}
    >
      {/* Conic-spin loading overlay — only until small loads */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-[120ms]"
        style={{
          opacity: smallLoaded ? 0 : 1,
          borderRadius: "inherit",
          background: `conic-gradient(
            from var(--spin-a) at 50% 50%,
            #0d2020 0deg,
            #0D9488 60deg,
            #2DD4BF 90deg,
            #0D9488 120deg,
            #0d2020 180deg,
            #0d2020 360deg
          )`,
          animation: "conic-spin 1.2s linear infinite",
          zIndex: 3,
        }}
      >
        <div
          className="absolute"
          style={{
            inset: "3px",
            borderRadius: "inherit",
            background: "var(--surface-sunken)",
          }}
        />
      </div>

      {/* Small image — loads fast, shown immediately */}
      <img
        src={smallSrc}
        alt={alt}
        className={`block transition-opacity duration-[120ms] ${smallLoaded ? "opacity-100" : "opacity-0"} ${className}`}
        loading="lazy"
        onLoad={() => setSmallLoaded(true)}
        onError={() => setSmallLoaded(true)}
      />

      {/* Full image — starts loading after small shown, fades in over top */}
      {smallLoaded && (
        <img
          src={src}
          alt={alt}
          className={`absolute inset-0 block transition-opacity duration-[120ms] ${fullLoaded ? "opacity-100" : "opacity-0"} ${className}`}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onLoad={() => setFullLoaded(true)}
          onError={() => setFullLoaded(true)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd /Users/carterchurch/card-engine-platform/apps/web && npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/CardImage.tsx
git commit -m "feat: add progressive small→normal loading to CardImage"
```

---

### Task 3: Apply scryfallSmall to All Thumbnail Contexts

**Files:**
- Modify: `apps/web/src/app/collection/page.tsx`
- Modify: `apps/web/src/app/deck/page.tsx`
- Modify: `apps/web/src/app/watchlist/page.tsx`
- Modify: `apps/web/src/app/card/[variantId]/page.tsx`

- [ ] **Step 1: Collection page — add import and use scryfallSmall**

In `apps/web/src/app/collection/page.tsx`, add the import at the top (after existing imports):

```typescript
import { scryfallSmall } from "@/lib/scryfallImage";
```

Find the `CardImage` usage (around line 278):
```tsx
<CardImage
  src={card.imageUri}
  alt={card.name}
  className="h-32 w-auto rounded-lg shadow-sm"
  wrapperClassName="rounded-lg"
/>
```

Change `src` to:
```tsx
<CardImage
  src={scryfallSmall(card.imageUri) ?? card.imageUri}
  alt={card.name}
  className="h-32 w-auto rounded-lg shadow-sm"
  wrapperClassName="rounded-lg"
/>
```

- [ ] **Step 2: Deck editor page — add import and use scryfallSmall**

In `apps/web/src/app/deck/page.tsx`, add the import:

```typescript
import { scryfallSmall } from "@/lib/scryfallImage";
```

Find the hover preview `CardImage` (around line 904):
```tsx
<CardImage
  src={hoveredCard}
  alt="Card preview"
  className="w-full rounded-xl shadow-[var(--shadow-card)]"
  wrapperClassName="w-full rounded-xl"
  foil={false}
/>
```

Change to progressive for hover preview (large image):
```tsx
<CardImage
  src={hoveredCard}
  alt="Card preview"
  className="w-full rounded-xl shadow-[var(--shadow-card)]"
  wrapperClassName="w-full rounded-xl"
  foil={false}
  progressive
/>
```

Find the search result thumbnails `CardImage` (around line 926):
```tsx
<CardImage
  src={r.imageUri}
  alt={r.name}
  className="h-10 w-auto rounded"
  wrapperClassName="rounded"
  foil={false}
/>
```

Change to use scryfallSmall:
```tsx
<CardImage
  src={scryfallSmall(r.imageUri) ?? r.imageUri}
  alt={r.name}
  className="h-10 w-auto rounded"
  wrapperClassName="rounded"
  foil={false}
/>
```

- [ ] **Step 3: Watchlist page — add import and use scryfallSmall**

In `apps/web/src/app/watchlist/page.tsx`, add the import:

```typescript
import { scryfallSmall } from "@/lib/scryfallImage";
```

Find both `CardImage` usages and wrap `src` in `scryfallSmall()`:

Search result thumbnails (around line 220):
```tsx
src={scryfallSmall(r.imageUri) ?? r.imageUri}
```

Selected card image (around line 249):
```tsx
src={scryfallSmall(selectedCard.imageUri) ?? selectedCard.imageUri}
```

- [ ] **Step 4: Card detail page — use progressive for main image**

In `apps/web/src/app/card/[variantId]/page.tsx`, add the import:

```typescript
import { scryfallSmall } from "@/lib/scryfallImage";
```

Find the main card `CardImage` (around line 826):
```tsx
<CardImage
  src={card.imageUri}
  alt={card.name}
  className="w-full max-w-[320px] rounded-2xl shadow-[var(--shadow-elevated)]"
  wrapperClassName="rounded-2xl max-w-[320px] w-full"
/>
```

Add progressive loading:
```tsx
<CardImage
  src={card.imageUri}
  alt={card.name}
  className="w-full max-w-[320px] rounded-2xl shadow-[var(--shadow-elevated)]"
  wrapperClassName="rounded-2xl max-w-[320px] w-full"
  progressive
/>
```

Find the printings grid `CardImage` (around line 1181):
```tsx
<CardImage
  src={p.imageUri}
  alt={`${p.name} (${p.setId?.toUpperCase()})`}
  className="w-full"
  wrapperClassName="w-full rounded-xl"
/>
```

Use scryfallSmall for the printings thumbnails:
```tsx
<CardImage
  src={scryfallSmall(p.imageUri) ?? p.imageUri}
  alt={`${p.name} (${p.setId?.toUpperCase()})`}
  className="w-full"
  wrapperClassName="w-full rounded-xl"
/>
```

- [ ] **Step 5: Verify build passes**

Run: `cd /Users/carterchurch/card-engine-platform/apps/web && npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/collection/page.tsx apps/web/src/app/deck/page.tsx apps/web/src/app/watchlist/page.tsx apps/web/src/app/card/\[variantId\]/page.tsx
git commit -m "feat: use scryfallSmall for thumbnails, progressive for detail views"
```

---

### Task 4: API — Featured Images on Deck List

**Files:**
- Modify: `apps/api/src/routes/decks.ts:104-125` (the `GET /v1/decks` handler)

- [ ] **Step 1: Extend the deck list query to include card images and colors**

In `apps/api/src/routes/decks.ts`, find the list endpoint (around line 104):

```typescript
const decks = await prisma.deck.findMany({
  where,
  orderBy: { updatedAt: "desc" },
  include: {
    _count: { select: { cards: true } },
  },
});

return { decks };
```

Replace with:

```typescript
const decks = await prisma.deck.findMany({
  where,
  orderBy: { updatedAt: "desc" },
  include: {
    _count: { select: { cards: true } },
    cards: {
      take: 4,
      orderBy: [{ section: "asc" }, { quantity: "desc" }],
      where: { variantId: { not: null } },
      select: {
        variant: {
          select: { imageUri: true, colors: true },
        },
      },
    },
  },
});

// Compute totalValue per deck
const allVariantIds = decks.flatMap((d) =>
  d.cards.map((c) => c.variant?.imageUri).filter(Boolean)
).length; // just to check if cards exist

const enrichedDecks = decks.map((d) => {
  const featuredImages = d.cards
    .map((c) => c.variant?.imageUri)
    .filter((uri): uri is string => uri != null);

  // Aggregate color identity from the first few cards
  const colorSet = new Set<string>();
  for (const c of d.cards) {
    for (const color of c.variant?.colors ?? []) {
      colorSet.add(color);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cards: _cards, ...deckData } = d;
  return {
    ...deckData,
    featuredImages,
    colorIdentity: [...colorSet],
  };
});

return { decks: enrichedDecks };
```

- [ ] **Step 2: Verify API builds**

Run: `cd /Users/carterchurch/card-engine-platform/apps/api && npx tsc --noEmit 2>&1 | tail -10`
Expected: No type errors (or pre-existing errors only)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/decks.ts
git commit -m "feat: return featuredImages and colorIdentity in deck list API"
```

---

### Task 5: Decks List Page Redesign

**Files:**
- Modify: `apps/web/src/lib/api.ts` (extend Deck type)
- Modify: `apps/web/src/app/decks/page.tsx` (full redesign)

- [ ] **Step 1: Extend Deck type in api.ts**

In `apps/web/src/lib/api.ts`, find the `Deck` interface (around line 42):

```typescript
export interface Deck {
  id: string;
  name: string;
  format: string;
  game: string;
  commander: string | null;
  description: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { cards: number };
}
```

Replace with:

```typescript
export interface Deck {
  id: string;
  name: string;
  format: string;
  game: string;
  commander: string | null;
  description: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { cards: number };
  featuredImages?: string[];
  colorIdentity?: string[];
}
```

- [ ] **Step 2: Rewrite the decks page**

Replace the entire contents of `apps/web/src/app/decks/page.tsx` with:

```tsx
"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { api, type Deck } from "@/lib/api";
import Link from "next/link";
import { NavBar } from "@/components/ui/NavBar";
import { Button } from "@/components/ui/Button";
import { scryfallSmall } from "@/lib/scryfallImage";

/* ── Format badge colors ── */
const FORMAT_COLOR: Record<string, string> = {
  commander: "#22C55E",
  standard: "#F43F5E",
  modern: "#38BDF8",
  pioneer: "#A78BFA",
  legacy: "#FB923C",
  vintage: "#FB923C",
  pauper: "#94A3B8",
  explorer: "#38BDF8",
  historic: "#A78BFA",
  oathbreaker: "#22C55E",
  brawl: "#22C55E",
};

/* ── Mana pip colors ── */
const PIP_COLOR: Record<string, string> = {
  W: "#FDE68A",
  U: "#93C5FD",
  B: "#C4B5D4",
  R: "#FCA5A5",
  G: "#86EFAC",
};

/* ── Identity gradient backgrounds ── */
function identityGradient(colors: string[]): string {
  if (colors.length === 0) return "linear-gradient(135deg, #1E2535 0%, #161B27 100%)";
  const map: Record<string, [string, string]> = {
    W: ["#1A1810", "#2A2510"],
    U: ["#0D1824", "#1E3A5F"],
    B: ["#1A1225", "#2D1B4E"],
    R: ["#1C0E0E", "#5C1A1A"],
    G: ["#0A160D", "#14532D"],
  };
  if (colors.length === 1) {
    const c = map[colors[0]] ?? ["#1E2535", "#161B27"];
    return `linear-gradient(135deg, ${c[0]} 0%, ${c[1]} 50%, ${c[0]} 100%)`;
  }
  if (colors.length === 2) {
    const a = map[colors[0]] ?? ["#1E2535", "#161B27"];
    const b = map[colors[1]] ?? ["#1E2535", "#161B27"];
    return `linear-gradient(135deg, ${a[0]} 0%, ${a[1]} 40%, ${b[1]} 100%)`;
  }
  // 3+ = multi/gold
  return "linear-gradient(135deg, #1A1508 0%, #2A2010 40%, #1A1225 100%)";
}

/* ── Fan card positions ── */
const FAN_POSITIONS = [
  { right: 128, rotation: -16, z: 1, hoverRotation: -20, hoverX: -6 },
  { right: 84, rotation: -8, z: 2, hoverRotation: -10, hoverX: -3 },
  { right: 42, rotation: 0, z: 3, hoverRotation: 0, hoverX: 0 },
  { right: 0, rotation: 8, z: 2, hoverRotation: 10, hoverX: 3 },
];

function DeckCard({ deck }: { deck: Deck }) {
  const images = deck.featuredImages ?? [];
  const colors = deck.colorIdentity ?? [];
  const fmtColor = FORMAT_COLOR[deck.format?.toLowerCase()] ?? "#94A3B8";

  return (
    <Link
      href={`/decks/${deck.id}`}
      className="group block rounded-[20px] overflow-hidden border-[1.5px] border-[var(--border)] transition-all duration-[220ms]"
      style={{
        transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.transform = "translateY(-4px) scale(1.01)";
        el.style.borderColor = "#2D4059";
        el.style.boxShadow = "0 20px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.transform = "";
        el.style.borderColor = "";
        el.style.boxShadow = "";
      }}
    >
      {/* Hero */}
      <div
        className="relative overflow-hidden"
        style={{ height: 150, background: identityGradient(colors) }}
      >
        {/* Card fan */}
        {images.length > 0 && (
          <div className="absolute" style={{ right: -4, top: "50%", transform: "translateY(-50%)" }}>
            <div className="relative" style={{ width: 200, height: 120 }}>
              {images.slice(0, 4).map((uri, i) => {
                const pos = FAN_POSITIONS[i] ?? FAN_POSITIONS[0];
                return (
                  <div
                    key={i}
                    className="absolute overflow-hidden transition-transform duration-300"
                    style={{
                      width: 72,
                      height: 100,
                      borderRadius: 7,
                      right: pos.right,
                      top: "50%",
                      marginTop: -50,
                      transform: `rotate(${pos.rotation}deg)`,
                      zIndex: pos.z,
                      border: "1.5px solid rgba(255,255,255,0.15)",
                      boxShadow: "-2px 2px 16px rgba(0,0,0,0.8)",
                      transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
                    }}
                  >
                    <img
                      src={scryfallSmall(uri) ?? uri}
                      alt=""
                      className="w-full h-full object-cover block"
                      loading="lazy"
                      onError={(e) => {
                        const el = e.currentTarget;
                        el.style.display = "none";
                        el.parentElement!.style.background =
                          "repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 2px, transparent 2px, transparent 8px)";
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Gradient overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(to right, ${colors.length > 0 ? "rgba(0,0,0,0.85)" : "rgba(30,37,53,0.9)"} 20%, rgba(0,0,0,0.5) 55%, transparent 100%), linear-gradient(to top, #161B27 0%, transparent 40%)`,
          }}
        />

        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 p-4 pb-3 z-10">
          <div
            className="inline-flex px-2 py-0.5 rounded-[5px] text-[10px] font-bold uppercase tracking-wide mb-1"
            style={{ background: `${fmtColor}2E`, color: fmtColor }}
          >
            {deck.format}
          </div>
          <div className="text-[17px] font-extrabold text-[#F8FAFC] leading-tight" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.9)" }}>
            {deck.name}
          </div>
          {colors.length > 0 && (
            <div className="flex gap-1 mt-1.5">
              {colors.map((c) => (
                <div
                  key={c}
                  className="rounded-full"
                  style={{
                    width: 12,
                    height: 12,
                    background: PIP_COLOR[c] ?? "#94A3B8",
                    border: "1.5px solid rgba(0,0,0,0.5)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="bg-[var(--surface)] border-t border-[rgba(255,255,255,0.04)]">
        {deck.commander && (
          <div className="px-4 pt-2 text-[11px] text-[var(--text-muted)]">
            ⚜ {deck.commander}
          </div>
        )}
        <div className="px-4 py-2.5 flex justify-between items-center">
          <span className="text-[11px] text-[var(--text-muted)]">
            {deck._count?.cards ?? 0} cards
          </span>
          <span className="text-[13px] font-bold text-[var(--accent)]">
            {new Date(deck.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function DecksPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  const { data, isLoading, mutate } = useSWR<{ decks: Deck[] }>(
    user ? "decks" : null,
    () => api.decks.list()
  );

  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFormat, setNewFormat] = useState("commander");

  async function createDeck() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.decks.create({ name: newName, format: newFormat });
      setNewName("");
      setShowModal(false);
      mutate();
    } finally {
      setCreating(false);
    }
  }

  const decks = data?.decks ?? [];
  const FORMATS = ["commander", "standard", "modern", "pioneer", "legacy", "pauper"];

  return (
    <div className="min-h-screen bg-bg">
      <NavBar user={user ?? undefined} />

      <main className="mx-auto max-w-[860px] px-7 py-9">
        {/* Header */}
        <div className="flex items-end justify-between mb-7">
          <div>
            <h1 className="text-[30px] font-extrabold tracking-tight text-text-primary">My Decks</h1>
            <p className="text-[13px] text-text-muted mt-0.5">
              {decks.length} deck{decks.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[220px] rounded-[20px] bg-surface animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* New Deck card */}
            <button
              onClick={() => setShowModal(true)}
              className="rounded-[20px] min-h-[220px] flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-all duration-200 group"
              style={{ border: "2px dashed var(--border)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
                e.currentTarget.style.background = "rgba(13,148,136,0.04)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <div
                className="flex items-center justify-center transition-all duration-200"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: "rgba(13,148,136,0.1)",
                  border: "1.5px solid rgba(13,148,136,0.25)",
                  fontSize: 24,
                  color: "var(--accent)",
                }}
              >
                +
              </div>
              <span className="text-sm font-bold text-[var(--accent)]">New Deck</span>
              <span className="text-[11px] text-[var(--text-muted)]">Import or build from scratch</span>
            </button>

            {decks.map((deck) => (
              <DeckCard key={deck.id} deck={deck} />
            ))}
          </div>
        )}

        {/* Empty state (no decks) */}
        {!isLoading && decks.length === 0 && (
          <div className="text-center mt-4">
            <p className="text-text-muted text-sm">Create your first deck to get started</p>
          </div>
        )}
      </main>

      {/* Creation modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div
            className="w-full max-w-[380px] animate-slide-up"
            style={{
              background: "rgba(22,27,39,0.95)",
              backdropFilter: "blur(20px)",
              border: "1.5px solid var(--border-strong)",
              borderRadius: 24,
              padding: 28,
            }}
          >
            <h2 className="text-xl font-extrabold text-text-primary mb-5 tracking-tight">New Deck</h2>

            <div className="mb-4">
              <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">
                Deck Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                placeholder="My Awesome Deck"
                className="w-full rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--surface-sunken)] px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                onKeyDown={(e) => {
                  if (e.key === "Enter") createDeck();
                }}
              />
            </div>

            <div className="mb-5">
              <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">
                Format
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {FORMATS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setNewFormat(f)}
                    className="py-2 px-1.5 rounded-[10px] text-[11px] font-semibold text-center transition-all duration-150 border-[1.5px]"
                    style={{
                      background:
                        newFormat === f ? "rgba(13,148,136,0.12)" : "var(--surface-raised)",
                      color: newFormat === f ? "#2DD4BF" : "var(--text-secondary)",
                      borderColor: newFormat === f ? "var(--accent)" : "var(--border)",
                    }}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2.5">
              <Button
                variant="primary"
                onClick={createDeck}
                disabled={creating || !newName.trim()}
                className="flex-1"
              >
                {creating ? "Creating…" : "Create Deck →"}
              </Button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 rounded-xl text-sm text-text-muted transition-colors hover:text-text-secondary"
                style={{
                  background: "var(--surface-raised)",
                  border: "1.5px solid var(--border)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build passes**

Run: `cd /Users/carterchurch/card-engine-platform/apps/web && npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/app/decks/page.tsx
git commit -m "feat: redesign decks list page with card art fan heroes"
```

---

### Task 6: Collection Page — Stats Bar + One-Tap Add

**Files:**
- Modify: `apps/web/src/lib/api.ts` (add collection.cards method)
- Modify: `apps/web/src/app/collection/page.tsx`

- [ ] **Step 1: Add collection.cards to api.ts**

In `apps/web/src/lib/api.ts`, find the `collection` namespace (around line 119):

```typescript
collection: {
  value: () =>
    request<{ totalValue: number; currency: string; cardCount: number; breakdown: unknown[] }>("GET", "/v1/collection/value"),
},
```

Replace with:

```typescript
collection: {
  value: () =>
    request<{ totalValue: number; currency: string; cardCount: number; breakdown: unknown[] }>("GET", "/v1/collection/value"),
  cards: (params?: { q?: string; sort?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.sort) qs.set("sort", params.sort);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return request<{
      cards: Array<{
        variantId: string;
        name: string;
        imageUri: string | null;
        setId: string | null;
        collectorNumber: string | null;
        rarity: string | null;
        typeLine: string | null;
        manaCost: string | null;
        colors: string[] | null;
        quantity: number;
        priceUsd: number | null;
        lineValue: number | null;
        addedAt: string | null;
      }>;
      totalCards: number;
      totalValue: number;
      page: number;
      hasMore: boolean;
    }>("GET", `/v1/collection/cards${query ? `?${query}` : ""}`);
  },
},
```

- [ ] **Step 2: Rewrite collection page with stats bar, toggle, and add button**

Replace the entire contents of `apps/web/src/app/collection/page.tsx` with:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { addCollectionEvent } from "@/lib/store/cardStore";
import { runWebSync } from "@/lib/store/sync";
import { downloadAndStoreBundle, searchCardsLocal, type LocalCard } from "@/lib/store/cardStore";
import Link from "next/link";
import { NavBar } from "@/components/ui/NavBar";
import { Badge } from "@/components/ui/Badge";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { getIdentityStyle } from "@/lib/identity";
import { CardImage } from "@/components/ui/CardImage";
import { scryfallSmall } from "@/lib/scryfallImage";
import { api, setToken } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface PriceEntry {
  market: string;
  kind: string;
  currency: string;
  amount: number;
}

interface CardWithPrice extends LocalCard {
  priceUsd?: number | null;
  priceEur?: number | null;
  prices?: PriceEntry[];
}

interface OwnedCard {
  variantId: string;
  name: string;
  imageUri: string | null;
  setId: string | null;
  collectorNumber: string | null;
  rarity: string | null;
  typeLine: string | null;
  quantity: number;
  priceUsd: number | null;
  lineValue: number | null;
}

function priceLabel(p: PriceEntry): string {
  const marketName = p.market === "tcgplayer" ? "TCG" : p.market === "cardmarket" ? "MKM" : "MTGO";
  const kindLabel = p.kind === "market" ? "" : p.kind === "foil" ? " Foil" : ` ${p.kind.charAt(0).toUpperCase() + p.kind.slice(1)}`;
  return `${marketName}${kindLabel}`;
}

function currencySymbol(currency: string): string {
  if (currency === "USD") return "$";
  if (currency === "EUR") return "\u20ac";
  if (currency === "TIX") return "";
  return currency + " ";
}

function currencySuffix(currency: string): string {
  if (currency === "TIX") return " tix";
  return "";
}

type BadgeVariant = "tcg" | "mkm" | "mtgo" | "default";

function marketBadgeVariant(market: string): BadgeVariant {
  if (market === "tcgplayer") return "tcg";
  if (market === "cardmarket") return "mkm";
  if (market === "mtgo") return "mtgo";
  return "default";
}

function rarityBadgeVariant(rarity: string | undefined): "mythic" | "rare" | "uncommon" | "common" | "default" {
  if (!rarity) return "default";
  const r = rarity.toLowerCase();
  if (r === "mythic") return "mythic";
  if (r === "rare") return "rare";
  if (r === "uncommon") return "uncommon";
  if (r === "common") return "common";
  return "default";
}

type SortOption = "popular" | "name-asc" | "name-desc" | "price-asc" | "price-desc" | "rarity";
type ViewMode = "all" | "owned";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "popular", label: "Most Popular" },
  { value: "name-asc", label: "Name A \u2192 Z" },
  { value: "name-desc", label: "Name Z \u2192 A" },
  { value: "rarity", label: "Rarity (Mythic first)" },
  { value: "price-desc", label: "Price: High \u2192 Low" },
  { value: "price-asc", label: "Price: Low \u2192 High" },
];

export default function CollectionPage() {
  const [cards, setCards] = useState<CardWithPrice[]>([]);
  const [ownedCards, setOwnedCards] = useState<OwnedCard[]>([]);
  const [ownedMap, setOwnedMap] = useState<Map<string, number>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("popular");
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    downloaded: number;
    total: number | null;
  } | null>(null);
  const [watchlistAdded, setWatchlistAdded] = useState<Set<string>>(new Set());
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());

  // Collection stats
  const [collectionStats, setCollectionStats] = useState<{
    totalCards: number;
    totalValue: number;
    sets: number;
  }>({ totalCards: 0, totalValue: 0, sets: 0 });

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      // Set token for api calls
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setToken(session.access_token);
    }
    loadUser();
  }, []);

  // Load owned cards for stats + badge display
  useEffect(() => {
    if (!user) return;
    async function loadOwned() {
      try {
        const data = await api.collection.cards({ limit: 200 });
        setOwnedCards(data.cards);
        const map = new Map<string, number>();
        const setIds = new Set<string>();
        for (const c of data.cards) {
          map.set(c.variantId, c.quantity);
          if (c.setId) setIds.add(c.setId);
        }
        setOwnedMap(map);
        setCollectionStats({
          totalCards: data.totalCards,
          totalValue: data.totalValue,
          sets: setIds.size,
        });
      } catch {
        // Not logged in or error
      }
    }
    loadOwned();
  }, [user]);

  useEffect(() => {
    async function init() {
      try {
        await downloadAndStoreBundle(API_URL, (downloaded, total) => {
          setDownloadProgress({ downloaded, total });
        });
        await runWebSync();
      } catch (err) {
        console.warn("Init error:", err);
      }
      setDownloadProgress(null);
      setLoading(false);
    }
    init();
  }, []);

  // Search cards (All mode)
  useEffect(() => {
    if (viewMode !== "all") return;
    if (!searchQuery) {
      setCards([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_URL}/v1/search?q=${encodeURIComponent(searchQuery)}&limit=50&sort=${sortBy}`
        );
        if (res.ok) {
          const data = await res.json();
          setCards(data.cards ?? []);
          return;
        }
      } catch {
        // Fallback to local
      }
      const results = await searchCardsLocal(searchQuery, 50);
      setCards(results);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, sortBy, viewMode]);

  useEffect(() => {
    const handler = () => { runWebSync(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const addToCollection = useCallback(
    async (variantId: string) => {
      const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await addCollectionEvent({
        id: eventId,
        at: new Date().toISOString(),
        type: "add",
        variantId,
        payload: { qty: 1 },
      });
      // Optimistic update
      setOwnedMap((prev) => {
        const next = new Map(prev);
        next.set(variantId, (next.get(variantId) ?? 0) + 1);
        return next;
      });
      setCollectionStats((prev) => ({
        ...prev,
        totalCards: prev.totalCards + 1,
      }));
      // Flash feedback
      setJustAdded((prev) => new Set(prev).add(variantId));
      setTimeout(() => setJustAdded((prev) => {
        const next = new Set(prev);
        next.delete(variantId);
        return next;
      }), 800);
      // Sync in background
      runWebSync().catch(() => {});
    },
    []
  );

  const addToWatchlist = useCallback(
    async (variantId: string, currentPrice: number) => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert("Please sign in to use the watchlist");
        return;
      }
      try {
        const res = await fetch(`${API_URL}/v1/watchlist`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            variantId,
            market: "tcgplayer",
            kind: "market",
            currency: "USD",
            thresholdAmount: currentPrice * 0.8,
            direction: "below",
          }),
        });
        if (res.ok) {
          setWatchlistAdded((prev) => new Set(prev).add(variantId));
        }
      } catch {
        // Offline
      }
    },
    []
  );

  const displayCards = viewMode === "owned" ? ownedCards : cards;
  const showEmptyOwned = viewMode === "owned" && ownedCards.length === 0 && !loading;
  const showEmptySearch = viewMode === "all" && cards.length === 0 && searchQuery && !loading;
  const showPrompt = viewMode === "all" && cards.length === 0 && !searchQuery && !loading;

  return (
    <div className="min-h-screen bg-bg">
      <NavBar user={user} />

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="animate-fade-in">
          <h1 className="text-3xl font-extrabold tracking-tight text-text-primary">
            Collection
          </h1>
          <p className="mt-1 text-text-secondary">Browse, search, and manage your cards</p>
        </div>

        {/* Stats bar */}
        {user && collectionStats.totalCards > 0 && (
          <div
            className="mt-5 rounded-xl p-3 flex justify-between items-center animate-fade-in"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--accent)",
            }}
          >
            <div>
              <div className="text-sm font-bold text-text-primary">{collectionStats.totalCards} cards</div>
              <div className="text-[10px] text-[var(--accent)]">My Collection</div>
            </div>
            <div>
              <div className="text-sm font-bold text-text-primary">${collectionStats.totalValue.toFixed(2)}</div>
              <div className="text-[10px] text-text-muted">Portfolio value</div>
            </div>
            <div>
              <div className="text-sm font-bold text-text-primary">{collectionStats.sets}</div>
              <div className="text-[10px] text-text-muted">Sets</div>
            </div>
          </div>
        )}

        {/* View mode toggle + Search */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center animate-slide-up">
          {/* Toggle */}
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={() => setViewMode("all")}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: viewMode === "all" ? "var(--accent)" : "var(--surface)",
                color: viewMode === "all" ? "white" : "var(--text-secondary)",
                border: viewMode === "all" ? "none" : "1px solid var(--border)",
              }}
            >
              All Cards
            </button>
            <button
              onClick={() => setViewMode("owned")}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: viewMode === "owned" ? "var(--accent)" : "var(--surface)",
                color: viewMode === "owned" ? "white" : "var(--text-secondary)",
                border: viewMode === "owned" ? "none" : "1px solid var(--border)",
              }}
            >
              Owned
            </button>
          </div>

          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={viewMode === "all" ? "Search cards by name, type, or text..." : "Filter your collection..."}
              className="w-full rounded-xl border border-border bg-surface pl-10 pr-4 py-3 text-text-primary placeholder:text-text-muted focus:border-tab-collection focus:outline-none focus:ring-2 focus:ring-tab-collection/20 shadow-[var(--shadow-card)] transition-all"
            />
          </div>
          {viewMode === "all" && (
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-secondary focus:border-tab-collection focus:outline-none focus:ring-2 focus:ring-tab-collection/20 shadow-[var(--shadow-card)] cursor-pointer"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="mt-10">
            {downloadProgress ? (
              <div className="text-center animate-fade-in">
                <p className="text-text-secondary text-sm">
                  Downloading cards... {downloadProgress.downloaded.toLocaleString()}
                  {downloadProgress.total ? ` / ${downloadProgress.total.toLocaleString()}` : ""}
                </p>
                {downloadProgress.total && downloadProgress.total > 0 && (
                  <div className="mx-auto mt-4 h-2 w-64 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="h-full rounded-full bg-tab-collection transition-all duration-300"
                      style={{
                        width: `${Math.min((downloadProgress.downloaded / downloadProgress.total) * 100, 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            )}
          </div>
        ) : showEmptyOwned ? (
          <div className="mt-16 text-center animate-fade-in">
            <div className="mx-auto w-12 h-12 rounded-full bg-tab-collection-bg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-tab-collection" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <p className="text-text-primary font-semibold mb-1">Start building your collection</p>
            <p className="text-text-secondary text-sm mb-4">Search for cards above and tap + to add them</p>
            <button
              onClick={() => setViewMode("all")}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              Search all cards →
            </button>
            <p className="text-text-muted text-xs mt-3">
              Or <Link href="/scan" className="text-[var(--accent)] hover:underline">scan cards</Link> with your camera
            </p>
          </div>
        ) : showEmptySearch ? (
          <div className="mt-16 text-center animate-fade-in">
            <div className="mx-auto w-12 h-12 rounded-full bg-surface-sunken flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <p className="text-text-secondary">No cards found for &quot;{searchQuery}&quot;</p>
          </div>
        ) : showPrompt ? (
          <div className="mt-16 text-center animate-fade-in">
            <div className="mx-auto w-12 h-12 rounded-full bg-tab-collection-bg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-tab-collection" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <p className="text-text-secondary">Search for cards to browse prices and add to your collection</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {viewMode === "owned"
              ? ownedCards.map((card, idx) => (
                  <Link
                    key={card.variantId}
                    href={`/card/${encodeURIComponent(card.variantId)}`}
                    className="animate-slide-up flex gap-4 rounded-2xl bg-surface p-4 card-hover"
                    style={{
                      animationDelay: `${Math.min(idx * 0.03, 0.3)}s`,
                      borderWidth: "1.5px",
                      borderStyle: "solid",
                      borderColor: "var(--border)",
                      boxShadow: "var(--shadow-card)",
                    }}
                  >
                    {card.imageUri && (
                      <CardImage
                        src={scryfallSmall(card.imageUri) ?? card.imageUri}
                        alt={card.name}
                        className="h-32 w-auto rounded-lg shadow-sm"
                        wrapperClassName="rounded-lg"
                      />
                    )}
                    <div className="flex flex-1 flex-col justify-between min-w-0">
                      <div>
                        <h3 className="font-semibold text-text-primary truncate">{card.name}</h3>
                        <p className="mt-0.5 text-xs text-text-secondary">
                          {card.setId?.toUpperCase()} {card.collectorNumber}
                        </p>
                        {card.rarity && (
                          <Badge variant={rarityBadgeVariant(card.rarity)} setCode={card.setId ?? undefined} className="mt-1.5">
                            {card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1)}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded"
                          style={{ background: "rgba(13,148,136,0.12)", color: "var(--accent)" }}
                        >
                          ×{card.quantity} owned
                        </span>
                        {card.priceUsd != null && (
                          <span className="text-xs text-[var(--accent)] font-semibold">
                            ${(card.priceUsd * card.quantity).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))
              : cards.map((card, idx) => (
                  <div
                    key={card.variantId}
                    className="animate-slide-up flex gap-4 rounded-2xl bg-surface p-4 card-hover"
                    style={{
                      animationDelay: `${Math.min(idx * 0.03, 0.3)}s`,
                      borderWidth: "1.5px",
                      borderStyle: "solid",
                      boxShadow: "var(--shadow-card)",
                      ...getIdentityStyle(card.colorIdentity ?? []),
                    }}
                  >
                    <Link href={`/card/${encodeURIComponent(card.variantId)}`} className="shrink-0">
                      {card.imageUri && (
                        <CardImage
                          src={scryfallSmall(card.imageUri) ?? card.imageUri}
                          alt={card.name}
                          className="h-32 w-auto rounded-lg shadow-sm"
                          wrapperClassName="rounded-lg"
                        />
                      )}
                    </Link>
                    <div className="flex flex-1 flex-col justify-between min-w-0">
                      <div>
                        <Link href={`/card/${encodeURIComponent(card.variantId)}`}>
                          <h3 className="font-semibold text-text-primary truncate hover:text-[var(--accent)] transition-colors">
                            {card.name}
                          </h3>
                        </Link>
                        <p className="mt-0.5 text-xs text-text-secondary">
                          {card.setId?.toUpperCase()} {card.collectorNumber}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          {card.rarity && (
                            <Badge variant={rarityBadgeVariant(card.rarity)} setCode={card.setId ?? undefined}>
                              {card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1)}
                            </Badge>
                          )}
                          {ownedMap.has(card.variantId) && (
                            <span
                              className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                              style={{
                                background: "rgba(13,148,136,0.12)",
                                border: "1px solid var(--accent)",
                                color: "var(--accent)",
                              }}
                            >
                              ×{ownedMap.get(card.variantId)} owned
                            </span>
                          )}
                        </div>
                        {card.typeLine && (
                          <p className="mt-1 text-xs text-text-muted truncate">{card.typeLine}</p>
                        )}
                      </div>

                      <div className="mt-2 flex items-center gap-1.5">
                        {card.prices && card.prices.length > 0 ? (
                          <>
                            {card.prices.map((p) => (
                              <Badge key={`${p.market}-${p.kind}-${p.currency}`} variant={marketBadgeVariant(p.market)}>
                                {priceLabel(p)} {currencySymbol(p.currency)}{p.amount.toFixed(2)}{currencySuffix(p.currency)}
                              </Badge>
                            ))}
                          </>
                        ) : (
                          <span className="text-xs text-text-muted">No price data</span>
                        )}

                        {/* Add + Watch buttons */}
                        <div className="ml-auto flex items-center gap-1.5">
                          {card.prices?.some((p) => p.currency === "USD") && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const usdPrice = card.prices!.find((p) => p.currency === "USD")!;
                                addToWatchlist(card.variantId, usdPrice.amount);
                              }}
                              className={`rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-text-secondary hover:bg-surface-sunken transition-colors cursor-pointer ${watchlistAdded.has(card.variantId) ? "opacity-40 pointer-events-none" : ""}`}
                            >
                              {watchlistAdded.has(card.variantId) ? "Watching" : "Watch"}
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              addToCollection(card.variantId);
                            }}
                            className="flex items-center justify-center cursor-pointer transition-all"
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              background: justAdded.has(card.variantId)
                                ? "#22C55E"
                                : "linear-gradient(135deg, #0D9488, #14B8A6)",
                              color: "white",
                              fontSize: 16,
                              fontWeight: 700,
                              border: "none",
                            }}
                          >
                            {justAdded.has(card.variantId) ? "✓" : "+"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Verify build passes**

Run: `cd /Users/carterchurch/card-engine-platform/apps/web && npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/app/collection/page.tsx
git commit -m "feat: collection page stats bar, owned toggle, and one-tap add"
```

---

## Verification

After all tasks are complete:

1. `cd /Users/carterchurch/card-engine-platform/apps/web && npx next build` — must pass
2. `cd /Users/carterchurch/card-engine-platform/apps/api && npx tsc --noEmit` — must pass
3. Open `/decks` — dark theme, deck cards with card art fan, "New Deck" card, creation modal works
4. Open `/collection` — stats bar shows card count + value, All/Owned toggle works, + button adds to collection
5. Open `/collection` and search — card images load fast (small thumbnails)
6. Open `/card/[id]` — main image loads progressive (small appears fast, then sharpens to normal)
