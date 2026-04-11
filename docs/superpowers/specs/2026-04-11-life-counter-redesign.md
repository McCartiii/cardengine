# Life Counter Redesign — Mobile

## Overview

Complete redesign of the Expo mobile life counter (`apps/mobile/app/(tabs)/life.tsx` and supporting files). The goal is a sharp, animated, premium-feeling life tracker with chess clock timers, full counter support, and adaptive layouts for 2–6 players on a shared phone laid flat on the table.

No emojis anywhere in the UI. Typography, color, and light effects only.

Design language matches the web app: dark blue-slate surfaces, teal accent, Geist-inspired typography, spring easing transitions.

## Setup Screen

A single vertically-centered screen with three sections and a pinned start button.

### Starting Life
- Four options: **20, 30, 40, 60**
- Displayed as a horizontal row of cards
- Active card: teal radial glow from top, lifted 2px with shadow, number glows teal (`#2DD4BF`, text-shadow `#0D9488`)
- Inactive cards: near-invisible borders (`rgba(30,45,61,0.4)`), muted numbers (`#475569`)
- No format names — just the life total numbers

### Players
- Five options: **2, 3, 4, 5, 6**
- Same card style as starting life but with sky-blue accent (`#38BDF8` / `#0EA5E9`)
- Small dot indicators below each number showing player count visually
- Active dots use `rgba(56,189,248,0.5)`

### Game Clock
- Timer options in a 4×1 grid: **15, 30, 60, 90** (minutes)
- "min" subscript below each number
- Active: warning amber accent (`#FB923C` / `#F59E0B`) with radial glow
- Below: a full-width "No Timer" chip for casual games
- Summary bar: "{X} min per player · {Y} min total" — only shown when a timer is selected

### Start Button
- Full-width, pinned to bottom
- Gradient: `linear-gradient(135deg, #0D9488, #14B8A6)` (teal, matches web primary button)
- Box shadow: `0 2px 12px rgba(13,148,136,0.45), inset 0 1px 0 rgba(255,255,255,0.12)`
- Shimmer sweep animation (2.5s loop, same as web `.btn-shimmer`)
- Text: "Start Game" — no icons
- Press: scale to 0.98 (matches web `active:scale-[0.98]`)

### Ambient Effects
- Breathing teal radial glow behind the header area (`rgba(13,148,136,0.06)`)
- Bottom glow behind the start button (`rgba(13,148,136,0.1)`)
- Spring easing on all active state transitions: `cubic-bezier(0.34, 1.56, 0.64, 1)` (matches web)

## Playing Screen

### Layout — Separated Player Cards

Each player occupies their own floating rounded card (`border-radius: 16px` / web `rounded-2xl`) with a gap between them. Cards are separated by the phone's background color (`#0F1117`), not touching.

All player cards are **rotated 180°** for face-to-face table play (phone laid flat, each player reads from their side).

#### Adaptive Layouts (2–6 players)
- **2 players**: Two cards stacked vertically, center control strip between them
- **3 players**: Top card full-width (rotated), bottom row split into two cards side by side
- **4 players**: 2×2 grid — top row rotated, bottom row normal. Center strip between rows.
- **5 players**: Top row: 3 cards (rotated). Bottom row: 2 cards. Center strip between.
- **6 players**: 3×2 grid — top row rotated, bottom row normal. Center strip between.

Each layout rotates the top row(s) 180° so players on both sides of the table can read their panels.

### Player Card Design

Each card has:
- **Background**: `#161B27` (matches web `--surface`)
- **Border**: `1px solid #1E2D3D` (matches web `--border`)
- **Border radius**: 16px (matches web `rounded-2xl`)
- **Shadow**: matches web `--shadow-card`: `0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3)`
- **Player color**: Assigned at game start from palette (see Colors section)
- **Edge glow**: 2px horizontal line at top in player color with matching box-shadow
- **Timer badge**: Top-right corner, Geist Mono style (tabular-nums, letter-spacing -0.02em), shows remaining time. Inactive: `#475569`. Active player: `#22C55E` (success green) with glow pulse.
- **Player name**: Small uppercase text in player color at 60% opacity, letter-spacing 1.5px
- **Life total**: Large centered number (88px in 2-player, scales down with more players). `#E2E8F0` (text-primary) with colored text-shadow matching player.
- **"life" label**: Tiny uppercase below the number, `#475569` (text-muted)
- **Tap zones**: Left 40% = −1, Right 40% = +1. Invisible until pressed (subtle `rgba(255,255,255,0.03)` flash on active)
- **Swipe-up pill**: Small horizontal bar at bottom of card, `rgba(255,255,255,0.12)`

### Chess Clock / Turn Timer

