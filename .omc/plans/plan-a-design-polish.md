# Plan A: Card Engine Design Polish

**Scope:** Visual consistency, component standardization, animation fixes, responsive design, empty/loading states, component decomposition. No new features — pure polish.

**Codebase:** `/Users/carterchurch/card-engine-platform/apps/web/src/`
**Stack:** Next.js 16, React 19, Tailwind v4, dark slate + teal theme
**Pages:** 19 routes (complete inventory below)

**Sizing:** ~M-L effort, estimated 3-5 focused sessions

---

## Complete Page Inventory (19 pages)

| Page | File | Lines | Has Hex Colors | Has JS Hover |
|------|------|-------|---------------|-------------|
| Landing | `app/page.tsx` | ~200 | 27 | Yes |
| Login | `app/login/page.tsx` | 164 | 1 | No |
| Register | `app/register/page.tsx` | ~160 | 1 | No |
| Collection | `app/collection/page.tsx` | 341 | 0 | No |
| Decks list | `app/decks/page.tsx` | ~120 | 14 | Yes |
| Deck builder | `app/deck/page.tsx` | 1439 | 0* | Yes |
| Deck detail | `app/decks/[id]/page.tsx` | 319 | 11 | No |
| Deck share | `app/decks/[id]/share/page.tsx` | ~100 | 1 | No |
| Deck discover | `app/deck/discover/page.tsx` | ~100 | 0 | No |
| Card detail | `app/cards/[id]/page.tsx` | ~300 | 30 | Yes |
| Card variant | `app/card/[variantId]/page.tsx` | 1214 | 11 | Yes |
| Scan | `app/scan/page.tsx` | 864 | 3 | No |
| Life | `app/life/page.tsx` | 666 | 17 | No |
| Map | `app/map/page.tsx` | 454 | 0 | No |
| Shops | `app/shops/page.tsx` | ~300 | 19 | No |
| Watchlist | `app/watchlist/page.tsx` | 361 | 0 | No |
| Settings | `app/settings/page.tsx` | 206 | 0 | No |
| Profile | `app/profile/page.tsx` | ~200 | 10 | No |
| Admin | `app/admin/page.tsx` | 341 | 0 | No |

**Key non-page files with hex colors:**
| File | Hex Count |
|------|-----------|
| `decks/NewDeckWizard.tsx` | 75 |
| `decks/[id]/AIArchitectTab.tsx` | 52 |
| `decks/[id]/deck-helpers.ts` | 17 |
| `decks/[id]/HeroBanner.tsx` | 16 |
| `decks/[id]/CardListPanel.tsx` | 9 |
| `decks/[id]/DeckSidebar.tsx` | 8 |
| `components/Sidebar.tsx` | 10 |
| `components/ui/CardImage.tsx` | 6 |
| `components/NetworkError.tsx` | 4 |
| `components/ui/Button.tsx` | 2 |
| `lib/identity.ts` | 4 |

**Total hardcoded hex instances:** ~368 across 23 files

**JS hover files (10 total):**
1. `app/page.tsx`
2. `app/deck/page.tsx`
3. `app/decks/page.tsx`
4. `app/card/[variantId]/page.tsx`
5. `app/cards/[id]/page.tsx`
6. `app/decks/NewDeckWizard.tsx`
7. `app/decks/[id]/AIArchitectTab.tsx`
8. `app/decks/[id]/CardListPanel.tsx`
9. `components/HoloCard.tsx` (functional — 3D tilt needs JS mouse position, KEEP)
10. `components/Sidebar.tsx`

**Note:** `HoloCard.tsx` uses `onMouseMove`/`onMouseLeave` for 3D tilt tracking — this is functional, not styling. Keep JS, don't convert to CSS.

---

## Phase 1: Foundation [Size: S]

Lock design tokens and shared components before touching pages.

### 1.1 Audit and lock design tokens
- **File:** `app/globals.css`
- Add missing tokens for brand colors: `--brand-discord: #5865F2`
- Add missing surface variants: `--surface-2` (used in life page as `bg-surface-2`)
- Add missing accent colors: `--color-neon`, `--color-gold`, `--color-pink` (used in life page)
- Add `--border-neon` token
- Define canonical spacing: `max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8` for content pages
- Map all new tokens into `@theme inline` block for Tailwind v4 usage

