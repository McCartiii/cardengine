# Deck AI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static prompt-only deck advisor with a smooth agentic Claude experience that streams a tiered card gallery, sourcing live data from EDHREC, Reddit, and MTGGoldfish based on RC Bracket 1-5 and dollar budget inputs.

**Architecture:** Claude runs an agentic tool-use loop on the Fastify API, calling fetch_edhrec / search_web / get_meta_snapshot / get_card_details / get_collection. It streams structured text (TIER/CARD/CUT/ADD lines) back over SSE. The Next.js frontend parses the stream in real-time and renders a progressive card gallery — cards fade in tier by tier as Claude writes them.

**Tech Stack:** Fastify 5, Prisma 7 (PostgreSQL), `@anthropic-ai/sdk`, `@tavily/core`, `cheerio`, Next.js 16, React 19, Tailwind v4, Zod, Vitest

---

## File Map

### New — API
| File | Responsibility |
|---|---|
| `apps/api/src/services/deckAgentPrompts.ts` | System prompts for build/upgrade/modify + mode detection |
| `apps/api/src/services/deckAgentTools.ts` | Tool implementations: fetch_edhrec, search_web, get_meta_snapshot, get_card_details, get_collection |
| `apps/api/src/services/deckAgent.ts` | Agentic Claude loop: tool dispatch, streaming generator |
| `apps/api/src/services/urlImport.ts` | Parse Moxfield/Archidekt/MTGGoldfish URLs into standard decklist |
| `apps/api/src/jobs/metaSnapshotJob.ts` | Nightly MTGGoldfish scrape → MetaSnapshot table |
| `apps/api/src/routes/deckAgent.ts` | `POST /v1/deck/agent` SSE endpoint |

### New — Web
| File | Responsibility |
|---|---|
| `apps/web/src/lib/deckAgentStream.ts` | SSE client + structured stream parser → typed AgentEvent[] |
| `apps/web/src/app/deck/components/StatusPills.tsx` | Animated tool-call progress indicators |
| `apps/web/src/app/deck/components/CardPanel.tsx` | Single card: image, name, importance badge, reason, gameplay, Add button |
| `apps/web/src/app/deck/components/CardGallery.tsx` | Streaming tiered gallery: groups cards by tier, fades in progressively |
| `apps/web/src/app/deck/components/UpgradeDiff.tsx` | Cut/Add pair columns for upgrade mode |
| `apps/web/src/app/deck/components/InputPanel.tsx` | Bracket slider, budget slider, deck input (paste/saved/URL), text prompt, Run button |

### Modified
| File | Change |
|---|---|
| `apps/api/prisma/schema.prisma` | Add MetaSnapshot + AgentSession models |
| `apps/api/src/index.ts` | Register deckAgent route + metaSnapshot nightly job |
| `apps/web/src/app/deck/page.tsx` | Add InputPanel + CardGallery + UpgradeDiff sections alongside existing editor |

---

## Task 1: Add MetaSnapshot + AgentSession to Prisma schema

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add models to schema**

Append to the end of `apps/api/prisma/schema.prisma`:

```prisma
// ── Deck AI ──

model MetaSnapshot {
  id        String   @id @default(cuid())
  format    String   // "commander" | "standard" | "modern" | "pioneer" | "legacy"
  bracket   Int      // 1-5 (commander only; 0 for non-commander formats)
  data      Json     // scraped tier list / top decks
  fetchedAt DateTime @default(now())

  @@unique([format, bracket])
  @@index([format, fetchedAt])
}

model AgentSession {
  id        String   @id @default(cuid())
  userId    String?  // null for unauthenticated
  messages  Json     // Anthropic.MessageParam[] — full conversation history
  context   Json     // { bracket, budget, mode, commander, deckCards }
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, updatedAt])
}
```

- [ ] **Step 2: Create and run migration**

```bash
cd apps/api
npx prisma migrate dev --name add_deck_ai_tables
```

Expected output: `The following migration(s) have been created and applied: 20260406000000_add_deck_ai_tables`

- [ ] **Step 3: Verify migration**

```bash
npx prisma studio
```

Confirm `MetaSnapshot` and `AgentSession` tables appear in the Prisma Studio table list. Then close Studio (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
cd ../..
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat: add MetaSnapshot and AgentSession prisma models"
```

---

## Task 2: Install dependencies

**Files:** `apps/api/package.json`

- [ ] **Step 1: Install Anthropic SDK, Tavily, and Cheerio in API**

```bash
cd apps/api
npm install @anthropic-ai/sdk @tavily/core cheerio
```

- [ ] **Step 2: Verify installs**

```bash
node -e "import('@anthropic-ai/sdk').then(m => console.log('anthropic ok', m.default.name))"
node -e "import('@tavily/core').then(m => console.log('tavily ok'))"
node -e "import('cheerio').then(m => console.log('cheerio ok'))"
```

Each line should print `ok` with no errors.

- [ ] **Step 3: Add env vars to .env**

In `apps/api/.env` (create if missing), add:

```
ANTHROPIC_API_KEY=your_key_here
TAVILY_API_KEY=your_key_here
```

- [ ] **Step 4: Commit**

```bash
cd ../..
git add apps/api/package.json apps/api/package-lock.json
git commit -m "feat: add anthropic, tavily, cheerio to api dependencies"
```

---

## Task 3: URL Importer

**Files:**
- Create: `apps/api/src/services/urlImport.ts`
- Create: `apps/api/src/services/urlImport.test.ts`

A `ParsedDeckEntry` is `{ name: string; quantity: number; section: string }`.

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/services/urlImport.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { detectUrlType, parseDecklistText } from "./urlImport.js";

describe("detectUrlType", () => {
  it("detects moxfield URLs", () => {
    expect(detectUrlType("https://www.moxfield.com/decks/abc123")).toBe("moxfield");
  });
  it("detects archidekt URLs", () => {
    expect(detectUrlType("https://archidekt.com/decks/123456/my-deck")).toBe("archidekt");
  });
  it("detects mtggoldfish URLs", () => {
    expect(detectUrlType("https://www.mtggoldfish.com/deck/6789012#paper")).toBe("mtggoldfish");
  });
  it("returns null for unknown URLs", () => {
    expect(detectUrlType("https://example.com/deck")).toBeNull();
  });
});

describe("parseDecklistText", () => {
  it("parses standard MTG decklist format", () => {
    const text = `1 Sol Ring\n4 Lightning Bolt\n\n// Sideboard\n2 Negate`;
    const result = parseDecklistText(text);
    expect(result).toContainEqual({ name: "Sol Ring", quantity: 1, section: "mainboard" });
    expect(result).toContainEqual({ name: "Lightning Bolt", quantity: 4, section: "mainboard" });
    expect(result).toContainEqual({ name: "Negate", quantity: 2, section: "sideboard" });
  });
  it("handles COMMANDER: section marker", () => {
    const text = `COMMANDER:\n1 Atraxa, Praetors' Voice\nDECK:\n1 Sol Ring`;
    const result = parseDecklistText(text);
    expect(result).toContainEqual({ name: "Atraxa, Praetors' Voice", quantity: 1, section: "commander" });
    expect(result).toContainEqual({ name: "Sol Ring", quantity: 1, section: "mainboard" });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api
npx vitest run src/services/urlImport.test.ts
```

Expected: FAIL — `urlImport.js` not found.

- [ ] **Step 3: Implement urlImport.ts**

Create `apps/api/src/services/urlImport.ts`:

```typescript
export interface ParsedDeckEntry {
  name: string;
  quantity: number;
  section: "mainboard" | "sideboard" | "commander" | "companion";
}

export type UrlType = "moxfield" | "archidekt" | "mtggoldfish";

export function detectUrlType(url: string): UrlType | null {
  if (url.includes("moxfield.com/decks/")) return "moxfield";
  if (url.includes("archidekt.com/decks/")) return "archidekt";
  if (url.includes("mtggoldfish.com/deck/")) return "mtggoldfish";
  return null;
}

/**
 * Parse plain-text MTG decklist into structured entries.
 * Handles: "4 Lightning Bolt", "// Sideboard", "COMMANDER:", "DECK:" section markers.
 */
export function parseDecklistText(text: string): ParsedDeckEntry[] {
  const entries: ParsedDeckEntry[] = [];
  let currentSection: ParsedDeckEntry["section"] = "mainboard";

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//")) {
      if (line.toLowerCase().includes("sideboard")) currentSection = "sideboard";
      if (line.toLowerCase().includes("commander")) currentSection = "commander";
      continue;
    }

    const sectionMarker = line.replace(":", "").toLowerCase();
    if (sectionMarker === "commander") { currentSection = "commander"; continue; }
    if (sectionMarker === "deck" || sectionMarker === "mainboard") { currentSection = "mainboard"; continue; }
    if (sectionMarker === "sideboard") { currentSection = "sideboard"; continue; }
    if (sectionMarker === "companion") { currentSection = "companion"; continue; }

    const match = line.match(/^(\d+)x?\s+(.+)$/);
    if (!match) continue;
    const [, qty, name] = match;
    entries.push({ name: name.trim(), quantity: parseInt(qty, 10), section: currentSection });
  }

  return entries;
}

