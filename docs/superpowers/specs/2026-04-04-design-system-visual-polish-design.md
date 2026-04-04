# Card Engine — Design System & Visual Polish

**Date:** 2026-04-04  
**Scope:** Global design system — tokens, typography, components, motion  
**Platforms:** Web (Next.js) + Mobile (React Native)

---

## Goal

A design system that any graphic designer would be proud of. Premium, distinctive, and unmistakably TCG — while being fully functional in both light and dark mode and translating cleanly across web and mobile. Nothing cookie-cutter.

---

## Direction: Adaptive Depth

The core concept: every card's UI container reflects the card's mana color identity. A blue card gets a blue tint and a blue glow on hover. A red/black card gets warm orange. This is unique to TCG apps and makes every card feel alive rather than interchangeable.

Light and dark are treated as equals — both exceptional, both complete. The same token system drives both modes.

---

## Typography

Three typefaces, each with a specific role:

| Role | Typeface | Use |
|---|---|---|
| Display | **Cinzel** | Deck names, page titles, section headers |
| Numeric | **Geist Mono** | All numbers: prices, counts, CMC, stats |
| UI | **Geist Sans** | Body text, labels, nav items, descriptions |

**Rationale:** Cinzel carries the Roman/fantasy authority of the game itself. Geist Mono makes data feel precise and cold against Cinzel's warmth. The tension is intentional — it's what a typographer would reach for.

**Scale:**

| Name | Size | Weight | Tracking | Font |
|---|---|---|---|---|
| Display | 28–36px | 700 | -0.01em | Cinzel |
| Heading | 18–22px | 700 | -0.01em | Cinzel |
| Subheading | 14px | 600 | 0 | Geist Sans |
| Body | 13px | 400 | 0 | Geist Sans |
| Caption | 11px | 500 | +0.01em | Geist Sans |
| Label | 10px | 700 | +0.10em | Geist Sans (uppercase) |
| Stat | 15–36px | 600–700 | -0.02em | Geist Mono |
| Eyebrow | 9px | 700 | +0.16em | Geist Sans (uppercase) |

---

## Color Tokens

### Light Mode

```
--bg:              #F6F2EC   /* Warm ivory — subtle parchment feel */
--surface:         #FDFAF6   /* Card and panel surfaces */
--surface-raised:  #FFFFFF   /* Elevated elements */
--surface-sunken:  #EDE7DC   /* Input wells, stat strips */
--border:          #DDD5C8
--border-strong:   #C4B49A

--text-primary:    #18150F
--text-secondary:  #6B5D4F
--text-muted:      #A8937C

--gold:            #C9A84C   /* Antiqued — not bright amber, not dark brown */
--gold-dim:        #8B7030
--gold-glow:       rgba(201,168,76,0.22)
```

### Dark Mode

```
--bg:              #0D0B09   /* True near-black, warm undertone */
--surface:         #161310
--surface-raised:  #1E1A16
--surface-sunken:  #0A0807
--border:          #2A2420
--border-strong:   #3D352C

--text-primary:    #F2ECE4
--text-secondary:  #A89880
--text-muted:      #665A4A

--gold:            #C9A84C   /* Same gold — works on both modes */
--gold-dim:        #8B7030
--gold-glow:       rgba(201,168,76,0.20)
```

### Per-Section Tab Colors (unchanged from current)

```
Collection:  #059669 / bg #ECFDF5  (dark: #34D399 / #064E3B)
Decks:       #7C3AED / bg #F5F3FF  (dark: #A78BFA / #2E1065)
Scan:        #E11D48 / bg #FFF1F2  (dark: #FB7185 / #4C0519)
Map:         #0284C7 / bg #E0F2FE  (dark: #38BDF8 / #0C4A6E)
Alerts:      #D97706 / bg #FFFBEB  (dark: #FBBF24 / #451A03)
```

### Mana Identity Tints

Applied to card container backgrounds and borders. Light and dark variants:

