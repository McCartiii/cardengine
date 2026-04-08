# Deck UX, Collection Add & Image Performance — Design Spec

## Overview

Three improvements: redesign the decks list page with visual deck cards, add manual card-to-collection flow on the collection page, and fix image loading performance with progressive small→normal loading.

---

## 1. Decks List Page Redesign

**What:** Replace the current `/decks` page (still using old neon theme) with a polished dark+teal design. Each deck is a visual card showing a fan of actual card art from the deck.

### Deck card anatomy

Each deck card has two sections:

**Hero (150px tall):**
- Background: `linear-gradient(135deg, ...)` using the deck's color identity tints (from `--id-*-tint` CSS vars)
- **Card art fan:** 4 cards from the deck fanned on the right side, each 72×100px with `border-radius: 7px`, `border: 1.5px solid rgba(255,255,255,0.15)`, `box-shadow: -2px 2px 16px rgba(0,0,0,0.8)`. Positioned at rotations -16°, -8°, 0°, +8°. Uses `small` Scryfall images. On hover, fan spreads slightly via CSS `--hover-transform`.
- **Gradient overlay:** fades from the identity color on the left (solid at 20%, transparent at 80%) + bottom scrim fading into the card body.
- **Content (over gradient):** format badge (uppercase, colored per format), deck name (`font-size: 17px; font-weight: 800`), color identity pips (12px circles).

**Body:**
- Commander name if applicable (11px, muted)
- Card count + last updated (left) and total value in teal (right)

**Card interaction:**
- Hover: `translateY(-4px) scale(1.01)` with spring easing, `box-shadow: 0 20px 48px rgba(0,0,0,0.6)`, border lightens to `#2D4059`.
- Click: navigates to `/decks/[id]`.

### "New Deck" card
- Dashed border (`2px dashed #1E2D3D`), `border-radius: 20px`
- Centered: teal plus icon (48×48px rounded square with `rgba(13,148,136,0.1)` bg), "New Deck" label, "Import or build from scratch" subtitle
- Hover: border goes teal, subtle teal background tint
- Click: opens creation modal

### Creation modal
- Backdrop: `rgba(0,0,0,0.8)` + `backdrop-filter: blur(10px)`
- Modal: `#131822` with blur, `border: 1.5px solid #2D4059`, `border-radius: 24px`, pop-in animation
- Fields: deck name input (focused on open), format pills in a 3-column grid (Commander, Standard, Modern, Pioneer, Legacy, Pauper). Active pill: `background: rgba(13,148,136,0.12); color: #2DD4BF; border-color: #0D9488`.
- Actions: "Create Deck →" primary gradient button + "Cancel" secondary

### Format badge colors
Use existing tab/format colors:
- Commander: `#22C55E` (green)
- Standard: `#F43F5E` (rose)
- Modern: `#38BDF8` (sky)
- Pioneer: `#A78BFA` (violet)
- Legacy: `#FB923C` (amber)
- Pauper: `#94A3B8` (slate)

### Grid layout
- `grid-template-columns: repeat(2, 1fr)` on desktop, `1fr` on mobile
- `gap: 16px`
- "New Deck" card is first in the grid

### Page header
- Title: "My Decks" (`font-size: 30px; font-weight: 800`)
- Subtitle: deck count + total portfolio value

### Card art selection
The 4 fan cards are selected from the deck's card list:
1. Commander (if present)
2. Highest-value card
3. Two random cards from the deck
If the deck has fewer than 4 cards, show as many as available. If empty, show the color identity gradient only (no fan).

### Image fallback
If a card image fails to load (`onerror`), show a styled card-back placeholder: dark background matching the identity gradient, diagonal stripe pattern (`repeating-linear-gradient(45deg, ...)`), inner border frame.

---

## 2. Collection Page — Stats Bar + One-Tap Add

**What:** Upgrade the collection page to show owned cards with a stats bar, and allow manual card addition via a single-tap + button on search results.

### Stats bar
Sticky at the top of the card list area (below search bar):
- Background: `#161B27`, `border: 1px solid #0D9488`, `border-radius: 10px`, `padding: 10px`
- Three stats: **card count** ("142 cards" + "My Collection" label), **portfolio value** ("$384.20" + "Portfolio value"), **sets represented** (count + "Sets" label)
- Values: `font-weight: 700`, card count label in teal, others in muted
- Fetched from `GET /v1/collection/cards` (totalCards, totalValue) and computed set count from the returned cards