- Total game time is split equally per player at game start
- Active player's timer badge glows `#22C55E` (success green) and pulses
- Timer does **NOT** auto-start when a turn passes — the player must **tap their card to start their clock**
- While waiting to start: timer badge shows time but doesn't tick
- Pass turn: tap the center strip "Next" button or designated control
- When a player's time runs out: they are eliminated
- "No Timer" mode: no timer badges shown, no turn tracking

### Center Control Strip

A thin horizontal bar between the top and bottom player rows:
- Background: `#0A0D13` (surface-sunken)
- Border top/bottom: `1px solid #1E2D3D`
- **Settings button**: text label, `#475569` text, `#1E2535` background (surface-raised)
- **Game elapsed time**: Geist Mono, `#475569` default. `#22C55E` when game active.
- **Coin flip button**: text "Flip" — shows "HEADS" or "TAILS" result with animated pop-in (scaleIn + fadeIn), auto-dismisses after 2.5s
- **Reset button**: text label, same muted style as settings

### Counter Drawer (Swipe Up)

Each player card has a swipe-up drawer for secondary counters.

**Trigger**: Swipe up on the pill handle at bottom of a player card.

**Behavior**:
- Drawer slides up with spring easing (`cubic-bezier(0.34, 1.56, 0.64, 1)`, 0.4s)
- Life total shrinks to make room
- Drawer background: `rgba(22,27,39,0.92)` (matches web `--surface-overlay`) with backdrop blur
- Drawer border-top: `1px solid #2D4059` (border-strong)
- Swipe down or tap outside to dismiss

**Counter Grid** (2x2):

| Counter | Label | Color | Range | Elimination |
|---------|-------|-------|-------|-------------|
| Poison | PSN | `#A78BFA` (purple) | 0–10 | 10 = eliminated |
| Energy | NRG | `#FB923C` (warning) | 0+ | No |
| Commander Damage | CMD | `#F43F5E` (danger) | 0–21 per source | 21 from one source = eliminated |
| Experience | EXP | `#22C55E` (success) | 0+ | No |

Each counter tile:
- Background: `rgba(255,255,255,0.03)`
- Border: `1px solid rgba(255,255,255,0.06)`
- Border radius: 12px (matches web `rounded-xl`)
- Label: `#475569`, 8px uppercase, letter-spacing 1px
- Value: large, colored per counter
- +/- buttons: `rounded-lg`, border `rgba(255,255,255,0.08)`, background `rgba(255,255,255,0.04)`

**Non-zero indicator dots**: When the drawer is closed, any non-zero counter shows as a small colored dot on the card. This gives at-a-glance status without opening the drawer.

## Animations

### Life Change — Small (1–4 damage/heal)

**Taking damage (−1 to −4)**:
- Life number: pulse `#F43F5E` (danger) with red text-shadow, 0.6s ease-out
- Card border: flash `rgba(244,63,94,0.6)` then return to `#1E2D3D`, 0.6s
- Card body: subtle shake (translateX ±6px, slight rotation), 0.4s
- Floating delta: "−N" text in `#F43F5E`, drifts upward and fades out over 1.2s
- Number rolls/animates to new value (cubic ease-out, 300ms)

**Gaining life (+1 to +4)**:
- Life number: pulse `#22C55E` (success) with green text-shadow, 0.5s
- Card border: flash `rgba(34,197,94,0.5)`, 0.6s
- Floating delta: "+N" in `#22C55E`, drifts up and fades
- Less dramatic than damage — satisfying but calm

### Life Change — Big (5+)

**Taking damage (−5 or more)**:
- Everything from small, plus:
- Violent shake with rotation (translateX ±12px, rotate ±1.5°), 0.6s
- Number scales up to 1.12x then snaps back with overshoot, 0.8s
- Red vignette: inset box-shadow floods the card edges with `rgba(244,63,94,0.12)`, 0.8s
- Edge glow flares to 3x brightness briefly
- Floating delta is larger (36px vs 28px)
- Smooth easing — longer durations, fluid overshoot with `cubic-bezier(0.34, 1.56, 0.64, 1)`

**Gaining life (+5 or more)**:
- Number scales up to 1.08x with green bloom, smooth return
- Green border flash
- Larger floating delta
- Same smooth easing as big damage

### Danger State (life <= 5)

- Life number: continuous `#F43F5E` pulse animation, 1.5s infinite
- Edge glow: turns `#F43F5E`, throbs with pulse-soft animation
- Card border: shifts to `rgba(244,63,94,0.25)`
- Card gets subtle red inset shadow

### Elimination

**Trigger**: Life <= 0, poison >= 10, or commander damage from one source >= 21.

