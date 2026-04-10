# Deck Detail Page Redesign

**Date:** 2026-04-10
**Page:** `/decks/[id]`
**File:** `apps/web/src/app/decks/[id]/page.tsx`

## Overview

Full redesign of the deck detail page to match the dark slate + teal design system. Replaces the current flat layout with a hero banner, sticky action bar with comprehensive sort/group/view controls, a stats sidebar, and three tabs (Cards, Advisor, AI Architect).

## Design System

All colors use CSS variables from `globals.css`:
- Backgrounds: `#0F1117` / `#161B27` / `#1E2535`
- Accent: `#0D9488` (teal)
- Font: Geist Sans
- No inline purple/neon styles — everything uses the established design tokens

## Layout Structure

### 1. NavBar
- Sticky at top, 52px height
- Logo + nav links (Decks, Collection, Scanner)
- Breadcrumb on right: My Decks / {Deck Name}
- Blur backdrop, border-bottom

### 2. Hero Banner (230px)
- Full-width with color identity gradient background
- **Left side:** Format badge (Commander/Modern/etc), Legal/Illegal badge, Public/Private badge, deck title (30px bold), commander name, stats row (card count, total value in teal, avg CMC), WUBRG color pips
- **Right side:** Fanned card art (3-5 cards from the deck, rotated, with parallax hover effect). Uses Scryfall `art_crop` images from featured cards
- Bottom fade gradient into content area

### 3. Sticky Action Bar (pinned below NavBar at scroll)
- **Left:** Tab buttons — Cards | Advisor | AI Architect
- **Separator**
- **Middle:** Sort/group/view controls (only visible on Cards tab):
  - **Group:** Section / Type / Color / CMC (segmented button group)
  - **View:** List / Art / Art+Name (segmented button group)
  - **Sort:** Name / $↓ / $↑ / CMC (segmented button group)
- **Right:** Copy List / Share / Import action buttons

### 4. Main Content Area (two-column below action bar)

#### Left Column (flex-1): Card List
Renders cards according to current Group × View × Sort selection.

**Group by Section:** Commander, Mainboard, Sideboard, Companion
**Group by Type:** Creatures, Planeswalkers, Instants, Sorceries, Artifacts, Enchantments, Lands, Other — each with color-coded dot and count
**Group by Color:** White, Blue, Black, Red, Green, Multicolor, Colorless — with MTG color dots. Multicolor cards appear only in Multicolor section (not duplicated)
**Group by CMC:** 0, 1, 2, 3, 4, 5, 6, 7+ — with count headers

**View as List:** Compact rows — quantity, card name, type line, mana cost symbols, price. Hover reveals ±1 quantity buttons
**View as Art:** Grid of card art images (120px min columns, card aspect ratio). Quantity badge overlay, hover tooltip with name + price
**View as Art+Name:** Same grid but with name overlay at bottom of each card

**Sort options** apply within each group:
- **Name:** Alphabetical A-Z
- **$↓:** Price descending (most expensive first)
- **$↑:** Price ascending (cheapest first)
- **CMC:** Mana value ascending

#### Right Column (280px sidebar, sticky)

**Deck Stats panel:**
- Total cards, unique cards, total value, avg CMC
- Format + legality status

**Mana Curve chart:**
- Horizontal gradient bars for CMC 0-7+
- Bar width proportional to count, labeled with count
- Uses teal gradient

**Color Distribution:**
- Segmented horizontal bar showing color proportions (W/U/B/R/G)
- Legend below with count per color
- Uses standard MTG colors: W=#F9FAF4, U=#0E68AB, B=#150B00, R=#D3202A, G=#00733E

**Card Types breakdown:**
- Horizontal bar chart: Creatures, Instants, Sorceries, etc.
- Each bar uses the TYPE_COLORS already defined in the codebase

**Rarity Breakdown:**
- Common / Uncommon / Rare / Mythic with counts
- Colored dots (gray / silver / gold / orange-red)

### 5. Advisor Tab (EDHRec)
- Commander name input with "Look up" button
- Auto-loads if commander is set
- Recommendation cards in rows: name, type, CMC, synergy %, inclusion %, price
- "Add to deck" button per recommendation
- Existing `EdhrecTab` component — restyle to match design system (remove purple/neon inline styles)

### 6. AI Architect Tab
- Settings panel: bracket slider (1-5), strategy goals (multi-select chips), card pool mode (My Collection / Mix / All New)
- Chat interface with streaming responses
- Suggested cards extraction with "Append to deck" action
- Existing `AIChat` component — restyle to match design system (remove purple/neon inline styles)

## State Management

```typescript
type Tab = "cards" | "edhrec" | "ai";
type ViewMode = "list" | "art" | "artname";
type GroupBy = "section" | "type" | "color" | "cmc";
type SortBy = "name" | "price-desc" | "price-asc" | "cmc";
```

All combinations of Group × View × Sort are valid and composable. Controls are independent — changing one does not reset others.

## Data Requirements

The existing API response (`DeckDetailData`) provides everything needed:
- `deck.cards[]` with `cardName`, `section`, `quantity`, `price`, and `variant` (imageUri, typeLine, manaCost, colors, cmc, rarity)
- `totalValue`, `legality`

**New derived data (computed client-side):**
- Mana curve histogram from `variant.cmc`
- Color distribution from `variant.colors`
- Type breakdown from `variant.typeLine`
- Rarity counts from `variant.rarity`
- Featured card images for hero fan from first 5 cards with images

No API changes required.

## Key Implementation Notes

1. **Remove all inline purple/neon styles** — the current page has hardcoded `#7c3aed`, `#4f46e5`, `#2a1f4a`, `#0e0a1e` colors from an older design. Replace with design system tokens (`bg-surface`, `border-border`, `text-accent`, etc.)

2. **Import NavBar** — the current page has no NavBar. Import and render the shared NavBar component.

3. **Sidebar is sticky** — uses `position: sticky; top: 108px` (52px nav + 46px action bar + 10px gap) so it scrolls with the card list but stays visible.

4. **Hero card fan** — 3-5 cards with `transform: rotate()` and absolute positioning. Uses `art_crop` Scryfall images. Hover scales slightly. Falls back gracefully if no card images available.

5. **Mana cost symbols** — render `{W}`, `{U}`, `{B}`, `{R}`, `{G}` from `manaCost` string as colored circles with letter, matching MTG colors.

6. **ImportModal** — keep existing functionality, restyle to match design system (teal/slate instead of purple).

7. **Responsive** — sidebar collapses below card list on screens < 1024px. Hero height reduces to 180px on mobile.

## Scope

This spec covers only the `/decks/[id]` page. The deck editor (`/deck`) was already redesigned in a prior session.

## Mockup Reference

Full approved mockup: `.superpowers/brainstorm/15188-1775801199/content/deck-page-full.html`