| Identity | Light tint | Light border | Dark tint | Dark border | Glow color |
|---|---|---|---|---|---|
| W (White) | #FFFDF0 | #EDD87A | #1A1708 | #5C4E10 | rgba(234,179,8,0.18) |
| U (Blue) | #EFF6FF | #93C5FD | #091524 | #1E3A5F | rgba(59,130,246,0.18) |
| B (Black) | #F5F3F8 | #C4B5D4 | #100D18 | #2D1B4E | rgba(109,40,217,0.14) |
| R (Red) | #FFF5F2 | #FCA5A5 | #1A0A07 | #5C1A1A | rgba(239,68,68,0.18) |
| G (Green) | #F0FBF3 | #86EFAC | #081409 | #14532D | rgba(34,197,94,0.18) |

Multi-color cards: use the tint of the first color in the card's `colorIdentity` array for 2-color cards. For 3+ color (gold) cards, use a neutral warm gold tint (`#FFFBF0` light / `#1A1608` dark) with a gold border — matching the "gold card" convention from the game itself.

---

## Set Symbol Rarity System

### Concept

Replace generic geometric rarity dots/shapes with the actual Magic set symbol for each card's set. The symbol is colored by rarity — matching the physical card convention exactly.

| Rarity | Color | Effect |
|---|---|---|
| Mythic Rare | `#FB923C` | Drop-shadow glow, pulsing animation |
| Rare | `#C9A84C` | Subtle drop-shadow glow |
| Uncommon | `#94A3B8` | No glow |
| Common | `#6B7280` | No glow, reduced opacity |

### Implementation

Scryfall hosts every MTG set symbol as an SVG at:
```
https://svgs.scryfall.io/sets/{setCode}.svg
```

This covers all sets: Standard, Modern, Legacy, Commander precons, Secret Lair, Universes Beyond (Spider-Man, Marvel, Lord of the Rings, Fallout, etc.), and any future releases.

**Web approach:**
1. Fetch the SVG by set code (available on the card data already in the local store)
2. Parse and inject `fill` color based on rarity
3. Render inline so CSS filters apply for the mythic glow
4. Cache aggressively — these SVGs never change

**Mobile approach:** Same fetch + inject pattern, rendered via `react-native-svg`

**Component:**
```tsx
<SetSymbol setCode="stx" rarity="rare" size={14} />
```

The component handles fetching, caching, fill injection, and glow animation internally.

### Placement

- **Card grid (art view):** Bottom-right corner overlay on the card thumbnail — 22×22px dark pill background, symbol at 14px
- **Card grid (list/name view):** Inline in the card row alongside card name
- **Card detail page:** Prominent display next to set name in the header
- **Collection badges:** Replaces the current rarity badge shape, keeps the text label

---

## Component Specifications

### Card Container (Collection / Deck grid)

```
Background: linear-gradient(145deg, surface-raised, identity-tint)
Border: 1.5px solid identity-border
Border-radius: 12px
Box-shadow: identity-aware shadow (2px 8px with identity glow color at low opacity)

On hover:
  transform: translateY(-5px) scale(1.03)
  transition: cubic-bezier(0.34, 1.56, 0.64, 1) 220ms
  box-shadow: 0 16px 40px {identity-glow-color at 0.35}, 0 4px 12px {at 0.2}
  Shimmer sweep: linear-gradient at 125° sweeps across card face
```

### Rarity Badge

```
Shape: rounded rectangle (border-radius: 5px), not pill
Icon: SetSymbol component at 10px (left of text)
Text: rarity name in uppercase, 10px, weight 800, tracking +0.06em
Background: rarity color at 10–12% opacity
Border: rarity color at 28–30% opacity
Box-shadow (mythic/rare only): 0 1px 4px at 20% opacity, inset highlight
```

### Sidebar Navigation

```
Active item:
  Font-weight: 700
  Left edge: 3px colored bar (section's tab color)
  Background: extends 12px past the sidebar's right border into the main content panel
    (creates a spatial "lift" — the active item appears to bridge both panes)
  Transition: 150ms ease
```