### 1.2 Define ALL missing CSS classes
- **File:** `app/globals.css`

**Animation classes (15 total from life page + 1 from decks):**
1. `.glass` — backdrop-blur glass-morphism utility
2. `.skeleton` — shimmer animation (NOTE: `<Skeleton>` component exists in `components/ui/Skeleton.tsx` using `animate-shimmer`. The `.skeleton` bare CSS class is used in `cards/[id]/page.tsx:46`. Either migrate to `<Skeleton>` component or add CSS class. Prefer migration.)
3. `.life-shake` — small shake on life change
4. `.life-shake-big` — larger shake on big life change (5+)
5. `.life-pulse-red` — red pulse on damage
6. `.life-pulse-red-big` — larger red pulse
7. `.life-pulse-green` — green pulse on heal
8. `.life-pulse-green-big` — larger green pulse
9. `.poison-drip` — dripping effect for poison counters
10. `.time-alert-flash` — flashing for timer alerts
11. `.turn-active` — glow/highlight for active player turn

**Tailwind utility tokens to add to `@theme inline`:**
12. `bg-surface-2` — needs `--color-surface-2` in theme
13. `text-neon` — needs `--color-neon` in theme
14. `text-gold` — needs `--color-gold` in theme
15. `text-pink` — needs `--color-pink` in theme
16. `border-neon` — needs `--color-border-neon` in theme

### 1.3 Extend shared component library

**EmptyState** — new `components/ui/EmptyState.tsx`
- Props: `icon`, `title`, `description`, `actionLabel`, `onAction`

**LoadingState** — extend existing `components/ui/Skeleton.tsx`
- The `Skeleton`, `SkeletonCard`, `SkeletonLine` components already exist
- Add: `SkeletonGrid` (configurable rows/cols), `LoadingSpinner` variant, `ProgressBar` variant
- Do NOT create a separate `LoadingState.tsx` — extend the existing Skeleton module

**FormCard** — new `components/ui/FormCard.tsx`
- Props: `title`, `description`, `children`, `footer`

### 1.4 Migrate bare `.skeleton` CSS class usage
- `cards/[id]/page.tsx:46` uses `className="skeleton"` — replace with `<Skeleton>` component import

**Acceptance criteria:**
- [ ] All 16 missing CSS classes/tokens defined in `globals.css`
- [ ] `@theme inline` block includes `surface-2`, `neon`, `gold`, `pink`, `border-neon`
- [ ] EmptyState and FormCard components created
- [ ] Skeleton module extended with SkeletonGrid + LoadingSpinner
- [ ] Zero bare `.skeleton` CSS class usage (all migrated to `<Skeleton>` component)
- [ ] `npm run build` passes

---

## Phase 2: Component Sweep [Size: M]

Replace hardcoded values and enforce component usage across ALL 23 files.

### 2.1 Replace hardcoded hex colors with design tokens

**Strategy:** Many hex values are format/mana/market colors already defined as CSS variables in `globals.css`. Map them:
- Format colors → `var(--format-*)` or Tailwind equivalents
- Mana colors → `var(--mana-*)` tokens
- Market colors → `var(--market-*)` tokens
- UI colors → design token variables

**All files requiring changes (23 files, ~368 instances):**

High count (>15):
- `decks/NewDeckWizard.tsx` (75) — format/mana colors
- `decks/[id]/AIArchitectTab.tsx` (52) — UI colors
- `cards/[id]/page.tsx` (30) — price/market colors
- `app/page.tsx` (27) — hero section colors
- `shops/page.tsx` (19) — shop category colors
- `life/page.tsx` (17) — player colors
- `decks/[id]/deck-helpers.ts` (17) — color identity mapping
- `decks/[id]/HeroBanner.tsx` (16) — format gradient colors
- `decks/page.tsx` (14) — format colors