/**
 * Fetch a deck from a supported URL and return parsed entries.
 * Throws on network error or unsupported URL.
 */
export async function importDeckFromUrl(url: string): Promise<ParsedDeckEntry[]> {
  const type = detectUrlType(url);
  if (!type) throw new Error(`Unsupported deck URL: ${url}`);

  if (type === "moxfield") return importMoxfield(url);
  if (type === "archidekt") return importArchidekt(url);
  return importMtgGoldfish(url);
}

async function importMoxfield(url: string): Promise<ParsedDeckEntry[]> {
  // Extract deck ID: https://www.moxfield.com/decks/{deckId}
  const deckId = url.split("/decks/")[1]?.split(/[/?#]/)[0];
  if (!deckId) throw new Error("Cannot parse Moxfield deck ID from URL");

  const res = await fetch(`https://api2.moxfield.com/v3/decks/all/${deckId}`, {
    headers: { "User-Agent": "CardEngine/1.0 (contact@cardengine.app)" },
  });
  if (!res.ok) throw new Error(`Moxfield API error: ${res.status}`);

  const data = await res.json() as Record<string, unknown>;
  const entries: ParsedDeckEntry[] = [];

  function extractZone(zone: unknown, section: ParsedDeckEntry["section"]) {
    if (!zone || typeof zone !== "object") return;
    for (const [, card] of Object.entries(zone as Record<string, unknown>)) {
      const c = card as Record<string, unknown>;
      const name = (c.card as Record<string, unknown>)?.name as string;
      const qty = c.quantity as number;
      if (name && qty) entries.push({ name, quantity: qty, section });
    }
  }

  extractZone(data.mainboard, "mainboard");
  extractZone(data.sideboard, "sideboard");
  extractZone(data.commanders, "commander");
  extractZone(data.companions, "companion");

  return entries;
}

async function importArchidekt(url: string): Promise<ParsedDeckEntry[]> {
  // Extract deck ID: https://archidekt.com/decks/{deckId}/name
  const deckId = url.split("/decks/")[1]?.split(/[/#]/)[0];
  if (!deckId) throw new Error("Cannot parse Archidekt deck ID from URL");

  const res = await fetch(`https://archidekt.com/api/decks/${deckId}/`, {
    headers: { "User-Agent": "CardEngine/1.0 (contact@cardengine.app)" },
  });
  if (!res.ok) throw new Error(`Archidekt API error: ${res.status}`);

  const data = await res.json() as Record<string, unknown>;
  const cards = (data.cards as Array<Record<string, unknown>>) ?? [];

  return cards.map((c) => {
    const categories = (c.categories as string[]) ?? [];
    let section: ParsedDeckEntry["section"] = "mainboard";
    if (categories.some((cat) => cat.toLowerCase() === "commander")) section = "commander";
    else if (categories.some((cat) => cat.toLowerCase() === "sideboard")) section = "sideboard";

    const card = c.card as Record<string, unknown>;
    const oracleCard = card.oracleCard as Record<string, unknown>;
    return {
      name: oracleCard.name as string,
      quantity: c.quantity as number,
      section,
    };
  });
}

async function importMtgGoldfish(url: string): Promise<ParsedDeckEntry[]> {
  // Extract deck ID: https://www.mtggoldfish.com/deck/{deckId}#paper
  const deckId = url.split("/deck/")[1]?.split(/[#?]/)[0];
  if (!deckId) throw new Error("Cannot parse MTGGoldfish deck ID from URL");

  // Use the download endpoint which returns plain text
  const res = await fetch(`https://www.mtggoldfish.com/deck/download/${deckId}`, {
    headers: { "User-Agent": "CardEngine/1.0 (contact@cardengine.app)" },
  });
  if (!res.ok) throw new Error(`MTGGoldfish download error: ${res.status}`);

  const text = await res.text();
  return parseDecklistText(text);
}
```

- [ ] **Step 4: Run tests — confirm passing**

```bash
npx vitest run src/services/urlImport.test.ts
```

Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/api/src/services/urlImport.ts apps/api/src/services/urlImport.test.ts
git commit -m "feat: implement URL importer for Moxfield, Archidekt, MTGGoldfish"
```

---

## Task 4: Agent Tools

**Files:**
- Create: `apps/api/src/services/deckAgentTools.ts`
- Create: `apps/api/src/services/deckAgentTools.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/services/deckAgentTools.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing tools
vi.mock("../db.js", () => ({
  prisma: {
    cardVariant: { findMany: vi.fn() },
    priceCache: { findMany: vi.fn() },
    metaSnapshot: { findUnique: vi.fn() },
    collectionEvent: { findMany: vi.fn() },
  },
}));

import { buildGetCardDetails, buildGetCollection } from "./deckAgentTools.js";
import { prisma } from "../db.js";

describe("buildGetCardDetails", () => {
  it("returns card details from local DB", async () => {
    vi.mocked(prisma.cardVariant.findMany).mockResolvedValue([
      {
        variantId: "abc",
        name: "Sol Ring",
        imageUri: "https://example.com/sol-ring.jpg",
        typeLine: "Artifact",
        manaCost: "{1}",
        colorIdentity: [],
        game: "mtg",
        cardId: "c1",
        printingId: "p1",
        setId: null,
        collectorNumber: null,
        oracleText: null,
        colors: null,
        cmc: 1,
        rarity: "uncommon",
        dHash: null,
        pHash: null,
        foilDHash: null,
        foilPHash: null,
        updatedAt: new Date(),
      } as any,
    ]);
    vi.mocked(prisma.priceCache.findMany).mockResolvedValue([
      { id: "1", variantId: "abc", amount: 2.5, market: "tcgplayer", kind: "market", currency: "USD", updatedAt: new Date() } as any,
    ]);

    const getCardDetails = buildGetCardDetails();
    const result = await getCardDetails(["Sol Ring"]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Sol Ring");
    expect(result[0].priceUsd).toBe(2.5);
    expect(result[0].imageUri).toBe("https://example.com/sol-ring.jpg");
  });
});

describe("buildGetCollection", () => {
  it("returns owned card names for a user", async () => {
    vi.mocked(prisma.collectionEvent.findMany).mockResolvedValue([
      { type: "add", variantId: "abc", payload: { quantity: 1 } } as any,
    ]);
    vi.mocked(prisma.cardVariant.findMany).mockResolvedValue([
      { name: "Sol Ring", variantId: "abc" } as any,
    ]);

    const getCollection = buildGetCollection();
    const result = await getCollection("user-123");

    expect(result).toContainEqual({ name: "sol ring", variantId: "abc" });
  });
});
```

- [ ] **Step 2: Run to confirm failing**

```bash
cd apps/api
npx vitest run src/services/deckAgentTools.test.ts
```

Expected: FAIL — `deckAgentTools.js` not found.

- [ ] **Step 3: Implement deckAgentTools.ts**

Create `apps/api/src/services/deckAgentTools.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { TavilyClient } from "@tavily/core";
import { prisma } from "../db.js";
import { fetchEdhrecCommander } from "./edhrec.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CardDetail {
  name: string;
  variantId: string | null;
  imageUri: string | null;
  typeLine: string | null;
  manaCost: string | null;
  priceUsd: number | null;
}

export interface OwnedCard {
  name: string;
  variantId: string;
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export interface MetaSnapshotData {
  topDecks: Array<{ name: string; colors: string[]; archetype: string }>;
  staples: string[];
  fetchedAt: string;
}

// ── Tool: get_card_details ─────────────────────────────────────────────────────

export function buildGetCardDetails() {
  return async function getCardDetails(cardNames: string[]): Promise<CardDetail[]> {
    if (cardNames.length === 0) return [];

    const variants = await prisma.cardVariant.findMany({
      where: { game: "mtg", name: { in: cardNames, mode: "insensitive" } },
      select: { variantId: true, name: true, imageUri: true, typeLine: true, manaCost: true },
    });

    // Deduplicate: prefer non-foil
    const dbMap = new Map<string, { variantId: string; imageUri: string | null; typeLine: string | null; manaCost: string | null }>();
    for (const v of variants) {
      const key = v.name.toLowerCase();
      if (!dbMap.has(key) || dbMap.get(key)!.variantId.endsWith("-foil")) {
        dbMap.set(key, { variantId: v.variantId, imageUri: v.imageUri, typeLine: v.typeLine, manaCost: v.manaCost });
      }
    }

    // Batch price lookup
    const variantIds = [...dbMap.values()].map((v) => v.variantId);
    const prices = variantIds.length > 0
      ? await prisma.priceCache.findMany({
          where: { variantId: { in: variantIds }, market: "tcgplayer", kind: "market", currency: "USD" },
        })
      : [];
    const priceMap = new Map(prices.map((p) => [p.variantId, p.amount]));

    return cardNames.map((name) => {
      const key = name.toLowerCase();
      const db = dbMap.get(key) ?? null;
      // Scryfall fallback for image if not in DB
      const scryfallImage = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;
      return {
        name,
        variantId: db?.variantId ?? null,
        imageUri: db?.imageUri ?? scryfallImage,
        typeLine: db?.typeLine ?? null,
        manaCost: db?.manaCost ?? null,
        priceUsd: db ? (priceMap.get(db.variantId) ?? null) : null,
      };
    });
  };
}

// ── Tool: get_collection ──────────────────────────────────────────────────────

export function buildGetCollection() {
  return async function getCollection(userId: string): Promise<OwnedCard[]> {
    const events = await prisma.collectionEvent.findMany({
      where: { userId },
      select: { type: true, variantId: true, payload: true },
    });

    const quantities = new Map<string, number>();
    for (const e of events) {
      const qty = quantities.get(e.variantId) ?? 0;
      const payload = e.payload as Record<string, unknown>;
      const eventQty = (payload.quantity as number) ?? 1;
      quantities.set(e.variantId, e.type === "add" ? qty + eventQty : qty - eventQty);
    }

    const variantIds = [...quantities.entries()].filter(([, q]) => q > 0).map(([vid]) => vid);
    if (variantIds.length === 0) return [];

    const variants = await prisma.cardVariant.findMany({
      where: { variantId: { in: variantIds } },
      select: { name: true, variantId: true },
    });

    return variants.map((v) => ({ name: v.name.toLowerCase(), variantId: v.variantId }));
  };
}

// ── Tool: get_meta_snapshot ───────────────────────────────────────────────────

export function buildGetMetaSnapshot() {
  return async function getMetaSnapshot(format: string, bracket: number): Promise<MetaSnapshotData | null> {
    const snap = await prisma.metaSnapshot.findUnique({
      where: { format_bracket: { format, bracket } },
    });
    if (!snap) return null;
    return snap.data as MetaSnapshotData;
  };
}

// ── Tool: search_web ──────────────────────────────────────────────────────────

export function buildSearchWeb() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    // Graceful fallback if no key configured
    return async (_query: string): Promise<SearchResult[]> => [];
  }
  const client = new TavilyClient({ apiKey });

  return async function searchWeb(query: string): Promise<SearchResult[]> {
    try {
      const response = await client.search(query, {
        maxResults: 5,
        searchDepth: "basic",
      });
      return (response.results ?? []).map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        content: r.content?.slice(0, 800) ?? "", // truncate for token budget
      }));
    } catch {
      return [];
    }
  };
}

// ── Tool definitions for Claude ───────────────────────────────────────────────

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "fetch_edhrec",
    description: "Fetch EDHREC commander page data: synergy scores, inclusion rates, popular cards, themes, and similar commanders. Always call this first for any commander deck.",
    input_schema: {
      type: "object" as const,
      properties: {
        commanderName: { type: "string", description: "Exact commander card name, e.g. 'Atraxa, Praetors Voice'" },
      },
      required: ["commanderName"],
    },
  },
  {
    name: "search_web",
    description: "Search the web for current MTG deck tech, Reddit discussions, tournament results, and upgrade guides. Use for Bracket 3-5 or when you need recent community knowledge.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query, e.g. 'Atraxa superfriends cEDH 2025 upgrades site:reddit.com'" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_meta_snapshot",
    description: "Get the cached MTGGoldfish meta snapshot for a format and bracket. Use for Bracket 4-5 commander or competitive constructed formats.",
    input_schema: {
      type: "object" as const,
      properties: {
        format: { type: "string", enum: ["commander", "standard", "modern", "pioneer", "legacy"] },
        bracket: { type: "number", description: "1-5 for commander (RC brackets), 0 for non-commander formats" },
      },
      required: ["format", "bracket"],
    },
  },
  {
    name: "get_card_details",
    description: "Look up card details (image, type, mana cost, price) for a list of card names. Call this after finalizing your card list to verify names are real and get prices.",
    input_schema: {
      type: "object" as const,
      properties: {
        cardNames: { type: "array", items: { type: "string" }, description: "Array of exact MTG card names to look up" },
      },
      required: ["cardNames"],
    },
  },
  {
    name: "get_collection",
    description: "Get the user's owned cards. Only call if a userId is provided. Use to prioritize owned cards in recommendations.",
    input_schema: {
      type: "object" as const,
      properties: {
        userId: { type: "string", description: "The authenticated user's ID" },
      },
      required: ["userId"],
    },
  },
];

// ── Tool executor ─────────────────────────────────────────────────────────────

export function buildToolExecutor(userId?: string) {
  const getCardDetails = buildGetCardDetails();
  const getCollection = buildGetCollection();
  const getMetaSnapshot = buildGetMetaSnapshot();
  const searchWeb = buildSearchWeb();

  return async function executeTool(
    name: string,
    input: Record<string, unknown>
  ): Promise<unknown> {
    switch (name) {
      case "fetch_edhrec":
        return fetchEdhrecCommander(input.commanderName as string);
      case "search_web":
        return searchWeb(input.query as string);
      case "get_meta_snapshot":
        return getMetaSnapshot(input.format as string, input.bracket as number);
      case "get_card_details":
        return getCardDetails(input.cardNames as string[]);
      case "get_collection":
        return getCollection((input.userId as string | undefined) ?? userId ?? "");
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  };
}
```

- [ ] **Step 4: Run tests — confirm passing**

```bash
npx vitest run src/services/deckAgentTools.test.ts
```

Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/api/src/services/deckAgentTools.ts apps/api/src/services/deckAgentTools.test.ts
git commit -m "feat: implement deck agent tools (edhrec, search, meta, cards, collection)"
```

---

## Task 5: MTGGoldfish Nightly Snapshot Job

**Files:**
- Create: `apps/api/src/jobs/metaSnapshotJob.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Implement metaSnapshotJob.ts**

Create `apps/api/src/jobs/metaSnapshotJob.ts`:

```typescript
import * as cheerio from "cheerio";
import { prisma } from "../db.js";

interface TopDeck {
  name: string;
  colors: string[];
  archetype: string;
}

/**
 * Scrape MTGGoldfish commander meta page and store top decks.
 * Runs nightly. Format is always "commander" for now; bracket is 0 (all brackets).
 */
export async function runMetaSnapshotJob(): Promise<void> {
  console.log("[meta-snapshot] Starting MTGGoldfish scrape...");

  try {
    const topDecks = await scrapeCommanderMeta();
    const staples = extractStaples(topDecks);

    await prisma.metaSnapshot.upsert({
      where: { format_bracket: { format: "commander", bracket: 0 } },
      create: {
        format: "commander",
        bracket: 0,
        data: { topDecks, staples, fetchedAt: new Date().toISOString() },
      },
      update: {
        data: { topDecks, staples, fetchedAt: new Date().toISOString() },
        fetchedAt: new Date(),
      },
    });

    console.log(`[meta-snapshot] Stored ${topDecks.length} top commander decks.`);
  } catch (err) {
    console.error("[meta-snapshot] Scrape failed:", err);
    // Non-fatal: the agent falls back to EDHREC + web search
  }
}

async function scrapeCommanderMeta(): Promise<TopDeck[]> {
  const res = await fetch("https://www.mtggoldfish.com/metagame/commander#paper", {
    headers: { "User-Agent": "CardEngine/1.0 (contact@cardengine.app)" },
  });
  if (!res.ok) throw new Error(`MTGGoldfish HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const decks: TopDeck[] = [];

  // MTGGoldfish metagame page: each deck is in .archetype-tile
  $(".archetype-tile").each((_i, el) => {
    const name = $(el).find(".archetype-tile-title").text().trim();
    const colorsRaw = $(el).find(".color-label").attr("title") ?? "";
    const colors = colorsRaw
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    if (name) {
      decks.push({ name, colors, archetype: name });
    }
  });

  return decks.slice(0, 50); // top 50
}

function extractStaples(decks: TopDeck[]): string[] {
  // Common staples by archetype name pattern — supplemented by web search at query time
  const stapleKeywords = [
    "Sol Ring", "Arcane Signet", "Command Tower", "Cyclonic Rift",
    "Rhystic Study", "Smothering Tithe", "Demonic Tutor", "Vampiric Tutor",
  ];
  return stapleKeywords;
}
```

- [ ] **Step 2: Register the job in index.ts**

In `apps/api/src/index.ts`, add the import after the existing job imports:

```typescript
import { runMetaSnapshotJob } from "./jobs/metaSnapshotJob.js";
```

Then add the scheduled job after the watchlist check block (before `// ── Start server ──`):

```typescript
// ── Meta snapshot job (nightly) ──
const NIGHTLY_MS = 24 * 60 * 60 * 1000;
if (process.env.ENABLE_META_SNAPSHOT !== "false") {
  // Run once on boot if no snapshot exists, then nightly
  runMetaSnapshotJob().catch((err) => console.error("[meta-snapshot] Boot run failed:", err));
  setInterval(async () => {
    const ran = await withAdvisoryLock("metaSnapshot", async () => {
      await runMetaSnapshotJob();
    }).catch((err) => {
      console.error("[meta-snapshot] Lock error:", err);
      return false;
    });
    if (!ran) console.log("[meta-snapshot] Another instance is handling this cycle.");
  }, NIGHTLY_MS);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/api
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add apps/api/src/jobs/metaSnapshotJob.ts apps/api/src/index.ts
git commit -m "feat: add MTGGoldfish nightly meta snapshot job"
```

---

## Task 6: System Prompts + Mode Detection

**Files:**
- Create: `apps/api/src/services/deckAgentPrompts.ts`

- [ ] **Step 1: Implement deckAgentPrompts.ts**

Create `apps/api/src/services/deckAgentPrompts.ts`:

```typescript
export type AgentMode = "build" | "upgrade" | "modify";

export interface AgentContext {
  bracket: 1 | 2 | 3 | 4 | 5;
  budget: number; // total deck budget in USD
  commander?: string;
  deckCards?: string[]; // card names currently in deck
  userId?: string;
  instruction: string;
}

/**
 * Detect mode from user input and whether a deck is present.
 */
export function detectMode(instruction: string, hasDeck: boolean): AgentMode {
  if (!hasDeck) return "build";
  const lower = instruction.toLowerCase();
  const upgradeWords = ["upgrade", "improve", "better", "optimize", "strengthen", "enhance"];
  if (upgradeWords.some((w) => lower.includes(w))) return "upgrade";
  return "modify";
}

const BRACKET_LABELS: Record<number, string> = {
  1: "Exhibition (precon-level, no combos, janky fun)",
  2: "Core (upgraded precon, casual synergies, no infinite combos)",
  3: "Upgraded (focused strategy, powerful synergies, some tutors)",
  4: "Optimized (near-cEDH, efficient win conditions, strong interaction)",
  5: "cEDH (fully competitive, fast mana, best cards for the strategy)",
};

const OUTPUT_FORMAT = `
## Output Format

Stream your response using EXACTLY this structured format. Do not deviate from these tokens.

For each status update:
STATUS: <message>

For each card tier, open with:
TIER: <tier name>

For each card in a tier:
CARD: <exact card name>
REASON: <1-2 sentences: why this card belongs here and its strategic role>
GAMEPLAY: <1-2 sentences: when to cast it, what it enables, key interactions>
IMPORTANCE: <critical|high|flex>

For upgrade cut/add pairs (upgrade mode only):
CUT: <exact card name>
CUT_REASON: <why this card is weak here>
ADD: <exact card name>
ADD_REASON: <why this replacement is better>
NET_SYNERGY: <+X.XX or -X.XX>

Rules:
- Use ONLY real MTG card names. Call get_card_details to verify any card you are unsure about.
- Use STATUS: lines to keep the user informed as you work (e.g., "STATUS: Fetching EDHREC data for Atraxa...")
- Emit TIER: lines in this order: Win Conditions → Core Engine → Strong Includes → Flex Slots → (Cuts for upgrade mode)
- Always end with STATUS: Done.
`;

export function buildSystemPrompt(mode: AgentMode, ctx: AgentContext): string {
  const bracketLabel = BRACKET_LABELS[ctx.bracket];
  const budgetLine = `Total deck budget: $${ctx.budget}. Per-card ceiling: $${Math.round(ctx.budget / 30)}. Never recommend cards above this ceiling unless the user explicitly names them.`;
  const collectionLine = ctx.userId
    ? "Call get_collection to see what the user owns. Prioritize owned cards — mark them clearly."
    : "No user collection available.";

  if (mode === "build") {
    return `You are an elite Magic: The Gathering deck architect with encyclopedic knowledge of all formats, card interactions, and competitive metagames.

## Task: Build a complete Commander deck from scratch.

Target power level: Bracket ${ctx.bracket} — ${bracketLabel}
${budgetLine}
${collectionLine}

## Process
1. Call fetch_edhrec for the commander to understand the card pool and top synergies.
2. If Bracket 4-5, call get_meta_snapshot("commander", ${ctx.bracket}) and search_web for recent cEDH/competitive builds.
3. If Bracket 3+, call search_web with a targeted query like "${ctx.commander ?? "[commander]"} bracket ${ctx.bracket} deck guide site:reddit.com".
4. Call get_card_details on your final card list before outputting to verify names and prices.
5. Build a full 99-card list covering: win conditions, ramp (10-12), card draw (8-10), interaction (8-10), synergy pieces, and 35-38 lands.
6. Respect the budget hard. Sum up prices. If over budget, swap expensive cards for efficient budget alternatives.

${OUTPUT_FORMAT}`;
  }

  if (mode === "upgrade") {
    const deckList = (ctx.deckCards ?? []).join(", ");
    return `You are an elite Magic: The Gathering deck upgrader. You analyze existing decks and identify the highest-impact improvements.

## Task: Upgrade the provided Commander deck.

Current deck cards: ${deckList}
Target power level: Bracket ${ctx.bracket} — ${bracketLabel}
${budgetLine}
${collectionLine}

## Process
1. Call fetch_edhrec for the commander to score every card in the current deck by synergy and inclusion rate.
2. Identify weak cards: synergy < 0, inclusion rate < 10%, or cards that don't serve the deck strategy.
3. If Bracket 3+, call search_web for recent upgrade guides and community discussion.
4. Find high-synergy replacements from EDHREC data and web results.
5. Pair cuts with adds: match categories (creature → creature, draw → draw) where possible.
6. Call get_card_details to verify all add cards are real and within budget.
7. Output 10-15 cut/add pairs ordered by net synergy gain (highest first).

For each pair, explain concisely why the cut is weak and why the add is a clear upgrade.

${OUTPUT_FORMAT}`;
  }

  // modify
  const deckList = (ctx.deckCards ?? []).join(", ");
  return `You are an elite Magic: The Gathering deck tuner. You make precise, surgical changes to existing decks based on specific instructions.

## Task: Modify the provided Commander deck based on the user's instruction.

Current deck cards: ${deckList}
Target power level: Bracket ${ctx.bracket} — ${bracketLabel}
${budgetLine}
${collectionLine}

## Process
1. Read the user's instruction carefully. Identify ONLY the cards that need to change.
2. If ≤8 cards are affected, make the changes and output only the affected cards as swaps.
3. If >30% of the deck would change, emit this exact line before doing anything:
   STATUS: ESCALATE — This change affects most of the deck. Do you want a full rebuild, or should I push the current strategy as far as possible with this direction?
   Then stop and wait.
4. Call get_card_details to verify replacement card names and prices before outputting.
5. Keep every unchanged card exactly as-is.

${OUTPUT_FORMAT}`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/api
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add apps/api/src/services/deckAgentPrompts.ts
git commit -m "feat: add deck agent system prompts and mode detection"
```

---

## Task 7: Agent Core Loop

**Files:**
- Create: `apps/api/src/services/deckAgent.ts`

- [ ] **Step 1: Implement deckAgent.ts**

Create `apps/api/src/services/deckAgent.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, detectMode, type AgentContext, type AgentMode } from "./deckAgentPrompts.js";
import { AGENT_TOOLS, buildToolExecutor } from "./deckAgentTools.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface AgentRequest {
  instruction: string;
  bracket: 1 | 2 | 3 | 4 | 5;
  budget: number;
  commander?: string;
  deckCards?: string[];
  userId?: string;
  sessionMessages?: Anthropic.MessageParam[]; // for refinements
}

/**
 * Run the deck agent and yield SSE-formatted strings.
 * Each yielded string is a complete SSE line ready to write to the response.
 */
export async function* runDeckAgent(req: AgentRequest): AsyncGenerator<string> {
  const hasDeck = (req.deckCards?.length ?? 0) > 0;
  const mode: AgentMode = detectMode(req.instruction, hasDeck);

  const ctx: AgentContext = {
    bracket: req.bracket,
    budget: req.budget,
    commander: req.commander,
    deckCards: req.deckCards,
    userId: req.userId,
    instruction: req.instruction,
  };

  const systemPrompt = buildSystemPrompt(mode, ctx);
  const executeTool = buildToolExecutor(req.userId);

  // Build message history: prior session messages + new user message
  const messages: Anthropic.MessageParam[] = [
    ...(req.sessionMessages ?? []),
    { role: "user", content: req.instruction },
  ];

  // Emit mode so the client knows how to render output
  yield sseJson({ type: "mode", mode });

  let iterations = 0;
  const MAX_ITERATIONS = 10; // safety guard

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const stream = client.messages.stream({
      model: "claude-opus-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      tools: AGENT_TOOLS,
      messages,
    });

    // Stream text deltas immediately; buffer tool_use blocks
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield sseJson({ type: "text", text: event.delta.text });
      }

      if (
        event.type === "content_block_start" &&
        event.content_block.type === "tool_use"
      ) {
        yield sseJson({ type: "tool_start", tool: event.content_block.name });
      }
    }

    const finalMsg = await stream.finalMessage();
    messages.push({ role: "assistant", content: finalMsg.content });

    // End of conversation
    if (finalMsg.stop_reason === "end_turn") break;

    // Execute tool calls in parallel, yield done events sequentially
    if (finalMsg.stop_reason === "tool_use") {
      const toolBlocks = finalMsg.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      const results = await Promise.all(
        toolBlocks.map(async (block) => {
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>
          );
          return { block, result };
        })
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const { block, result } of results) {
        yield sseJson({ type: "tool_done", tool: block.name });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  // Return updated messages for session persistence
  yield sseJson({ type: "session", messages });
  yield "data: [DONE]\n\n";
}

function sseJson(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/api
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add apps/api/src/services/deckAgent.ts
git commit -m "feat: implement agentic deck builder core loop"
```

---

## Task 8: Agent Route + Registration

**Files:**
- Create: `apps/api/src/routes/deckAgent.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Implement the route**

Create `apps/api/src/routes/deckAgent.ts`:

```typescript
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { optionalAuth, type AuthUser } from "../middleware/auth.js";
import { runDeckAgent } from "../services/deckAgent.js";
import { importDeckFromUrl, parseDecklistText } from "../services/urlImport.js";
import type Anthropic from "@anthropic-ai/sdk";

const AgentRequestSchema = z.object({
  instruction: z.string().min(1).max(2000),
  bracket: z.number().int().min(1).max(5) as z.ZodType<1 | 2 | 3 | 4 | 5>,
  budget: z.number().min(0).max(100000),
  commander: z.string().optional(),
  deckText: z.string().optional(),    // pasted decklist text
  deckUrl: z.string().url().optional(), // Moxfield/Archidekt/MTGGoldfish URL
  deckId: z.string().optional(),        // saved deck in DB
  sessionId: z.string().optional(),     // for refinements
});

export function registerDeckAgentRoutes(app: FastifyInstance) {
  app.post(
    "/v1/deck/agent",
    {
      preHandler: [optionalAuth],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const user = (req as FastifyRequest & { user?: AuthUser }).user;
      const body = AgentRequestSchema.parse(req.body);

      // Resolve deck cards from whichever input method was provided
      let deckCards: string[] = [];

      if (body.deckUrl) {
        const entries = await importDeckFromUrl(body.deckUrl);
        deckCards = entries.map((e) => e.name);
      } else if (body.deckText) {
        const entries = parseDecklistText(body.deckText);
        deckCards = entries.map((e) => e.name);
      } else if (body.deckId && user) {
        const deck = await prisma.deck.findUnique({
          where: { id: body.deckId },
          include: { cards: true },
        });
        if (!deck || deck.userId !== user.sub) {
          return reply.code(404).send({ error: "Deck not found" });
        }
        deckCards = deck.cards.map((c) => c.cardName);
      }

      // Load session history for refinements
      let sessionMessages: Anthropic.MessageParam[] | undefined;
      if (body.sessionId) {
        const session = await prisma.agentSession.findUnique({
          where: { id: body.sessionId },
        });
        if (session) {
          sessionMessages = session.messages as Anthropic.MessageParam[];
        }
      }

      // Stream SSE response
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.flushHeaders();

      const generator = runDeckAgent({
        instruction: body.instruction,
        bracket: body.bracket,
        budget: body.budget,
        commander: body.commander,
        deckCards,
        userId: user?.sub,
        sessionMessages,
      });

      for await (const chunk of generator) {
        // Persist session messages when agent emits them
        if (chunk.startsWith('data: {"type":"session"')) {
          try {
            const parsed = JSON.parse(chunk.replace("data: ", "").replace(/\n\n$/, ""));
            const sessionId = body.sessionId ?? undefined;
            if (sessionId) {
              await prisma.agentSession.update({
                where: { id: sessionId },
                data: { messages: parsed.messages, updatedAt: new Date() },
              });
            } else {
              const newSession = await prisma.agentSession.create({
                data: {
                  userId: user?.sub ?? null,
                  messages: parsed.messages,
                  context: { bracket: body.bracket, budget: body.budget, commander: body.commander },
                },
              });
              // Send the new session ID to the client
              reply.raw.write(`data: ${JSON.stringify({ type: "session_id", id: newSession.id })}\n\n`);
            }
          } catch {
            // Non-fatal: session persistence failure doesn't break the response
          }
          continue; // Don't forward the raw session chunk to client
        }

        reply.raw.write(chunk);
        // Flush is automatic in Node HTTP — no manual flush needed
      }

      reply.raw.end();
    }
  );
}
```

- [ ] **Step 2: Register the route in index.ts**

In `apps/api/src/index.ts`, add the import:

```typescript
import { registerDeckAgentRoutes } from "./routes/deckAgent.js";
```

Add registration after the existing route registrations:

```typescript
registerDeckAgentRoutes(app);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/api
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke-test the endpoint**

```bash
cd apps/api
npm run dev &
sleep 3
curl -N -X POST http://localhost:3001/v1/deck/agent \
  -H "Content-Type: application/json" \
  -d '{"instruction":"Build a casual Atraxa superfriends deck","bracket":2,"budget":100}' \
  | head -20
```

Expected: SSE stream starting with `data: {"type":"mode","mode":"build"}` followed by text deltas.

Kill the dev server: `kill %1`

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/api/src/routes/deckAgent.ts apps/api/src/index.ts
git commit -m "feat: add POST /v1/deck/agent SSE endpoint"
```

---

## Task 9: Frontend Stream Parser

**Files:**
- Create: `apps/web/src/lib/deckAgentStream.ts`

- [ ] **Step 1: Implement deckAgentStream.ts**

Create `apps/web/src/lib/deckAgentStream.ts`:

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Event types emitted by the parser ─────────────────────────────────────────

export type AgentMode = "build" | "upgrade" | "modify";

export interface ParsedCard {
  name: string;
  reason: string;
  gameplay: string;
  importance: "critical" | "high" | "flex";
  tier: string;
}

export interface ParsedSwap {
  cut: { name: string; reason: string };
  add: { name: string; reason: string };
  netSynergy: number;
}

export type AgentEvent =
  | { type: "mode"; mode: AgentMode }
  | { type: "tool_start"; tool: string }
  | { type: "tool_done"; tool: string }
  | { type: "status"; message: string }
  | { type: "tier"; name: string }
  | { type: "card"; card: ParsedCard; tier: string }
  | { type: "swap"; swap: ParsedSwap }
  | { type: "escalate"; message: string }
  | { type: "session_id"; id: string }
  | { type: "done" };

// ── Stream parser ──────────────────────────────────────────────────────────────

/**
 * Parses the structured text format Claude emits line-by-line.
 * Maintains a small buffer to assemble multi-line card/swap blocks.
 */
class StreamParser {
  private currentTier = "";
  private cardBuffer: Partial<ParsedCard> | null = null;
  private swapBuffer: Partial<{ cut: { name: string; reason: string }; add: { name: string; reason: string }; netSynergy: number }> | null = null;
  private textBuffer = "";

  parse(text: string): AgentEvent[] {
    const events: AgentEvent[] = [];
    this.textBuffer += text;

    // Process complete lines
    const lines = this.textBuffer.split("\n");
    // Keep the last (possibly incomplete) line in the buffer
    this.textBuffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith("STATUS: ")) {
        const message = trimmed.slice(8).trim();
        if (message.startsWith("ESCALATE")) {
          events.push({ type: "escalate", message });
        } else {
          events.push({ type: "status", message });
        }
        continue;
      }

      if (trimmed.startsWith("TIER: ")) {
        // Flush any pending card
        const cardEvt = this.flushCard();
        if (cardEvt) events.push(cardEvt);
        const swapEvt = this.flushSwap();
        if (swapEvt) events.push(swapEvt);

        this.currentTier = trimmed.slice(6).trim();
        events.push({ type: "tier", name: this.currentTier });
        continue;
      }

      if (trimmed.startsWith("CARD: ")) {
        const cardEvt = this.flushCard();
        if (cardEvt) events.push(cardEvt);
        this.cardBuffer = { name: trimmed.slice(6).trim(), tier: this.currentTier };
        continue;
      }

      if (trimmed.startsWith("REASON: ") && this.cardBuffer) {
        this.cardBuffer.reason = trimmed.slice(8).trim();
        continue;
      }

      if (trimmed.startsWith("GAMEPLAY: ") && this.cardBuffer) {
        this.cardBuffer.gameplay = trimmed.slice(10).trim();
        continue;
      }

      if (trimmed.startsWith("IMPORTANCE: ") && this.cardBuffer) {
        const imp = trimmed.slice(12).trim().toLowerCase() as ParsedCard["importance"];
        this.cardBuffer.importance = imp;
        continue;
      }

      if (trimmed.startsWith("CUT: ")) {
        const swapEvt = this.flushSwap();
        if (swapEvt) events.push(swapEvt);
        this.swapBuffer = { cut: { name: trimmed.slice(5).trim(), reason: "" }, add: { name: "", reason: "" }, netSynergy: 0 };
        continue;
      }

      if (trimmed.startsWith("CUT_REASON: ") && this.swapBuffer?.cut) {
        this.swapBuffer.cut.reason = trimmed.slice(12).trim();
        continue;
      }

      if (trimmed.startsWith("ADD: ") && this.swapBuffer) {
        this.swapBuffer.add = { name: trimmed.slice(5).trim(), reason: "" };
        continue;
      }

      if (trimmed.startsWith("ADD_REASON: ") && this.swapBuffer?.add) {
        this.swapBuffer.add.reason = trimmed.slice(12).trim();
        continue;
      }

      if (trimmed.startsWith("NET_SYNERGY: ") && this.swapBuffer) {
        this.swapBuffer.netSynergy = parseFloat(trimmed.slice(13).trim()) || 0;
        continue;
      }
    }

    return events;
  }

  flush(): AgentEvent[] {
    const events: AgentEvent[] = [];
    const cardEvt = this.flushCard();
    if (cardEvt) events.push(cardEvt);
    const swapEvt = this.flushSwap();
    if (swapEvt) events.push(swapEvt);
    return events;
  }

  private flushCard(): AgentEvent | null {
    if (!this.cardBuffer?.name) return null;
    const card: ParsedCard = {
      name: this.cardBuffer.name,
      reason: this.cardBuffer.reason ?? "",
      gameplay: this.cardBuffer.gameplay ?? "",
      importance: this.cardBuffer.importance ?? "flex",
      tier: this.cardBuffer.tier ?? this.currentTier,
    };
    this.cardBuffer = null;
    return { type: "card", card, tier: card.tier };
  }

  private flushSwap(): AgentEvent | null {
    if (!this.swapBuffer?.cut?.name || !this.swapBuffer?.add?.name) return null;
    const swap: ParsedSwap = {
      cut: this.swapBuffer.cut as { name: string; reason: string },
      add: this.swapBuffer.add as { name: string; reason: string },
      netSynergy: this.swapBuffer.netSynergy ?? 0,
    };
    this.swapBuffer = null;
    return { type: "swap", swap };
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface AgentStreamRequest {
  instruction: string;
  bracket: 1 | 2 | 3 | 4 | 5;
  budget: number;
  commander?: string;
  deckText?: string;
  deckUrl?: string;
  deckId?: string;
  sessionId?: string;
  token?: string;
}

/**
 * Connect to the deck agent SSE stream and call onEvent for each parsed event.
 * Returns the final session ID for history navigation.
 */
export async function streamDeckAgent(
  req: AgentStreamRequest,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (req.token) headers["Authorization"] = `Bearer ${req.token}`;

  const res = await fetch(`${API_URL}/v1/deck/agent`, {
    method: "POST",
    headers,
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Agent error: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = new StreamParser();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          // Flush any remaining buffered content
          for (const evt of parser.flush()) onEvent(evt);
          onEvent({ type: "done" });
          return;
        }

        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;

          if (parsed.type === "mode") {
            onEvent({ type: "mode", mode: parsed.mode as AgentMode });
          } else if (parsed.type === "tool_start") {
            onEvent({ type: "tool_start", tool: parsed.tool as string });
          } else if (parsed.type === "tool_done") {
            onEvent({ type: "tool_done", tool: parsed.tool as string });
          } else if (parsed.type === "session_id") {
            onEvent({ type: "session_id", id: parsed.id as string });
          } else if (parsed.type === "text") {
            // Parse the structured text for card/tier/status events
            const evts = parser.parse(parsed.text as string);
            for (const evt of evts) onEvent(evt);
          }
        } catch {
          // Malformed SSE line — skip
        }
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/deckAgentStream.ts
git commit -m "feat: add deck agent SSE client and stream parser"
```

---

## Task 10: StatusPills Component

**Files:**
- Create: `apps/web/src/app/deck/components/StatusPills.tsx`

- [ ] **Step 1: Implement StatusPills.tsx**

Create `apps/web/src/app/deck/components/StatusPills.tsx`:

```tsx
"use client";

export interface ToolState {
  tool: string;
  status: "pending" | "running" | "done";
}

const TOOL_LABELS: Record<string, string> = {
  fetch_edhrec: "EDHREC",
  search_web: "Web Search",
  get_meta_snapshot: "Meta Snapshot",
  get_card_details: "Card Details",
  get_collection: "Your Collection",
};

interface StatusPillsProps {
  tools: ToolState[];
  statusMessage: string | null;
}

export function StatusPills({ tools, statusMessage }: StatusPillsProps) {
  if (tools.length === 0 && !statusMessage) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {tools.map((t) => (
        <span
          key={t.tool}
          className={[
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all duration-300",
            t.status === "running"
              ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
              : t.status === "done"
              ? "bg-slate-700/60 text-slate-400 border border-slate-600/40"
              : "bg-slate-800 text-slate-500 border border-slate-700",
          ].join(" ")}
        >
          {t.status === "running" && (
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
          )}
          {t.status === "done" && (
            <span className="text-teal-400">✓</span>
          )}
          {TOOL_LABELS[t.tool] ?? t.tool}
        </span>
      ))}
      {statusMessage && (
        <span className="text-xs text-slate-400 self-center ml-1 italic">
          {statusMessage}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/deck/components/StatusPills.tsx
git commit -m "feat: add StatusPills component for agent tool progress"
```

---

## Task 11: CardPanel Component

**Files:**
- Create: `apps/web/src/app/deck/components/CardPanel.tsx`

- [ ] **Step 1: Implement CardPanel.tsx**

Create `apps/web/src/app/deck/components/CardPanel.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { ParsedCard } from "@/lib/deckAgentStream";

const IMPORTANCE_STYLES: Record<ParsedCard["importance"], string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/40",
  high: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  flex: "bg-slate-600/40 text-slate-400 border-slate-500/40",
};

const IMPORTANCE_LABELS: Record<ParsedCard["importance"], string> = {
  critical: "Critical",
  high: "High Impact",
  flex: "Flex Slot",
};

interface CardPanelProps {
  card: ParsedCard;
  priceUsd?: number | null;
  imageUri?: string | null;
  onAdd?: (cardName: string) => void;
  added?: boolean;
}

export function CardPanel({ card, priceUsd, imageUri, onAdd, added }: CardPanelProps) {
  const [imgError, setImgError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const scryfallFallback = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image&version=normal`;
  const imgSrc = imgError ? scryfallFallback : (imageUri ?? scryfallFallback);

  return (
    <div
      className="group relative flex gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:border-teal-500/40 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
      style={{ animationDuration: "300ms" }}
    >
      {/* Card image */}
      <div className="flex-shrink-0 w-16 h-22 rounded-lg overflow-hidden bg-slate-700/50">
        <img
          src={imgSrc}
          alt={card.name}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      </div>

      {/* Card info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-100 truncate">{card.name}</h4>
            {priceUsd != null && (
              <span className="text-xs text-slate-400">${priceUsd.toFixed(2)}</span>
            )}
          </div>
          <span
            className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${IMPORTANCE_STYLES[card.importance]}`}
          >
            {IMPORTANCE_LABELS[card.importance]}
          </span>
        </div>

        {/* Why it's here */}
        <p className="mt-1.5 text-xs text-slate-300 leading-relaxed line-clamp-2">
          {card.reason}
        </p>

        {/* Expand for gameplay tip */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-xs text-teal-400 hover:text-teal-300 transition-colors"
        >
          {expanded ? "▲ Hide tip" : "▼ How to play"}
        </button>

        {expanded && (
          <p className="mt-1.5 text-xs text-slate-400 leading-relaxed italic">
            {card.gameplay}
          </p>
        )}

        {/* Add to deck */}
        <button
          onClick={() => onAdd?.(card.name)}
          disabled={added}
          className={[
            "mt-2 text-xs px-3 py-1 rounded-lg font-medium transition-all duration-150",
            added
              ? "bg-teal-600/30 text-teal-400 cursor-default"
              : "bg-teal-600/20 text-teal-300 hover:bg-teal-600/40 border border-teal-600/40",
          ].join(" ")}
        >
          {added ? "✓ Added" : "+ Add to Deck"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/deck/components/CardPanel.tsx
git commit -m "feat: add CardPanel component with image, reasoning, gameplay, add button"
```

---

## Task 12: CardGallery Component

**Files:**
- Create: `apps/web/src/app/deck/components/CardGallery.tsx`

- [ ] **Step 1: Implement CardGallery.tsx**

Create `apps/web/src/app/deck/components/CardGallery.tsx`:

```tsx
"use client";

import { CardPanel } from "./CardPanel";
import type { ParsedCard } from "@/lib/deckAgentStream";

interface TierGroup {
  name: string;
  cards: ParsedCard[];
}

interface CardGalleryProps {
  tiers: TierGroup[];
  cardDetails: Map<string, { priceUsd?: number | null; imageUri?: string | null }>;
  onAddCard: (cardName: string) => void;
  addedCards: Set<string>;
}

const TIER_ACCENT: Record<string, string> = {
  "Win Conditions": "border-red-500/30 bg-red-500/5",
  "Core Engine": "border-amber-500/30 bg-amber-500/5",
  "Strong Includes": "border-teal-500/30 bg-teal-500/5",
  "Flex Slots": "border-slate-500/30 bg-slate-500/5",
  "Cuts": "border-rose-500/30 bg-rose-500/5",
};

export function CardGallery({ tiers, cardDetails, onAddCard, addedCards }: CardGalleryProps) {
  if (tiers.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      {tiers.map((tier) => (
        <div key={tier.name}>
          <div
            className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border ${TIER_ACCENT[tier.name] ?? "border-slate-600/30 bg-slate-700/10"}`}
          >
            <span className="text-sm font-bold text-slate-200">{tier.name}</span>
            <span className="text-xs text-slate-500">({tier.cards.length} cards)</span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {tier.cards.map((card) => {
              const details = cardDetails.get(card.name.toLowerCase());
              return (
                <CardPanel
                  key={card.name}
                  card={card}
                  priceUsd={details?.priceUsd}
                  imageUri={details?.imageUri}
                  onAdd={onAddCard}
                  added={addedCards.has(card.name)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/deck/components/CardGallery.tsx
git commit -m "feat: add streaming CardGallery with tier grouping"
```

---

## Task 13: UpgradeDiff Component

**Files:**
- Create: `apps/web/src/app/deck/components/UpgradeDiff.tsx`

- [ ] **Step 1: Implement UpgradeDiff.tsx**

Create `apps/web/src/app/deck/components/UpgradeDiff.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { ParsedSwap } from "@/lib/deckAgentStream";

interface UpgradeDiffProps {
  swaps: ParsedSwap[];
  onAccept: (swap: ParsedSwap) => void;
  onReject: (swap: ParsedSwap) => void;
}

export function UpgradeDiff({ swaps, onAccept, onReject }: UpgradeDiffProps) {
  const [decisions, setDecisions] = useState<Map<string, "accepted" | "rejected">>(new Map());

  function decide(swap: ParsedSwap, decision: "accepted" | "rejected") {
    setDecisions((prev) => new Map(prev).set(swap.cut.name, decision));
    if (decision === "accepted") onAccept(swap);
    else onReject(swap);
  }

  if (swaps.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-bold text-slate-200 mb-1">
        Suggested Upgrades — {swaps.length} swaps
      </h3>
      {swaps.map((swap) => {
        const decision = decisions.get(swap.cut.name);
        return (
          <div
            key={swap.cut.name}
            className={[
              "grid grid-cols-[1fr_auto_1fr] gap-2 p-3 rounded-xl border transition-all duration-200",
              decision === "accepted"
                ? "border-teal-500/50 bg-teal-500/5 opacity-60"
                : decision === "rejected"
                ? "border-slate-600/30 bg-slate-800/30 opacity-40"
                : "border-slate-600/50 bg-slate-800/50",
            ].join(" ")}
          >
            {/* Cut */}
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="text-xs font-semibold text-red-400 mb-0.5">CUT</div>
              <div className="text-sm text-slate-200 font-medium">{swap.cut.name}</div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{swap.cut.reason}</p>
            </div>

            {/* Net synergy + decision */}
            <div className="flex flex-col items-center justify-center gap-2 px-1">
              <div
                className={`text-xs font-bold ${swap.netSynergy >= 0 ? "text-teal-400" : "text-red-400"}`}
              >
                {swap.netSynergy >= 0 ? "+" : ""}{(swap.netSynergy * 100).toFixed(0)}%
              </div>
              <span className="text-slate-600 text-lg">→</span>
              {!decision && (
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => decide(swap, "accepted")}
                    className="text-xs px-2 py-1 rounded bg-teal-600/30 text-teal-300 hover:bg-teal-600/50 border border-teal-600/40 transition-colors"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => decide(swap, "rejected")}
                    className="text-xs px-2 py-1 rounded bg-slate-700/40 text-slate-400 hover:bg-slate-700/60 border border-slate-600/40 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              )}
              {decision === "accepted" && <span className="text-teal-400 text-xs">✓ Accepted</span>}
              {decision === "rejected" && <span className="text-slate-500 text-xs">✕ Skipped</span>}
            </div>

            {/* Add */}
            <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/20">
              <div className="text-xs font-semibold text-teal-400 mb-0.5">ADD</div>
              <div className="text-sm text-slate-200 font-medium">{swap.add.name}</div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{swap.add.reason}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/deck/components/UpgradeDiff.tsx
git commit -m "feat: add UpgradeDiff component with accept/reject per swap"
```

---

## Task 14: InputPanel Component

**Files:**
- Create: `apps/web/src/app/deck/components/InputPanel.tsx`

- [ ] **Step 1: Implement InputPanel.tsx**

Create `apps/web/src/app/deck/components/InputPanel.tsx`:

```tsx
"use client";

import { useState } from "react";

export type DeckInputMethod = "none" | "paste" | "url" | "saved";

const BRACKET_INFO = [
  { label: "Exhibition", desc: "Precon level, janky fun" },
  { label: "Core", desc: "Upgraded precon, casual" },
  { label: "Upgraded", desc: "Focused strategy" },
  { label: "Optimized", desc: "Near-cEDH, efficient" },
  { label: "cEDH", desc: "Fully competitive" },
];

interface SavedDeck {
  id: string;
  name: string;
  commander?: string | null;
}

interface InputPanelProps {
  savedDecks: SavedDeck[];
  onSubmit: (params: {
    instruction: string;
    bracket: 1 | 2 | 3 | 4 | 5;
    budget: number;
    deckText?: string;
    deckUrl?: string;
    deckId?: string;
  }) => void;
  loading: boolean;
}

export function InputPanel({ savedDecks, onSubmit, loading }: InputPanelProps) {
  const [bracket, setBracket] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [budget, setBudget] = useState(200);
  const [instruction, setInstruction] = useState("");
  const [inputMethod, setInputMethod] = useState<DeckInputMethod>("none");
  const [deckText, setDeckText] = useState("");
  const [deckUrl, setDeckUrl] = useState("");
  const [deckId, setDeckId] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!instruction.trim()) return;

    onSubmit({
      instruction: instruction.trim(),
      bracket,
      budget,
      deckText: inputMethod === "paste" ? deckText : undefined,
      deckUrl: inputMethod === "url" ? deckUrl : undefined,
      deckId: inputMethod === "saved" ? deckId : undefined,
    });
  }

  const bracketInfo = BRACKET_INFO[bracket - 1];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Bracket slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Power Level (RC Bracket)
          </label>
          <span className="text-xs font-bold text-teal-400">{bracket} — {bracketInfo?.label}</span>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={bracket}
          onChange={(e) => setBracket(parseInt(e.target.value) as 1 | 2 | 3 | 4 | 5)}
          className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-teal-500"
        />
        <div className="flex justify-between mt-1">
          {BRACKET_INFO.map((b, i) => (
            <span key={i} className={`text-xs ${i + 1 === bracket ? "text-teal-400 font-semibold" : "text-slate-600"}`}>
              {i + 1}
            </span>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-1">{bracketInfo?.desc}</p>
      </div>

      {/* Budget slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Budget
          </label>
          <span className="text-xs font-bold text-teal-400">
            {budget >= 1000 ? "$1000+" : `$${budget}`}
          </span>
        </div>
        <input
          type="range"
          min={25}
          max={1000}
          step={25}
          value={budget}
          onChange={(e) => setBudget(parseInt(e.target.value))}
          className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-teal-500"
        />
        <div className="flex justify-between mt-1">
          {["$25", "$250", "$500", "$750", "$1000+"].map((label) => (
            <span key={label} className="text-xs text-slate-600">{label}</span>
          ))}
        </div>
      </div>

      {/* Deck input method */}
      <div>
        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 block">
          Existing Deck (optional)
        </label>
        <div className="flex gap-1.5 mb-2">
          {(["none", "paste", "url", "saved"] as DeckInputMethod[]).map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => setInputMethod(method)}
              className={[
                "flex-1 text-xs py-1.5 rounded-lg border transition-colors capitalize",
                inputMethod === method
                  ? "bg-teal-600/30 text-teal-300 border-teal-500/50"
                  : "bg-slate-800/60 text-slate-400 border-slate-600/40 hover:border-slate-500/60",
              ].join(" ")}
            >
              {method === "none" ? "None" : method === "paste" ? "Paste" : method === "url" ? "URL" : "Saved"}
            </button>
          ))}
        </div>

        {inputMethod === "paste" && (
          <textarea
            value={deckText}
            onChange={(e) => setDeckText(e.target.value)}
            placeholder={"1 Sol Ring\n1 Command Tower\n..."}
            rows={6}
            className="w-full text-xs font-mono bg-slate-900/60 border border-slate-600/40 rounded-lg px-3 py-2 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-teal-500/50 resize-none"
          />
        )}

        {inputMethod === "url" && (
          <input
            type="url"
            value={deckUrl}
            onChange={(e) => setDeckUrl(e.target.value)}
            placeholder="https://www.moxfield.com/decks/..."
            className="w-full text-xs bg-slate-900/60 border border-slate-600/40 rounded-lg px-3 py-2 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-teal-500/50"
          />
        )}

        {inputMethod === "saved" && (
          <select
            value={deckId}
            onChange={(e) => setDeckId(e.target.value)}
            className="w-full text-xs bg-slate-900/60 border border-slate-600/40 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-teal-500/50"
          >
            <option value="">Select a deck...</option>
            {savedDecks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}{d.commander ? ` — ${d.commander}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Instruction text */}
      <div>
        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 block">
          Instructions
        </label>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Build me a Atraxa superfriends deck focused on proliferating planeswalkers. Include budget alternatives where possible."
          rows={4}
          className="w-full text-sm bg-slate-900/60 border border-slate-600/40 rounded-lg px-3 py-2 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-teal-500/50 resize-none leading-relaxed"
        />
      </div>

      {/* Run button */}
      <button
        type="submit"
        disabled={loading || !instruction.trim()}
        className={[
          "w-full py-3 rounded-xl font-bold text-sm transition-all duration-200",
          loading || !instruction.trim()
            ? "bg-slate-700/50 text-slate-500 cursor-not-allowed"
            : "bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-900/30",
        ].join(" ")}
      >
        {loading ? "Building..." : "Run Deck AI"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/deck/components/InputPanel.tsx
git commit -m "feat: add InputPanel with bracket/budget sliders and deck input options"
```

---

## Task 15: Wire deck/page.tsx

**Files:**
- Modify: `apps/web/src/app/deck/page.tsx`

The existing deck page is a large component. We add the AI panel as a collapsible right sidebar panel that doesn't disturb the existing deck editor.

- [ ] **Step 1: Add AI state and imports to the top of page.tsx**

After the existing imports block, add:

```typescript
import { streamDeckAgent, type AgentEvent, type AgentMode, type ParsedCard, type ParsedSwap } from "@/lib/deckAgentStream";
import { StatusPills, type ToolState } from "./components/StatusPills";
import { CardGallery } from "./components/CardGallery";
import { UpgradeDiff } from "./components/UpgradeDiff";
import { InputPanel } from "./components/InputPanel";
```

After the existing `useState` declarations (before `const mainCards = ...`), add:

```typescript
// ── AI panel state ──
const [showAiPanel, setShowAiPanel] = useState(false);
const [aiLoading, setAiLoading] = useState(false);
const [aiMode, setAiMode] = useState<AgentMode>("build");
const [toolStates, setToolStates] = useState<ToolState[]>([]);
const [statusMessage, setStatusMessage] = useState<string | null>(null);
const [tierGroups, setTierGroups] = useState<Array<{ name: string; cards: ParsedCard[] }>>([]);
const [swaps, setSwaps] = useState<ParsedSwap[]>([]);
const [cardDetails, setCardDetails] = useState<Map<string, { priceUsd?: number | null; imageUri?: string | null }>>(new Map());
const [addedByAi, setAddedByAi] = useState<Set<string>>(new Set());
const [sessionId, setSessionId] = useState<string | null>(null);
const [escalateMessage, setEscalateMessage] = useState<string | null>(null);
const abortRef = useRef<AbortController | null>(null);
```

Add `useRef` to the existing React imports: `import { useState, useEffect, useCallback, useMemo, useRef } from "react";`

- [ ] **Step 2: Add the runAi handler**

Inside `DeckEditorPage`, add this function after the existing `addCard` callback:

```typescript
const runAi = useCallback(async (params: {
  instruction: string;
  bracket: 1 | 2 | 3 | 4 | 5;
  budget: number;
  deckText?: string;
  deckUrl?: string;
  deckId?: string;
}) => {
  // Cancel any in-flight request
  abortRef.current?.abort();
  const controller = new AbortController();
  abortRef.current = controller;

  setAiLoading(true);
  setToolStates([]);
  setStatusMessage(null);
  setTierGroups([]);
  setSwaps([]);
  setEscalateMessage(null);

  // Current deck cards for upgrade/modify mode
  const deckCards = cards.map((c) => c.name);

  let currentTier = "";

  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? undefined;

    await streamDeckAgent(
      {
        instruction: params.instruction,
        bracket: params.bracket,
        budget: params.budget,
        deckText: params.deckText,
        deckUrl: params.deckUrl,
        deckId: params.deckId,
        sessionId: sessionId ?? undefined,
        token,
      },
      (event: AgentEvent) => {
        switch (event.type) {
          case "mode":
            setAiMode(event.mode);
            break;
          case "tool_start":
            setToolStates((prev) => [...prev, { tool: event.tool, status: "running" }]);
            break;
          case "tool_done":
            setToolStates((prev) =>
              prev.map((t) => t.tool === event.tool ? { ...t, status: "done" } : t)
            );
            break;
          case "status":
            setStatusMessage(event.message);
            break;
          case "escalate":
            setEscalateMessage(event.message);
            break;
          case "tier":
            currentTier = event.name;
            setTierGroups((prev) => {
              if (prev.find((g) => g.name === event.name)) return prev;
              return [...prev, { name: event.name, cards: [] }];
            });
            break;
          case "card":
            setTierGroups((prev) =>
              prev.map((g) =>
                g.name === (event.tier || currentTier)
                  ? { ...g, cards: [...g.cards, event.card] }
                  : g
              )
            );
            break;
          case "swap":
            setSwaps((prev) => [...prev, event.swap]);
            break;
          case "session_id":
            setSessionId(event.id);
            break;
          case "done":
            setAiLoading(false);
            setStatusMessage(null);
            break;
        }
      },
      controller.signal
    );
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      console.error("[ai panel]", err);
    }
    setAiLoading(false);
  }
}, [cards, sessionId]);

const handleAddFromAi = useCallback((cardName: string) => {
  setAddedByAi((prev) => new Set(prev).add(cardName));
  // Find the card in search results or add by name
  addCard({ variantId: "", cardId: "", name: cardName } as SearchResult, "main");
}, [addCard]);
```

- [ ] **Step 3: Add the AI panel toggle button and panel to the JSX**

In the existing JSX return, find the outermost wrapper div. Add a toggle button in the top toolbar area (near where format/deck name controls live), and add the AI panel as a right column. Locate the `return (` of `DeckEditorPage` and wrap the existing content + add the AI panel.

Find the existing top-level return structure and add:

```tsx
{/* AI panel toggle — add near the top of the page, after the NavBar */}
<button
  onClick={() => setShowAiPanel((v) => !v)}
  className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-teal-600 hover:bg-teal-500 text-white font-semibold text-sm shadow-xl shadow-teal-900/40 transition-all duration-200"
>
  <span>✦</span>
  {showAiPanel ? "Close AI" : "Deck AI"}
</button>
```

And add the AI panel as an overlay/drawer at the end of the return, before the closing tag:

```tsx
{/* AI Deck Builder Panel */}
{showAiPanel && (
  <div className="fixed inset-y-0 right-0 w-[420px] z-40 flex flex-col bg-slate-900 border-l border-slate-700/50 shadow-2xl overflow-hidden">
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
      <h2 className="font-bold text-slate-100 text-sm">✦ Deck AI</h2>
      <button onClick={() => setShowAiPanel(false)} className="text-slate-400 hover:text-slate-200 text-lg">✕</button>
    </div>

    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6">
      {/* Input panel */}
      <InputPanel
        savedDecks={[]} // TODO: load from API — pass actual saved decks
        onSubmit={runAi}
        loading={aiLoading}
      />

      {/* Escalation message */}
      {escalateMessage && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
          {escalateMessage.replace("ESCALATE — ", "")}
        </div>
      )}

      {/* Status pills */}
      <StatusPills tools={toolStates} statusMessage={statusMessage} />

      {/* Upgrade diff (upgrade mode) */}
      {aiMode === "upgrade" && swaps.length > 0 && (
        <UpgradeDiff
          swaps={swaps}
          onAccept={(swap) => handleAddFromAi(swap.add.name)}
          onReject={() => {}}
        />
      )}

      {/* Card gallery (build + modify modes) */}
      {aiMode !== "upgrade" && tierGroups.length > 0 && (
        <CardGallery
          tiers={tierGroups}
          cardDetails={cardDetails}
          onAddCard={handleAddFromAi}
          addedCards={addedByAi}
        />
      )}
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify the app builds**

```bash
cd apps/web
npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` with no type errors. Fix any TypeScript errors before continuing.

- [ ] **Step 5: Run locally and smoke-test**

```bash
npm run dev
```

Open `http://localhost:3000/deck`. Click the **✦ Deck AI** button in the bottom-right. The AI panel should slide open showing the InputPanel with bracket/budget sliders. Enter an instruction and click **Run Deck AI**. Confirm status pills animate and cards appear in the gallery.

- [ ] **Step 6: Commit**

```bash
cd ../..
git add apps/web/src/app/deck/page.tsx
git commit -m "feat: integrate AI deck builder panel into deck editor page"
```

---

## Self-Review Checklist

### Spec Coverage

| Spec requirement | Task(s) |
|---|---|
| Bracket 1-5 slider | Task 14 (InputPanel) |
| Budget slider | Task 14 (InputPanel) |
| Paste/URL/saved deck input | Task 3 (urlImport), Task 8 (route), Task 14 (InputPanel) |
| Mode auto-detection (build/upgrade/modify) | Task 6 (detectMode) |
| EDHREC tool | Task 4 (deckAgentTools) |
| Web search (Tavily) | Task 4 (deckAgentTools) |
| MTGGoldfish nightly snapshot | Task 5 (metaSnapshotJob) |
| get_card_details with Scryfall fallback | Task 4 |
| get_collection for owned cards | Task 4 |
| Streaming SSE endpoint | Task 7 (deckAgent), Task 8 (route) |
| Status pills | Task 10 |
| Tiered card gallery (progressive) | Task 12 (CardGallery) |
| Card panel: image, reason, gameplay, Add | Task 11 (CardPanel) |
| Upgrade cut/add pairs with accept/reject | Task 13 (UpgradeDiff) |
| Surgical modify + escalation | Task 6 (system prompt), Task 9 (stream parser escalate event) |
| Session persistence for refinements | Task 1 (AgentSession schema), Task 8 (route saves session) |
| Parallelism in tool calls | Task 7 (Promise.all) |

All spec requirements covered. ✓
