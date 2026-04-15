# Plan B: Card Engine Feature Work

**Scope:** New features for incomplete pages — Watchlist, Settings, Map, Life, Navigation. Includes backend prerequisites. Use Gemini for UI generation.

**Depends on:** Plan A (design polish) should be complete first. Shared components (EmptyState, extended Skeleton, FormCard, Button) and design tokens must be in place.

**Codebase:** `/Users/carterchurch/card-engine-platform/apps/web/src/`  
**API:** `/Users/carterchurch/card-engine-platform/apps/api/`  
**Stack:** Next.js 16, React 19, Tailwind v4, Supabase backend

**Sizing:** L-XL effort, estimated 5-8 focused sessions

---

## Feature 1: Watchlist Enhancements [Size: L]

### 1.1 Backend prerequisites
- **Price history API:** Create `/v1/prices/history?variantId=X&days=30` endpoint in `apps/api/`
  - Returns array of `{ date, price, market }` entries
  - Source: periodic price snapshot storage (needs cron job or Supabase function to capture daily prices)
  - If no historical data exists yet, seed with current price as single data point
- **Card name enrichment:** Fix the incomplete lookup at `watchlist/page.tsx:84-93`
  - Use Scryfall API to resolve `variantId` → card name + image
  - Cache results in Supabase or local storage to avoid repeated API calls
- **Alert CRUD:** Ensure API supports PUT (edit) and DELETE (remove) for watchlist alerts

### 1.2 Frontend — Price sparkline component
- **Use Gemini** to generate a `PriceSparkline.tsx` component
- **Gemini prompt context:** Provide design tokens (dark slate bg, teal accent, text colors), existing Badge/Card component patterns, and specify: "SVG sparkline, 100px wide, 30px tall, shows 7-30 day trend, green for up, red for down, teal for flat. No external charting library — pure SVG path."
- Integrate into watchlist card items
- Show "No history" placeholder if only one data point

### 1.3 Frontend — Alert management
- Edit button on each alert → opens pre-filled form
- Delete button with confirmation dialog
- Triggered alerts section with timestamps and "dismiss" action
- Use `<FormCard>` wrapper for edit form

### 1.4 Frontend — Card name display fix
- Replace variantId fallback (line 339) with resolved card name
- Show card image thumbnail in alert list
- Loading state while name resolves

**Acceptance criteria:**
- [ ] Price history endpoint returns data for any tracked card
- [ ] Sparkline renders inline on each watchlist card
- [ ] Card names display correctly (zero variantId fallbacks visible)
- [ ] Alerts can be edited (price threshold, direction)
- [ ] Alerts can be deleted with confirmation
- [ ] Triggered alerts show with timestamps

---

## Feature 2: Settings Page Expansion [Size: L]

### 2.1 Backend prerequisites
- **Avatar storage:** Create Supabase storage bucket `avatars` with RLS policy (users can only access own avatar)
- **Avatar URL column:** Add `avatar_url` column to `profiles` table (or verify it exists)
- **Password change:** Supabase Auth supports `updateUser({ password })` — verify the API client is configured
- **Notification preferences:** Add `notification_prefs` JSONB column to `profiles` table: `{ emailAlerts: boolean, pushAlerts: boolean, priceAlerts: boolean, weeklyDigest: boolean }`

### 2.2 Frontend — Avatar upload
- **Use Gemini** to generate avatar upload UI
- **Gemini prompt context:** Provide design tokens, existing Input/Button components, and specify: "Circular avatar with camera icon overlay on hover. Click opens file picker. Shows upload progress. Accepts jpg/png under 2MB. Dark slate surface background, teal accent ring on hover."
- Upload to Supabase storage, save URL to profile
- Show initials fallback when no avatar set
- Crop/resize client-side before upload (canvas API, no extra deps)

### 2.3 Frontend — Password change form
- Current password + new password + confirm new password
- Client-side validation: min 8 chars, passwords match
- Use `<FormCard>` wrapper
- Success/error feedback inline
- Place in "Security" section below profile info