Medium count (5-15):
- `card/[variantId]/page.tsx` (11)
- `decks/[id]/page.tsx` (11)
- `components/Sidebar.tsx` (10)
- `profile/page.tsx` (10)
- `decks/[id]/CardListPanel.tsx` (9)
- `decks/[id]/DeckSidebar.tsx` (8)
- `components/ui/CardImage.tsx` (6)

Low count (<5):
- `lib/identity.ts` (4)
- `components/NetworkError.tsx` (4)
- `scan/page.tsx` (3)
- `components/ui/Button.tsx` (2) — gradient hex values
- `register/page.tsx` (1)
- `login/page.tsx` (1)
- `decks/[id]/share/page.tsx` (1)

**Verification:** `grep -rn '#[0-9a-fA-F]\{3,8\}' src/ --include="*.tsx" --include="*.ts" | grep -v globals.css | grep -v node_modules` returns zero matches.

**Note:** The grep pattern will also match CSS custom property definitions and hex in comments. Refine to exclude those: `grep -rn "style=\|className=" src/ --include="*.tsx" | grep '#[0-9a-fA-F]\{3,8\}'` for inline style hex, and visually verify remaining.

### 2.2 Enforce Button component usage
All pages with inline styled buttons/divs acting as buttons:
- `app/page.tsx` — hero CTA buttons
- `life/page.tsx` — game control buttons
- `scan/page.tsx` — capture/action buttons
- `map/page.tsx` — form submit buttons
- `login/page.tsx` — Discord OAuth button
- `register/page.tsx` — form submit
- `shops/page.tsx` — add shop button
- `decks/NewDeckWizard.tsx` — wizard navigation buttons
- `settings/page.tsx` — save/danger zone buttons

### 2.3 Convert JS hover effects to CSS (9 files, exclude HoloCard)
**Styling hovers (convert to CSS `hover:`):**
1. `app/page.tsx` — feature card hover color
2. `app/decks/page.tsx` — deck card hover border
3. `app/cards/[id]/page.tsx` — card section hover
4. `app/card/[variantId]/page.tsx` — section hover
5. `app/decks/NewDeckWizard.tsx` — option hover
6. `app/decks/[id]/AIArchitectTab.tsx` — suggestion hover
7. `app/decks/[id]/CardListPanel.tsx` — card row hover
8. `components/Sidebar.tsx` — menu item hover
9. `app/deck/page.tsx` — panel hover effects

**Functional hovers (KEEP JS):**
- `components/HoloCard.tsx` — 3D tilt requires JS mouse position tracking

### 2.4 Standardize page layout spacing
Apply `max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8` to content pages:
- Collection, Decks, Watchlist, Settings, Profile, Admin, Shops, Card detail, Card variant

Exceptions (keep custom):
- Landing (custom hero layout)
- Map (full-bleed split view)
- Life (full-screen game)
- Scan (split camera + sidebar)
- Deck builder (custom panels)

**Acceptance criteria:**
- [ ] Zero hardcoded hex in `.tsx`/`.ts` files outside `globals.css` (verified by grep)
- [ ] All clickable elements use `<Button>` component
- [ ] Zero `onMouseEnter`/`onMouseLeave` for purely styling hover effects (HoloCard exempt)
- [ ] Consistent `max-w-6xl` layout on 9 content pages
- [ ] `npm run build` passes

---

## Phase 3: Component Decomposition [Size: M-L]

Break monolithic files. Target: no page file over 250 lines.

### 3.1 Decompose Deck builder (1439 lines — LARGEST FILE)
- **File:** `app/deck/page.tsx`
- Extract: `DeckBuilder.tsx`, `CardSearchPanel.tsx`, `DeckStats.tsx`, `RecommendationsPanel.tsx`, `DeckHeader.tsx`
- Extract state into `useDeckBuilder.ts` reducer hook
- Each sub-component under 250 lines
- **Risk:** Complex state coupling between card search, deck contents, and recommendations
- **Test:** Full deck build flow — add cards, remove cards, get recommendations, save

