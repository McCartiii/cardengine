# Life Counter Redesign — Mobile

## Overview

Complete redesign of the Expo mobile life counter (`apps/mobile/app/(tabs)/life.tsx` and supporting files). The goal is a sharp, animated, premium-feeling life tracker with chess clock timers, full counter support, and adaptive layouts for 2–6 players on a shared phone laid flat on the table.

No emojis anywhere in the UI. Typography, color, and light effects only.

## Setup Screen

A single vertically-centered screen with three sections and a pinned start button.

### Starting Life
- Four options: **20, 30, 40, 60**
- Displayed as a horizontal row of cards
- Active card: purple radial glow from top, lifted 2px with shadow, number glows purple (`#c4b5fd`, text-shadow `#7c3aed`)
- Inactive cards: near-invisible borders (`rgba(255,255,255,0.04)`), muted numbers (`#1e1e32`)
- No format names — just the life total numbers

### Players
- Five options: **2, 3, 4, 5, 6**
- Same card style as starting life but with blue accent (`#93c5fd` / `#3b82f6`)
- Small dot indicators below each number showing player count visually
- Active dots use `rgba(59,130,246,0.5)`

### Game Clock
- Timer options in a 4×1 grid: **15, 30, 60, 90** (minutes)
- "min" subscript below each number
- Active: amber accent (`#fbbf24` / `#f59e0b`) with radial glow
- Below: a full-width "No Timer" chip for casual games
- Summary bar: "{X} min per player · {Y} min total" — only shown when a timer is selected

### Start Button
- Full-width, pinned to bottom
- Gradient: `#7c3aed → #4f46e5 → #3b82f6 → #06b6d4`
- Shimmer sweep animation (2.5s loop)
- Inset highlight on top edge
- Text: "Start Game" — no icons
- Press: scale to 0.97

### Ambient Effects
- Breathing purple radial glow behind the header area
- Bottom glow behind the start button
- Spring easing on all active state transitions: `cubic-bezier(0.34, 1, 0.64, 1)`

## Playing Screen

### Layout — Separated Player Cards

Each player occupies their own floating rounded card (`border-radius: 20px`) with a gap between them. Cards are separated by the phone's background color (`#08080e`), not touching.

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
- **Player color**: Assigned at game start from palette: `#7c3aed` (purple), `#3b82f6` (blue), `#15803d` (green), `#f59e0b` (amber), `#ef4444` (red), `#06b6d4` (cyan)
- **Radial gradient background**: Subtle glow of player color from center, fading to `#0c0c16`
- **Edge glow**: 2px horizontal line at top, player color with matching box-shadow
- **Border**: `1px solid` at ~15% opacity of player color
- **Timer badge**: Top-right corner, monospace, shows remaining time. Inactive: muted. Active player: green glow pulse (`#4ade80`)
- **Player name**: Small uppercase text in player color at ~60% opacity (not editable during game — set to "Player N" automatically)
- **Life total**: Large centered number (88px in 2-player, scales down with more players). White with colored text-shadow matching player.
- **"life" label**: Tiny uppercase below the number, very muted
- **Tap zones**: Left 40% = −1, Right 40% = +1. Invisible until pressed (subtle background flash on active)
- **Swipe-up pill**: Small horizontal bar at bottom of card, `rgba(255,255,255,0.15)`

### Chess Clock / Turn Timer

- Total game time is split equally per player at game start
- Active player's timer badge glows green and pulses
- Timer does **NOT** auto-start when a turn passes — the player must **tap their card to start their clock**
- While waiting to start: timer badge shows time but doesn't tick
- Pass turn: tap the center strip "Next" button or designated control
- When a player's time runs out: they are eliminated
- "No Timer" mode: no timer badges shown, no turn tracking

### Center Control Strip

A thin horizontal bar between the top and bottom player rows:
- **Settings button**: text "Settings" or gear-styled text label (no emoji)
- **Game elapsed time**: monospace, muted color. Green when game is active.
- **Coin flip button**: text "Flip" — shows "HEADS" or "TAILS" result with animated pop-in, auto-dismisses after 2.5s
- **Reset button**: text "Reset" or circular arrow character

### Counter Drawer (Swipe Up)

Each player card has a swipe-up drawer for secondary counters.

**Trigger**: Swipe up on the pill handle at bottom of a player card.

**Behavior**:
- Drawer slides up with spring easing (`cubic-bezier(0.34, 1.56, 0.64, 1)`, 0.4s)
- Life total shrinks to make room
- Backdrop blur on drawer background
- Swipe down or tap outside to dismiss