### Deck Header Stat Strip

Replaces the plain "116 cards · $0.00" pattern with:

```
┌─────────┬──────────┬──────────┬──────────┐
│   116   │   4.1    │    12    │    3     │
│  CARDS  │ AVG CMC  │  RARES   │ MYTHICS  │
└─────────┴──────────┴──────────┴──────────┘

Numbers: Geist Mono, 15px, weight 600
Labels: Geist Sans, 9px, uppercase, muted
Background: surface-sunken
Border: border color, 1px
Dividers: vertical 1px border between cells
```

### NavBar / Topbar

```
Background: surface at 88–92% opacity
Backdrop-filter: blur(16px) saturate(1.4)
Border-bottom: 1px border
Logo mark: 30×30px, gold gradient, box-shadow with gold glow
```

### Buttons

| Variant | Background | Use |
|---|---|---|
| Primary | Deck purple gradient | Main CTA (Import, Save) |
| Gold | Gold gradient | Collection actions (Add, Watch) |
| Secondary | Surface raised + border | Secondary actions |
| Ghost | Transparent + border | Tertiary / cancel |

---

## Motion System

All motion is intentional — every animation has a reason.

| Name | Behavior | Duration | Easing |
|---|---|---|---|
| Card Lift | translateY(-5px) scale(1.03) on hover | 220ms | cubic-bezier(0.34, 1.56, 0.64, 1) — springy |
| Identity Glow | Colored box-shadow expands on hover | 220ms | ease |
| Shimmer Sweep | Linear gradient at 125° sweeps across card | 600ms | ease (on hover) |
| Mythic Pulse | Set symbol glow oscillates 8px → 16px | 2s | ease-in-out infinite |
| Page Cascade | Cards slide up with 30ms stagger | 400ms | ease-out |
| Skeleton Shimmer | Existing warm gradient sweep on loading | 1.5s | ease-in-out infinite (keep as-is) |
| Nav Bleed | Active indicator slides in from left edge | 150ms | ease |

---

## Implementation Scope

### Files to modify

**Design tokens:**
- `apps/web/src/app/globals.css` — full token update (backgrounds, gold, identity tints, shadows)

**Components (web):**
- `apps/web/src/components/ui/Badge.tsx` — rarity badge redesign
- `apps/web/src/components/ui/Button.tsx` — new variants
- `apps/web/src/components/ui/Card.tsx` — identity tint support
- `apps/web/src/components/ui/NavBar.tsx` — active bleed, logo update
- `apps/web/src/components/ui/SetSymbol.tsx` — **new component**

**Pages (web):**
- `apps/web/src/app/layout.tsx` — Cinzel font import
- `apps/web/src/app/collection/page.tsx` — identity tints on card grid, new badge
- `apps/web/src/app/card/[variantId]/page.tsx` — set symbol in header, stat strip
- `apps/web/src/app/deck/page.tsx` — stat strip, identity tints
- `apps/web/src/app/page.tsx` — typography update

**Mobile (in scope):**
- Equivalent token constants file for React Native (mirrors CSS vars as JS object)
- `SetSymbol` component using `react-native-svg` with same fetch + inject logic
- Identity tint styles applied to card containers in the mobile collection/deck views

### Out of scope

- Page layout restructuring (sidebar vs horizontal nav)
- New features or data model changes
- Admin page styling

---

## Success Criteria

- Both light and dark modes look polished and complete — not like one is an afterthought
- A designer unfamiliar with the codebase can see the token system and immediately understand it
- Set symbols render correctly for at least: standard recent sets, Universes Beyond sets (Marvel, LotR, Fallout), Commander precons, Secret Lair
- Card hover interaction feels physically satisfying — the spring + glow combination should feel like picking up a card
- Cinzel headings + Geist Mono numbers read as a deliberate typographic choice, not a default