### 2.4 Frontend — Notification preferences
- Toggle switches for: email alerts, push notifications, price alerts, weekly digest
- Use `<FormCard>` wrapper for the section
- Save on toggle (optimistic update with revert on error)

### 2.5 Frontend — Email verification status
- Badge next to email: green "Verified" or yellow "Unverified"
- If unverified, show "Resend verification" button
- Use existing `<Badge>` component variants

**Acceptance criteria:**
- [ ] Avatar uploads and displays on profile + NavBar
- [ ] Password can be changed with proper validation
- [ ] Notification toggles save and persist
- [ ] Email verification status shown with resend option
- [ ] All sections use `<FormCard>` wrapper
- [ ] All form validation shows inline errors

---

## Feature 3: Map/Shops Mobile Improvements [Size: M]

### 3.1 Backend prerequisites
- **Shop metadata:** Verify shops table has `type` (LGS, big box, online), `hours` (JSONB), `favorited_by` (array or join table) columns — add if missing
- **Favorites API:** Endpoint to toggle shop favorite status per user

### 3.2 Frontend — Mobile sidebar drawer
- **Use Gemini** to generate a `ShopDrawer.tsx` component
- **Gemini prompt context:** Provide design tokens and specify: "Slide-up drawer from bottom on mobile (<768px). Full sidebar on desktop. Glass-morphism backdrop. Drag handle at top. Smooth spring animation. Dark slate surface, teal accent on active tab."
- Replace fixed `w-80` sidebar with responsive: drawer on mobile, sidebar on desktop
- Drawer shows shop list, search, filters
- Tap shop in drawer → drawer minimizes, map centers on shop

### 3.3 Frontend — Shop filtering
- Filter chips: All, LGS, Big Box, Online
- Active filter highlighted with tab color
- Filter persists during session

### 3.4 Frontend — Working hours display
- Show hours in shop detail popup/card
- Format: "Open now" (green) / "Closed" (red) / "Hours not available" (muted)
- Use existing `<Badge>` component

### 3.5 Frontend — Shop favorites
- Heart/star icon on each shop card
- Favorites tab in sidebar/drawer
- Persist via API

**Acceptance criteria:**
- [ ] Map sidebar is a slide-up drawer on mobile (<768px)
- [ ] Shop type filters work (LGS, big box, online)
- [ ] Working hours display in shop cards (or "not available" fallback)
- [ ] Shops can be favorited/unfavorited
- [ ] Favorites persist across sessions

---

## Feature 4: Life Tracker Enhancements [Size: M]

### 4.1 No backend prerequisites (all client-side)

### 4.2 Frontend — Custom player colors
- Color picker in GameSetup phase
- 8-12 preset colors + optional custom hex input
- Selected color applies to player panel border, name, and life total
- Colors persist in localStorage for next game

### 4.3 Frontend — Game history
- Save completed game state to localStorage: players, final life totals, winner, duration, date
- History page/section accessible from Life main screen
- Show last 20 games in a list
- Tap to see game summary (players, life totals, commander damage)

### 4.4 Frontend — Sound effects (optional, behind toggle)
- Web Audio API — no external deps
- Sounds: life gain (soft chime), life loss (thud), elimination (dramatic), timer alert (bell)
- Toggle in game settings: "Sound effects: On/Off"
- Respect device silent mode

**Acceptance criteria:**
- [ ] Players can pick custom colors in setup
- [ ] Colors apply to player panels during game
- [ ] Completed games saved to history (localStorage)
- [ ] History shows last 20 games with summary
- [ ] Sound effects play on life changes (when enabled)
- [ ] Sound toggle works and persists

---

## Feature 5: Navigation Improvements [Size: M]

### 5.1 Frontend — Profile dropdown in NavBar
- Avatar + name in top-right (or integrated into existing NavBar)
- Dropdown menu: Profile, Settings, Logout
- Click outside to close
- Show avatar from Supabase (depends on Feature 2 avatar)
- Initials fallback when no avatar