### All / Owned toggle
- Two pill buttons above the card grid: "All Cards" (active = teal bg, white text) and "Owned" (inactive = dark bg, muted text, border)
- "All Cards" mode: current search behavior — searches the full card DB via `GET /v1/search`
- "Owned" mode: fetches from `GET /v1/collection/cards` with optional `q` search param, shows only cards the user owns with quantity badges
- Default to "All Cards" when search is empty, "Owned" when no search query (shows full collection)

### One-tap add button
Each card in search results gets a teal **+** button on the right side:
- `width: 28px; height: 28px; border-radius: 8px; background: linear-gradient(135deg, #0D9488, #14B8A6)`
- Tap: posts a collection event via `addCollectionEvent({ id: uuid, at: now, type: "add", variantId, payload: { qty: 1 } })` then calls `runWebSync()`
- After adding: button briefly shows a checkmark, then reverts to +
- Counter shows next to button if qty > 0 (teal text)

### Owned badge
Cards the user owns show a badge: `background: #0d2020; border: 1px solid #0D9488; color: #0D9488; padding: 1px 6px; border-radius: 4px; font-size: 9px` — displays "×3 owned" (or whatever quantity).

### Data flow
- On page load: fetch `GET /v1/collection/cards` (with auth) to get owned card map (variantId → quantity)
- Build a `Map<string, number>` for quick lookup
- When user adds a card: optimistically update the map, post event locally via `addCollectionEvent()`, sync in background
- Stats bar updates reactively from the owned map

### Empty state
When user has no collection and no search:
- Icon + "Start building your collection" heading
- "Search for cards above and tap + to add them" subtext
- Secondary: "Or scan cards with your camera" link to `/scan`

---

## 3. Image Loading — Progressive Small → Normal

**What:** Fix the 60+ second image load times by loading `small` Scryfall images first, then upgrading to `normal` where needed.

### Strategy by context

| Context | Image size | Behavior |
|---------|-----------|----------|
| Collection grid thumbnails | `small` only | 146×204px is plenty for `h-32` cards |
| Deck list card fans | `small` only | 72×100px display, `small` is more than enough |
| Deck editor search results | `small` only | Thumbnails in search dropdown |
| Deck editor hover preview | `small` → `normal` | Progressive: show small immediately, swap when normal loads |
| Card detail page main image | `small` → `normal` | Progressive crossfade |
| Card detail printings grid | `small` only | Small thumbnails |
| Watchlist thumbnails | `small` only | Small display size |

### URL rewrite utility

```typescript
function scryfallSmall(imageUri: string | undefined): string | undefined {
  if (!imageUri) return undefined;
  return imageUri.replace('/normal/', '/small/');
}
```

For Scryfall API redirect URLs (like `https://api.scryfall.com/cards/named?...&version=normal`), replace `version=normal` with `version=small`.

### CardImage component changes

Add a `progressive` prop to `CardImage`:

- `progressive={false}` (default): loads `src` directly (use with `scryfallSmall(imageUri)` for thumbnails)
- `progressive={true}`: loads `scryfallSmall(src)` first, then starts loading `src` (normal) in the background. When normal loads, crossfade from small to normal at 120ms.

Implementation:
1. Render two `<img>` elements stacked
2. Bottom: small image (loads fast, shown immediately)
3. Top: normal image (starts loading after small is shown, fades in over small)
4. Conic spinner only shows until `small` arrives (~50-100ms)

### Where to apply

- `CardImage` usages that currently pass raw `imageUri`: wrap in `scryfallSmall()` for thumbnail contexts
- Card detail page + deck hover preview: use `progressive={true}` with raw `imageUri`
- Deck list page fan cards: use `scryfallSmall()` directly on `<img>` src (not using CardImage component)

---

## Files to Modify

1. **`apps/web/src/app/decks/page.tsx`** — Full redesign: dark+teal theme, deck card grid with fan art heroes, new deck card, creation modal update
2. **`apps/web/src/app/collection/page.tsx`** — Add stats bar, All/Owned toggle, one-tap add button, owned badge, collection data fetching
3. **`apps/web/src/components/ui/CardImage.tsx`** — Add `progressive` prop, dual-image progressive loading, `scryfallSmall` utility
4. **`apps/web/src/app/card/[variantId]/page.tsx`** — Use `progressive={true}` on CardImage for main image
5. **`apps/web/src/app/deck/page.tsx`** — Use `scryfallSmall()` for search result thumbnails, `progressive={true}` for hover preview
6. **`apps/web/src/app/watchlist/page.tsx`** — Use `scryfallSmall()` for thumbnails
7. **`apps/web/src/lib/scryfallImage.ts`** — New file: `scryfallSmall()` utility function