**Animation**:
- Dark overlay fades in over the card (`rgba(10,13,19,0.85)` — surface-sunken based)
- Large "X" scales in with bounce (0 -> 1.05 -> 1, 0.6s) — uses web scaleIn pattern
- "ELIMINATED" text in `#F43F5E` (danger), uppercase, letter-spacing 3px, with text-shadow
- Player name below in muted player color

**Funny elimination comments** — one randomly selected, shown below the eliminated text:
- "Skill issue"
- "Should've played blue"
- "That's rough, buddy"
- "Lands in front, please"
- "They had the nuts"
- "At least you have your health... oh wait"
- "First blood"
- "Back to the command zone"
- "Maybe next pod"
- "You were the threat all along"
- "Mana screwed, probably"
- "The stack resolves... you don't"
- "Press F"
- "You died as you lived -- tapped out"
- "Should've mulliganed"

The comment fades in 0.5s after the eliminated text (slideUp pattern), slightly smaller font, `#94A3B8` (text-secondary).

### Number Animation

All life total changes use an animated counter that rolls from old value to new value:
- Duration: 300ms
- Easing: cubic ease-out (`1 - Math.pow(1 - progress, 3)`)
- Combined with the color pulse animations

## Game Over Screen

When only one player remains (all others eliminated or timed out):
- Full-screen overlay on `#0A0D13` (surface-sunken)
- Winner's name in their player color, large and bold
- "Wins!" text below in `#E2E8F0`
- "New Game" button — teal gradient, same style as start button
- No emojis, no trophy — just clean text with the winner's color glow

## Colors

### Player Colors (6)
```
Teal:    #0D9488 (active: #2DD4BF)  — matches app accent
Sky:     #0EA5E9 (active: #38BDF8)
Purple:  #8B5CF6 (active: #A78BFA)
Amber:   #F59E0B (active: #FBBF24)
Rose:    #F43F5E (active: #FB7185)
Emerald: #10B981 (active: #34D399)
```

### UI Colors (matching web design system)
```
Background:      #0F1117  (--bg)
Surface:         #161B27  (--surface)
Surface raised:  #1E2535  (--surface-raised)
Surface sunken:  #0A0D13  (--surface-sunken)
Surface overlay: rgba(22,27,39,0.92)  (--surface-overlay)

Border:          #1E2D3D  (--border)
Border strong:   #2D4059  (--border-strong)
Border focus:    #0D9488  (--border-focus / accent)

Text primary:    #E2E8F0  (--text-primary)
Text secondary:  #94A3B8  (--text-secondary)
Text muted:      #475569  (--text-muted)

Accent:          #0D9488  (--accent, teal)
Accent hover:    #14B8A6  (--accent-hover)
Accent text:     #2DD4BF  (--accent-text)

Danger:          #F43F5E  (--danger)
Success:         #22C55E  (--success)
Warning:         #FB923C  (--warning)

Timer active:    #22C55E  (success green)
Damage flash:    #F43F5E  (danger)
Heal flash:      #22C55E  (success)
```

### Shadows (matching web)
```
Card:          0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3)
Card hover:    0 20px 40px rgba(0,0,0,0.7), 0 8px 16px rgba(0,0,0,0.5)
Elevated:      0 8px 24px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)
```

### Easing (matching web)
```
Spring:        cubic-bezier(0.34, 1.56, 0.64, 1)  — bouncy, for card hovers and active states
Standard:      ease-out  — for color transitions
Card hover:    0.22s duration with spring easing
```

## Technology

- **Framework**: React Native (Expo) with expo-router
- **State**: Zustand store (`lifeStore.ts`) — complete rewrite of current store
- **Animations**: `react-native-reanimated` for performant 60fps animations on the UI thread
- **Gestures**: `react-native-gesture-handler` for swipe-up drawer
- **Haptics**: `expo-haptics` — medium impact on life change, heavy on elimination, light on button presses

## File Structure

```
apps/mobile/
  app/(tabs)/life.tsx              — Tab screen, renders SetupScreen or GameScreen
  src/screens/life/
    SetupScreen.tsx                — Starting life, players, timer selection
    GameScreen.tsx                 — Active game with player grid + center strip
    GameOverScreen.tsx             — Winner display
  src/components/life/
    PlayerCard.tsx                 — Individual player card with animations
    CounterDrawer.tsx              — Swipe-up counter panel
    CenterStrip.tsx                — Settings, timer, coin flip, reset
    CoinFlip.tsx                   — Animated coin flip result
  src/store/lifeStore.ts           — Zustand store (rewrite)
  src/lib/lifeConstants.ts         — Colors, elimination quips, timer options
```

## Scope Exclusions

- No online multiplayer / syncing between devices
- No game history / log of actions
- No custom player colors (auto-assigned)
- No portrait/landscape toggle (portrait only, phone flat on table)
- No sound effects (haptics only)
