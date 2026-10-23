---
paths:
  - "apps/api/src/services/deckAgent.ts"
  - "apps/api/src/services/deckAgentPrompts.ts"
  - "apps/api/src/services/deckAgentTools.ts"
  - "apps/api/src/services/deckAdvisor.ts"
  - "apps/api/src/services/edhrec.ts"
  - "apps/api/src/services/urlImport.ts"
  - "apps/api/src/routes/deckAgent.ts"
  - "apps/api/src/routes/deckAdvisor.ts"
  - "apps/api/src/routes/decks.ts"
  - "apps/web/src/app/deck/**/*"
  - "apps/web/src/app/decks/**/*"
  - "apps/web/src/app/api/architect/**/*"
---

# Deck AI and deck pages

Two agents, used on purpose:

- `/deck` and `POST /v1/deck/agent` use `claude-opus-4-6`, SSE, at most 10 tool rounds, and tools `fetch_edhrec`, `search_web`, `get_meta_snapshot`, `get_card_details`, `get_collection`. `search_web` no-ops without `TAVILY_API_KEY`. Persist transcripts on `AgentSession`.
- The Advisor tab on `/decks/[id]` (`AIArchitectTab.tsx`) calls `POST /api/architect` with `claude-haiku-4-5-20251001` and only Scryfall search, Scryfall card fetch, and EDHREC recommendations. That tab was merged from a separate AI Architect tab on 2026-04-12. Haiku is there for latency.
- `POST /v1/ai/deck-advice` is one Opus completion with no tools.

Mode detection lives in `deckAgentPrompts.ts`: no deck builds, upgrade language upgrades, anything else with a deck modifies. A modify that would rewrite most of the deck should ask before a full rebuild. The client expects `STATUS:`, `TIER:`, `CARD:`, `CUT:`, and `ADD:` lines. Verify card names with `get_card_details` before they are shown as real cards.

Bracket is RC 1–5. Budget applies to adds and to cuts. URL import runs before the agent for Moxfield, Archidekt, and MTGGoldfish.

Deck legality on `main` is the copy inside `routes/decks.ts`. `packages/mtg-adapter` has a second copy that has already drifted. Change both, or move the route onto the adapter in the same change. Open PR #26 does that move; it is not on `main`.

New decks add the selected commander as a deck card. Deck detail layout is hero, sidebar, card list, and the Advisor tab. Keep helpers in `deck-helpers.ts` pure.