### 3.2 Decompose Card variant page (1214 lines)
- **File:** `app/card/[variantId]/page.tsx`
- Extract: `PriceChart.tsx`, `CardDetails.tsx`, `PrintingsTable.tsx`, `MarketLinks.tsx`
- Each under 250 lines
- **Test:** Price display, printing selection, market link navigation

### 3.3 Decompose Scan page (864 lines)
- **File:** `app/scan/page.tsx`
- Extract: `CameraView.tsx`, `ScanSidebar.tsx`, `CardPicker.tsx`, `ManualSearch.tsx`
- Move 14+ useState calls into `useScanState.ts` reducer hook
- Each under 250 lines
- **Risk:** Camera stream and OCR state tightly coupled
- **Test:** Camera start/stop, scan card, manual search, add to collection

### 3.4 Decompose Life tracker (666 lines)
- **File:** `app/life/page.tsx`
- **Note:** `GameSetup` and `PlayerPanel` already exist as inline function components — extract to separate files, don't rewrite
- Extract to files: `GameSetup.tsx`, `PlayerPanel.tsx`, `CommanderDamage.tsx`, `GameTimer.tsx`
- Move reducer to `useGameState.ts` hook file
- Each under 250 lines
- **Test:** 2-player game, 4-player Commander, timer, poison counters

### 3.5 Decompose supporting files (>500 lines)
- `decks/NewDeckWizard.tsx` (521 lines) — Extract step components: `FormatStep.tsx`, `DetailsStep.tsx`, `CommanderStep.tsx`
- `decks/[id]/AIArchitectTab.tsx` (512 lines) — Extract: `RecommendationCard.tsx`, `SwapSuggestion.tsx`, `AIChat.tsx`

**Acceptance criteria:**
- [ ] `deck/page.tsx` under 250 lines
- [ ] `card/[variantId]/page.tsx` under 250 lines
- [ ] `scan/page.tsx` under 250 lines
- [ ] `life/page.tsx` under 250 lines
- [ ] `NewDeckWizard.tsx` under 250 lines
- [ ] `AIArchitectTab.tsx` under 250 lines
- [ ] All functionality preserved — zero regressions
- [ ] Custom hooks extracted for complex state (deck builder, scanner, game)
- [ ] `npm run build` passes

---

## Phase 4: Page-Level Polish [Size: M]

### 4.1 Empty states with CTAs

All use shared `<EmptyState>` component:
| Page | Title | CTA |
|------|-------|-----|
| Collection | "No cards in your collection" | "Scan your first card" → /scan |
| Decks | "No decks yet" | "Create your first deck" → new deck wizard |
| Watchlist | "No price alerts" | "Add a price alert" → add form |
| Map/Shops | "No shops nearby" | "Search a different area" → search input |
| Scan sidebar | "No cards scanned yet" | "Point your camera at a card" |
| Admin | "No data" | Appropriate admin CTA |

### 4.2 Loading states standardized

All use extended `<Skeleton>` module:
| Page | Pattern |
|------|---------|
| Collection | `<SkeletonGrid cols={3} rows={3} />` |
| Decks | `<SkeletonGrid cols={3} rows={2} />` |
| Watchlist | `<SkeletonLine count={5} />` |
| Map | `<LoadingSpinner />` overlay |
| Settings | `<SkeletonLine count={4} />` |
| Card detail | `<SkeletonCard />` single |
| Deck detail | Full page skeleton |

### 4.3 Form validation
- Login/Register: email format, password length (8+ chars)
- Settings: field-level error messages below inputs
- Watchlist: price must be positive number
- Map/Shops: required field indicators, validation messages

### 4.4 Modal and overlay accessibility
- Scan card picker: add `role="dialog"`, `aria-modal="true"`, focus trap, Escape to close, click-outside
- Watchlist add form: proper modal with backdrop, same a11y
- Map add-shop: slide-out panel or modal, same a11y
- All modals: return focus to trigger element on close

**Acceptance criteria:**
- [ ] Every async page has `<EmptyState>` with actionable CTA
- [ ] Every async page has `<Skeleton>`-based loading state
- [ ] All forms validate on client side with visible error messages
- [ ] All modals have focus trap, Escape key, `role="dialog"`, `aria-modal`
- [ ] `npm run build` passes