### 5.2 Frontend — Mobile navigation enhancement
- Current: icons-only bottom bar
- Add: labels below icons on wider mobile (>400px)
- Add: "More" menu for overflow items (Admin, Profile, Settings)
- Ensure active state is clearly visible

### 5.3 Frontend — Breadcrumbs on detail pages
- `components/ui/Breadcrumbs.tsx` — new shared component
- Show on: Card detail, Card variant, Deck detail, Deck share
- Format: `Home > Decks > [Deck Name]` or `Home > Cards > [Card Name]`
- Truncate long names with ellipsis

**Acceptance criteria:**
- [ ] Profile dropdown in NavBar with avatar, links, logout
- [ ] Mobile nav shows labels on wider screens
- [ ] Overflow menu for secondary nav items
- [ ] Breadcrumbs on all detail pages
- [ ] All navigation elements accessible (keyboard, screen reader)

---

## Gemini Integration Process

### When to use Gemini
- UI component generation for new features (PriceSparkline, ShopDrawer, AvatarUpload)
- NOT for refactoring existing code or token migration

### Prompt template
```
Generate a React component for [COMPONENT_NAME].

Design system:
- Background: #0F1117 (main), #161B27 (surface), #1E2535 (raised)
- Text: #E2E8F0 (primary), #94A3B8 (secondary), #475569 (muted)
- Accent: #0D9488 (teal), #14B8A6 (hover), #2DD4BF (text accent)
- Shadows: layered dark shadows for depth
- Font: Geist Sans, Geist Mono for code
- Animations: 150ms transitions, cubic-bezier easing

Requirements: [SPECIFIC REQUIREMENTS]

Use Tailwind CSS v4 classes. Use CSS custom properties from the design system (var(--bg), var(--surface), var(--accent), etc.) for colors. TypeScript with proper prop types. No external dependencies unless specified.
```

### Review checklist for Gemini output
1. Uses design tokens (CSS variables), not hardcoded hex
2. Uses existing components (Button, Badge, Card) where appropriate
3. TypeScript types are correct
4. Responsive (works at 375px)
5. Accessible (ARIA labels, keyboard navigation)
6. No unnecessary dependencies added

### Fallback
If Gemini output is unusable or doesn't match design system, implement manually using existing component patterns as reference.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Price history API needs data that doesn't exist yet | High | Start with single-point "current price" fallback; add cron for daily snapshots |
| Supabase storage bucket setup requires admin access | Medium | Document exact bucket config; can be done via Supabase dashboard |
| Avatar upload needs client-side resize (no deps) | Medium | Canvas API resize is well-documented; max 256x256 output |
| Gemini output doesn't match design system | Medium | Review checklist above; manual fallback if needed |
| Sound effects blocked by browser autoplay policies | Low | Only play on user interaction (tap); Web Audio API handles this |
| Feature scope creep within each feature | Medium | MVP first — each feature has core + optional items clearly separated |

---

## Execution Strategy

- **Feature 1 (Watchlist)** and **Feature 2 (Settings)** require backend work — start these first
- **Feature 3 (Map)**, **Feature 4 (Life)**, and **Feature 5 (Nav)** are frontend-only — can run in parallel
- Backend prerequisite tasks across Features 1-3 can be batched into one backend session
- Gemini UI generation for Features 1-3 can run in parallel
- **Feature 5 (Nav)** depends partially on Feature 2 (avatar for profile dropdown)

### Suggested order:
1. All backend prerequisites (Features 1 + 2 + 3 database/API work)
2. Gemini UI generation batch (PriceSparkline, AvatarUpload, ShopDrawer)
3. Feature 4 (Life — no deps, fully independent)
4. Features 1 + 2 + 3 frontend integration (uses Gemini output + backend)
5. Feature 5 (Nav — uses avatar from Feature 2)

---

## Dependencies on Plan A

This plan assumes Plan A is complete:
- `<EmptyState>` component exists
- `<Skeleton>` module extended with `SkeletonGrid`, `LoadingSpinner`
- `<FormCard>` component exists
- `<Button>` component used consistently
- Design tokens locked and complete
- All pages use canonical spacing
- Decomposed components (scan, life, deck) are in place
