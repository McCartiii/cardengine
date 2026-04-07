# Deck AI Overhaul — Design Spec
**Date:** 2026-04-06  
**Status:** Approved

---

## Overview

Replace the current prompt-only deck advisor with a smooth, agentic Claude experience that sources real data from EDHREC, Reddit, MTGGoldfish, and the local collection. Users control intent via structured sliders (RC Bracket 1-5 + dollar budget) and free text. The AI handles full builds, upgrades to existing decks, and surgical modifications — streaming results as a progressive tiered card gallery.

---

## Modes

The agent auto-detects mode from context. No explicit mode selector needed.

| Mode | Trigger | Behavior |
|---|---|---|
| **Full Build** | No deck provided + text prompt | Builds 99-card list from scratch |
| **Upgrade** | Existing deck + upgrade intent | Scores current cards, identifies weak spots, surfaces cut/add pairs |
| **Modify** | Existing deck + specific instruction | Surgical swaps only — patches affected cards, leaves rest intact |

**Escalation rule:** If a Modify instruction would affect >30% of the deck or fundamentally changes strategy, Claude flags it and asks the user whether to do a full rebuild before proceeding.

---

## Input Panel

Placed on the left side of the deck builder UI.

### Controls
- **Deck input** — three sub-options:
  - Paste decklist (plain text, standard MTG format)
  - Pick from saved decks (dropdown of user's saved decks)
  - Paste a URL (Moxfield, Archidekt, MTGGoldfish — auto-imported before the agent runs)
- **Bracket slider** — 1 to 5, labeled with RC bracket names:
  - 1: Exhibition (precon-level)
  - 2: Core (upgraded precon, casual synergies)
  - 3: Upgraded (focused strategy, efficient cards)
  - 4: Optimized (near-cEDH, powerful synergies)
  - 5: cEDH (fully competitive)
- **Budget slider** — $0 to $1000+. Applied to both card selection (what to recommend) and cuts (what to replace)
- **Text prompt** — free text for strategy focus, specific cards to include/exclude, tone of the deck, win condition priority, any other direction
- **Run button** — submits to the agent

### Mode Detection Logic
```
has_deck AND ("upgrade" OR "improve" OR "better" in prompt) → Upgrade
has_deck AND specific_change_instruction → Modify  
no_deck OR "build" OR "create" OR "make me" in prompt → Full Build
```

---

## Agent Architecture

### System Prompts (per mode)

Each mode gets a distinct system prompt that sets expectations:

**Full Build prompt** instructs Claude to:
- Define a clear strategy and win condition before picking any cards
- Source from EDHREC, meta snapshots, and community resources appropriate to the bracket
- Fill all roles (ramp, card draw, interaction, win cons, lands) proportionally
- Respect budget hard — never recommend cards above the per-card budget ceiling
- Output cards in the structured tiered format (see Output section)

**Upgrade prompt** instructs Claude to:
- Analyze every card in the current deck against EDHREC synergy scores
- Identify the weakest cards first (low synergy, off-strategy, over-budget relative to the target budget)
- Pair each cut with a specific add that improves synergy or role efficiency
- Explain what's wrong with the cut and why the add is better
- Output as cut/add pairs, tiered by impact

**Modify prompt** instructs Claude to:
- Identify only the cards directly affected by the instruction
- Verify all card names are real via `get_card_details` before outputting
- If the change is small (≤8 cards affected), patch and respond without escalating
- If the change is large (>30% of deck), surface the escalation message before doing anything

### Tools

```typescript
// Fetch EDHREC commander page data (24h Postgres cache)
fetch_edhrec(commanderName: string): EdhrecCommanderPage

// Live web search — Reddit, Moxfield, MTGGoldfish articles, tournament results
search_web(query: string): SearchResult[]

// Nightly-cached MTGGoldfish meta snapshot by format and bracket
get_meta_snapshot(format: string, bracket: 1 | 2 | 3 | 4 | 5): MetaSnapshot

// Batch card lookup — prices, images, type lines from local DB + Scryfall fallback
get_card_details(cardNames: string[]): CardDetail[]

// User's owned cards — variant IDs and names
get_collection(userId: string): OwnedCard[]
```

### Tool Calling Strategy by Bracket

| Bracket | EDHREC | Meta Snapshot | Web Search | Collection |
|---|---|---|---|---|
| 1-2 (Casual) | Always | Never | Rarely | If authenticated |
| 3 (Upgraded) | Always | Sometimes | Sometimes | If authenticated |
| 4-5 (Optimized/cEDH) | Always | Always | Always | If authenticated |

Claude decides whether to call `search_web` based on the bracket and whether EDHREC data alone is sufficient. For Bracket 4-5, it always searches for recent community discussion.

### Parallelism

Where possible, tool calls run in parallel:
- `fetch_edhrec` + `get_meta_snapshot` run together
- `search_web` runs concurrently with the above
- `get_card_details` runs after Claude has determined its card list

---

## Output Format

### Streaming Structure

Claude streams output in a structured format the frontend parses in real-time. Cards render progressively as each tier is output — users see Win Conditions fill in before Core Engine, etc.

```
STATUS: Fetching EDHREC data for [Commander]...
STATUS: Searching Reddit for recent [Commander] builds...
STATUS: Building your Bracket [N] deck...

TIER: Win Conditions
CARD: Thassa's Oracle
REASON: Primary win condition alongside Demonic Consultation. Resolves through most interaction.
GAMEPLAY: Cast when you have 0-1 cards in library. Pairs with Demonic Consultation as an instant-win package.
IMPORTANCE: critical

CARD: Demonic Consultation
REASON: Instant-speed library exile that enables Thassa's Oracle win.
GAMEPLAY: Name a card not in your deck (e.g. "Gleemax") to exile entire library, then resolve Oracle.
IMPORTANCE: critical

TIER: Core Engine
CARD: Rhystic Study
...

TIER: Strong Includes
...

TIER: Flex Slots
...

TIER: Cuts  [Upgrade mode only]
CUT: Divination
CUT_REASON: Strictly worse than most draw spells at this bracket. Sorcery speed, no synergy.
ADD: Mystic Remora
ADD_REASON: Draws significantly more cards in the early game at Bracket 4-5.
NET_SYNERGY: +0.34
```

### Card Panel (per card)

Each card renders as a panel in the gallery:
- Card image (local DB → Scryfall API fallback)
- Card name + mana cost + type line
- Importance badge: `Critical` / `High` / `Flex`
- **Why it's here** — 1-2 sentences on synergy fit and strategic role
- **How to play it** — when to cast, what it enables, key combinations
- Price (USD, from local PriceCache)
- **Add to Deck** button — manual, never auto-adds

### Upgrade Mode Layout

Two-column diff view:
- Left column: **Cut** card panel (red tint) — card image, cut reason
- Right column: **Add** card panel (green tint) — card image, add reason, price
- Net synergy gain badge between them
- Accept / Reject toggle per pair
- Pairs ordered by net synergy gain descending

### Status Pills

Animated status pills appear at the top of the output area while the agent is working:
```
[● Fetching EDHREC]  [● Searching Reddit]  [● Building deck...]
```
Each pill completes (checkmark) as its tool call resolves. Users see live progress, never a blank spinner.

---

## Data Pipeline

### MTGGoldfish Nightly Scrape (new)

Scheduled job runs nightly via the existing cron infrastructure. Scrapes and caches to `MetaSnapshot` table in Postgres:
- Top commander decks by color identity, grouped by bracket
- Format tier lists (Standard, Pioneer, Modern, Legacy, Commander)
- Staple price trend data

`get_meta_snapshot` is a fast Postgres read — no live scrape at request time.

### Web Search (live, per request)

Tavily Search API (~$5/mo at this scale). Claude constructs targeted queries:
- `"[Commander] cEDH deck 2025 site:reddit.com"`
- `"[Commander] budget upgrade guide"`
- `"best cards for [strategy] commander edh"`

Results are summarized by Claude, not returned raw to the user.

### EDHREC (no change)

Existing `fetchEdhrecCommander` with 24h Postgres cache. No changes to this layer.

### URL Import (new)

Lightweight parser handles paste-in URLs:
- **Moxfield:** `GET /api/v2/decks/{deckId}` → standard decklist
- **Archidekt:** `GET /api/decks/{deckId}/` → standard decklist  
- **MTGGoldfish:** HTML scrape of decklist table → standard decklist

Parsed before the agent runs. Stored as session state, not persisted unless user saves.

### Card Details

Existing `CardVariant` + `PriceCache` tables. Extended with Scryfall API fallback for cards not yet in local DB (fetched on demand, cached on write).

---

## Refinement Flow

### Session State

After the initial response, the full output is stored in client-side session state:
- Current deck/card list
- All surfaced recommendations
- Bracket and budget settings
- Full message history

### Surgical Patch

Refinement instructions append to the conversation. Claude receives:
1. Original context (bracket, budget, mode, commander)
2. Current deck state
3. New instruction

For small changes (≤8 cards affected, same strategy, same bracket): Claude patches only affected cards. Non-affected cards do not re-render. Status shows `Adjusting...` — no full tool call sequence.

### Escalation to Full Rebuild

Claude escalates when:
- Strategy or commander changes
- Bracket changes by 2+ levels
- >30% of cards need to change
- User says "start over" or "rebuild"

Escalation message (streamed before any action):
> "This change would affect most of the deck. Want me to do a full rebuild with this new direction, or keep the current core and just push it as far as I can?"

User responds before Claude proceeds.

### History Navigation

Full conversation thread is preserved. Users can reference prior states:
> "Go back to what you had before the budget change"

Claude reads the thread and reconstructs the prior card set from conversation history.

---

## New Files / Changes Summary

### New (backend)
- `apps/api/src/services/deckAgent.ts` — agentic Claude loop with tool dispatch
- `apps/api/src/services/deckAgentTools.ts` — tool implementations (fetch_edhrec wrapper, search_web, get_meta_snapshot, get_card_details, get_collection)
- `apps/api/src/services/urlImport.ts` — Moxfield/Archidekt/MTGGoldfish URL parser
- `apps/api/src/jobs/metaSnapshotJob.ts` — nightly MTGGoldfish scrape
- `apps/api/src/routes/deckAgent.ts` — new streaming endpoint `POST /v1/deck/agent`

### New (frontend)
- `apps/web/src/app/deck/components/InputPanel.tsx` — bracket slider, budget slider, deck input, text prompt
- `apps/web/src/app/deck/components/CardGallery.tsx` — streaming tiered card gallery
- `apps/web/src/app/deck/components/CardPanel.tsx` — individual card with image, reasoning, gameplay, add button
- `apps/web/src/app/deck/components/StatusPills.tsx` — animated tool call progress indicators
- `apps/web/src/app/deck/components/UpgradeDiff.tsx` — cut/add pair columns for upgrade mode
- `apps/web/src/lib/deckAgentStream.ts` — SSE client + stream parser

### Modified
- `apps/web/src/app/deck/page.tsx` — integrate new components, wire to new endpoint
- `apps/web/src/app/api/architect/route.ts` — deprecated in favor of new backend endpoint
- `apps/api/src/routes/deckAdvisor.ts` — keep existing EDHREC routes, add new agent route registration

### Database
- New `MetaSnapshot` table — format, bracket, data (JSON), fetchedAt
- New `AgentSession` table — session_id, messages (JSON), createdAt — required for history navigation ("go back to before the budget change")

---

## Success Criteria

- Full build response starts streaming within 1 second of submission
- Tool call status pills update in real-time — no blank waiting periods
- Cards render progressively as tiers complete — gallery fills in live
- All card names verified real via `get_card_details` — zero hallucinated cards
- Upgrade mode correctly identifies and pairs cuts/adds by synergy score
- Surgical modify touches only affected cards — rest of gallery unchanged
- Bracket 4-5 builds reference current community sources (Reddit/MTGGoldfish)
- Budget respected — no recommended card exceeds a per-card ceiling of `budget / 30` (allowing concentration in key cards while keeping total cost in range)