**Counter Grid** (2×2):

| Counter | Icon Text | Color | Range | Elimination |
|---------|-----------|-------|-------|-------------|
| Poison | "PSN" or skull-like glyph | Purple `#a78bfa` | 0–10 | 10 = eliminated |
| Energy | "NRG" | Yellow `#facc15` | 0+ | No |
| Commander Damage | "CMD" | Red `#f87171` | 0–21 per source | 21 from one source = eliminated |
| Experience | "EXP" | Green `#4ade80` | 0+ | No |

Each counter tile shows:
- Counter label (tiny uppercase)
- Current value (large, colored)
- +/− buttons (small rounded squares)

**Non-zero indicator dots**: When the drawer is closed, any non-zero counter shows as a small colored dot on the card. This gives at-a-glance status without opening the drawer.

## Animations

### Life Change — Small (1–4 damage/heal)

**Taking damage (−1 to −4)**:
- Life number: pulse red (`#ff4444`) with red text-shadow, 0.6s ease-out
- Card border: flash red then return, 0.6s
- Card body: subtle shake (translateX ±6px, slight rotation), 0.4s
- Floating delta: "−N" text in red, drifts upward and fades out over 1.2s
- Number rolls/animates to new value (cubic ease-out, 300ms)

**Gaining life (+1 to +4)**:
- Life number: pulse green (`#4ade80`) with green text-shadow, 0.5s
- Card border: flash green, 0.6s
- Floating delta: "+N" in green, drifts up and fades
- Less dramatic than damage — satisfying but calm

### Life Change — Big (5+)

**Taking damage (−5 or more)**:
- Everything from small, plus:
- Violent shake with rotation (translateX ±12px, rotate ±1.5°), 0.6s
- Number scales up to 1.12x then snaps back with overshoot, 0.8s
- Red vignette: `inset box-shadow` floods the card edges with red, 0.8s
- Edge glow flares to 3x brightness briefly
- Floating delta is larger (36px vs 28px)
- **Smoother than small hits** — use longer durations and gentler easing curves for the scale snap-back. No jerky snap. Fluid overshoot with `cubic-bezier(0.34, 1.56, 0.64, 1)`.

**Gaining life (+5 or more)**:
- Number scales up to 1.08x with green bloom, smooth return
- Green border flash
- Larger floating delta
- Same smooth easing as big damage

### Danger State (life ≤ 5)

- Life number: continuous red pulse animation, 1.5s infinite
- Edge glow: turns red, throbs with `glow-pulse` animation
- Card border: shifts to `rgba(255,50,50,0.25)`
- Card gets subtle red inset shadow

### Elimination

**Trigger**: Life ≤ 0, poison ≥ 10, or commander damage from one source ≥ 21.

**Animation**:
- Dark overlay fades in over the card (`rgba(0,0,0,0.7)`)
- Large "X" or stylized skull graphic scales in with bounce (0 → 1.05 → 1, 0.6s)
- "ELIMINATED" text in red (`#ff4444`), uppercase, letter-spacing 3px, with red text-shadow
- Player name below in muted player color

**Funny elimination comments** — one randomly selected and shown below the eliminated text:
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
- "You died as you lived — tapped out"
- "Should've mulliganed"

The comment fades in 0.5s after the eliminated text, slightly smaller font, lower opacity.

### Number Animation

All life total changes use an animated counter that rolls from old value to new value:
- Duration: 300ms
- Easing: cubic ease-out (`1 - Math.pow(1 - progress, 3)`)
- Combined with the color pulse animations

## Game Over Screen

When only one player remains (all others eliminated or timed out):
- Full-screen overlay
- Winner's name in their player color, large and bold
- "Wins!" text below
- "New Game" button (same gradient style as start button)
- No emojis, no trophy — just clean text with the winner's color glow

## Colors

### Player Colors (6)
```
Purple:  #7c3aed (active: #a78bfa)
Blue:    #3b82f6 (active: #93c5fd)
Green:   #15803d (active: #4ade80)
Amber:   #f59e0b (active: #fbbf24)
Red:     #ef4444 (active: #f87171)
Cyan:    #06b6d4 (active: #22d3ee)
```

### UI Colors
```
Background:     #08080e
Card bg:        #0c0c16
Border default: rgba(255,255,255,0.04)
Text primary:   white
Text muted:     #2a2a42
Text very muted:#1a1a30
Accent purple:  #7c3aed
Accent blue:    #3b82f6
Accent amber:   #f59e0b
Damage red:     #ff4444
Heal green:     #4ade80
Timer active:   #4ade80
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