---

## Phase 5: Landing Page + Responsive [Size: S-M]

### 5.1 Responsive hero
- Replace `gridTemplateColumns: "1fr 1fr"` with `grid grid-cols-1 lg:grid-cols-2`
- Mobile: text stacks above floating card visual
- Replace ALL 27 hardcoded hex colors with tokens (done in Phase 2, verify here)

### 5.2 CTAs and buttons
- Replace inline styled CTAs with `<Button variant="primary" size="lg">`
- Consistent with design system hover/active states

### 5.3 Feature cards
- Replace templated descriptions with specific feature copy
- Add appropriate icons per feature
- Use `.stagger-*` classes for entrance animation

### 5.4 Mobile-first pass across all pages
- Test every page at 375px, 768px, 1024px, 1440px
- Fix: Map sidebar (not mobile-friendly), Life tracker layout, Landing hero
- Ensure 44px minimum touch targets on mobile
- Target CLS < 0.1 on landing page

**Acceptance criteria:**
- [ ] Landing page renders correctly at 375px
- [ ] All pages functional at 375px width
- [ ] Zero layout shifts above 0.1 CLS on landing
- [ ] All touch targets 44px minimum on mobile
- [ ] `npm run build` passes

---

## Testing Strategy

### During execution
- `npm run build` after every phase (TypeScript catches regressions)
- Start dev server and visually verify each changed page

### After Phase 2 (token migration)
- Check every page in browser for color contrast issues
- Verify dark backgrounds still work (token values match original hex)

### After Phase 3 (decomposition)
- **Deck builder:** Create deck → add cards → get recommendations → save
- **Scan:** Start camera → scan card → manual search → add to collection
- **Life:** 2-player game → 4-player Commander → timer → poison → commander damage
- **Card variant:** View card → check prices → switch printings → market links

### After Phase 5 (responsive)
- Chrome DevTools device toolbar: iPhone SE (375px), iPad (768px), Desktop (1440px)
- Every page should be functional (not just visible) at 375px

### Rollback
- Git commit after each phase completes
- If decomposition breaks something, revert that phase's commit and diagnose

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Token migration breaks color contrast | High | Visual review per page; hex values match original |
| Deck builder decomposition (1439 lines) breaks state | High | Map all state dependencies before extracting; test full flow |
| Scan decomposition breaks camera/OCR | High | Test camera flow end-to-end; OCR state is tightly coupled |
| 368 hex replacements introduce typos | Medium | Grep verification after completion; build check |
| Responsive changes break desktop layouts | Medium | Test at 1440px after every responsive change |

---

## Execution Strategy

- **Phase 1**: Sequential (foundation must be complete first)
- **Phase 2**: Can parallelize by file (2-3 agents on different file groups)
- **Phase 3**: Decompositions are independent — deck, card variant, scan, life, wizard, AI tab can all run in parallel (6 parallel agents)
- **Phase 4**: Depends on Phases 1-3
- **Phase 5**: Landing page portion can overlap with Phase 4; responsive pass needs Phase 4 complete
- **Commit after each phase**

---

## Verification Commands

```bash
# After Phase 1: Check all CSS classes are defined
grep -oE '(glass|life-shake|life-pulse|poison-drip|time-alert|turn-active)[a-z-]*' app/life/page.tsx | while read cls; do grep -q "$cls" app/globals.css && echo "OK: $cls" || echo "MISSING: $cls"; done

# After Phase 2: Zero hardcoded hex outside globals.css
grep -rn '#[0-9a-fA-F]\{3,8\}' src/ --include="*.tsx" --include="*.ts" | grep -v globals.css | grep -v '\/\/' | wc -l

# After Phase 3: File sizes
wc -l app/deck/page.tsx app/card/\[variantId\]/page.tsx app/scan/page.tsx app/life/page.tsx app/decks/NewDeckWizard.tsx app/decks/\[id\]/AIArchitectTab.tsx

# After all: Build check
npm run build
```
