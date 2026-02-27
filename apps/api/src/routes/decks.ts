import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { fetchEdhrecCommander } from "../services/edhrec.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getUser(req: FastifyRequest): AuthUser {
  return (req as FastifyRequest & { user: AuthUser }).user;
}

const SUPPORTED_FORMATS = [
  "commander",
  "standard",
  "modern",
  "pioneer",
  "legacy",
  "vintage",
  "pauper",
  "oathbreaker",
  "brawl",
  "historic",
  "explorer",
] as const;

// Format legality: max deck size and singleton rules
const FORMAT_RULES: Record<string, { deckSize: number; sideboardSize: number; singleton: boolean; commanderAllowed: boolean }> = {
  commander:  { deckSize: 100, sideboardSize: 0,  singleton: true,  commanderAllowed: true  },
  oathbreaker:{ deckSize: 60,  sideboardSize: 0,  singleton: true,  commanderAllowed: true  },
  brawl:      { deckSize: 60,  sideboardSize: 0,  singleton: true,  commanderAllowed: true  },
  standard:   { deckSize: 60,  sideboardSize: 15, singleton: false, commanderAllowed: false },
  pioneer:    { deckSize: 60,  sideboardSize: 15, singleton: false, commanderAllowed: false },
  modern:     { deckSize: 60,  sideboardSize: 15, singleton: false, commanderAllowed: false },
  legacy:     { deckSize: 60,  sideboardSize: 15, singleton: false, commanderAllowed: false },
  vintage:    { deckSize: 60,  sideboardSize: 15, singleton: false, commanderAllowed: false },
  pauper:     { deckSize: 60,  sideboardSize: 15, singleton: false, commanderAllowed: false },
  historic:   { deckSize: 60,  sideboardSize: 15, singleton: false, commanderAllowed: false },
  explorer:   { deckSize: 60,  sideboardSize: 15, singleton: false, commanderAllowed: false },
};

function checkLegality(
  cards: Array<{ cardName: string; quantity: number; section: string }>,
  format: string
): { valid: boolean; issues: string[] } {
  const rules = FORMAT_RULES[format];
  if (!rules) return { valid: true, issues: [] };

  const issues: string[] = [];
  const mainboard = cards.filter((c) => c.section === "mainboard");
  const sideboard = cards.filter((c) => c.section === "sideboard");
  const commander = cards.filter((c) => c.section === "commander");

  const mainCount = mainboard.reduce((s, c) => s + c.quantity, 0);
  const sideCount = sideboard.reduce((s, c) => s + c.quantity, 0);

  if (rules.commanderAllowed && commander.length === 0 && format !== "oathbreaker") {
    // soft warning, not hard error
  }

  const totalMain = rules.commanderAllowed
    ? mainCount + commander.reduce((s, c) => s + c.quantity, 0)
    : mainCount;

  if (totalMain < rules.deckSize) {
    issues.push(`Deck has ${totalMain} cards; minimum is ${rules.deckSize}`);
  }

  if (rules.sideboardSize > 0 && sideCount > rules.sideboardSize) {
    issues.push(`Sideboard has ${sideCount} cards; max is ${rules.sideboardSize}`);
  }

  if (rules.singleton) {
    const nameCounts = new Map<string, number>();
    for (const c of [...mainboard, ...sideboard]) {
      const n = c.cardName.toLowerCase();
      nameCounts.set(n, (nameCounts.get(n) ?? 0) + c.quantity);
    }
    for (const [name, qty] of nameCounts) {
      // Basic lands and cards with "A deck can have any number" are exempt
      const BASICS = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes", "snow-covered plains", "snow-covered island", "snow-covered swamp", "snow-covered mountain", "snow-covered forest"]);
      if (!BASICS.has(name) && qty > 1) {
        issues.push(`"${name}" appears ${qty}× (singleton format)`);
      }
    }
  } else {
    for (const c of [...mainboard, ...sideboard]) {
      if (c.quantity > 4) {
        const BASICS = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes"]);
        if (!BASICS.has(c.cardName.toLowerCase())) {
          issues.push(`"${c.cardName}" has ${c.quantity} copies; max is 4`);
        }
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

// ── Routes ────────────────────────────────────────────────────────────────────

export function registerDeckRoutes(app: FastifyInstance) {
  // List decks for the authenticated user
  app.get("/v1/decks", { preHandler: [requireAuth] }, async (req) => {
    const user = getUser(req);
    const query = z
      .object({
        format: z.string().optional(),
        game: z.string().default("mtg"),
      })
      .parse(req.query);

    const where: Record<string, unknown> = { userId: user.sub, game: query.game };
    if (query.format) where.format = query.format;

    const decks = await prisma.deck.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { cards: true } },
      },
    });

    return { decks };
  });

  // Get a single deck with full card list + prices
  app.get("/v1/decks/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = getUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);

    const deck = await prisma.deck.findUnique({
      where: { id },
      include: {
        cards: {
          include: {
            variant: {
              select: {
                name: true,
                imageUri: true,
                manaCost: true,
                typeLine: true,
                rarity: true,
                colors: true,
                cmc: true,
              },
            },
          },
          orderBy: [{ section: "asc" }, { cardName: "asc" }],
        },
      },
    });

    if (!deck) return reply.code(404).send({ error: "Not found" });
    if (deck.userId !== user.sub && !deck.isPublic) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    // Attach cached prices for cards in the deck
    const variantIds = deck.cards.flatMap((c) => (c.variantId ? [c.variantId] : []));
    const prices = variantIds.length > 0
      ? await prisma.priceCache.findMany({
          where: { variantId: { in: variantIds }, market: "tcgplayer", kind: "normal", currency: "USD" },
        })
      : [];
    const priceMap = new Map(prices.map((p) => [p.variantId, p.amount]));

    const cardsWithPrices = deck.cards.map((c) => ({
      ...c,
      price: c.variantId ? (priceMap.get(c.variantId) ?? null) : null,
    }));

    const totalValue = cardsWithPrices.reduce(
      (sum, c) => sum + (c.price ?? 0) * c.quantity,
      0
    );

    const legality = checkLegality(deck.cards, deck.format);

    return { deck: { ...deck, cards: cardsWithPrices }, totalValue, legality };
  });

  // Create a new deck
  app.post("/v1/decks", { preHandler: [requireAuth] }, async (req) => {
    const user = getUser(req);
    const body = z
      .object({
        name: z.string().min(1).max(100),
        format: z.enum(SUPPORTED_FORMATS).default("commander"),
        game: z.string().default("mtg"),
        commander: z.string().optional(),
        partner: z.string().optional(),
        description: z.string().max(1000).optional(),
        isPublic: z.boolean().default(false),
        // Optionally seed with cards on creation
        cards: z
          .array(
            z.object({
              cardName: z.string().min(1),
              variantId: z.string().optional(),
              quantity: z.number().int().min(1).max(99).default(1),
              section: z.enum(["mainboard", "sideboard", "commander", "companion"]).default("mainboard"),
            })
          )
          .default([]),
      })
      .parse(req.body);

    const { cards, ...deckData } = body;

    const deck = await prisma.deck.create({
      data: {
        ...deckData,
        userId: user.sub,
        cards: cards.length > 0 ? { create: cards } : undefined,
      },
      include: { _count: { select: { cards: true } } },
    });

    return { ok: true, deck };
  });

  // Update deck metadata
  app.put("/v1/decks/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = getUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).max(100).optional(),
        format: z.enum(SUPPORTED_FORMATS).optional(),
        commander: z.string().nullable().optional(),
        partner: z.string().nullable().optional(),
        description: z.string().max(1000).nullable().optional(),
        isPublic: z.boolean().optional(),
      })
      .parse(req.body);

    const existing = await prisma.deck.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Not found" });
    if (existing.userId !== user.sub) return reply.code(403).send({ error: "Forbidden" });

    const deck = await prisma.deck.update({ where: { id }, data: body });
    return { ok: true, deck };
  });

  // Replace all cards in a deck (full sync — send the complete card list)
  app.put("/v1/decks/:id/cards", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = getUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        cards: z.array(
          z.object({
            cardName: z.string().min(1),
            variantId: z.string().optional(),
            quantity: z.number().int().min(1).max(99).default(1),
            section: z.enum(["mainboard", "sideboard", "commander", "companion"]).default("mainboard"),
          })
        ),
      })
      .parse(req.body);

    const existing = await prisma.deck.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Not found" });
    if (existing.userId !== user.sub) return reply.code(403).send({ error: "Forbidden" });

    await prisma.$transaction([
      prisma.deckCard.deleteMany({ where: { deckId: id } }),
      prisma.deckCard.createMany({
        data: body.cards.map((c) => ({ ...c, deckId: id })),
      }),
      prisma.deck.update({ where: { id }, data: { updatedAt: new Date() } }),
    ]);

    const legality = checkLegality(body.cards, existing.format);
    return { ok: true, cardCount: body.cards.length, legality };
  });

  // Import a raw decklist text into an existing deck
  app.post("/v1/decks/:id/import", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = getUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        text: z.string().min(1),
        replace: z.boolean().default(true), // replace existing cards vs append
      })
      .parse(req.body);

    const existing = await prisma.deck.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Not found" });
    if (existing.userId !== user.sub) return reply.code(403).send({ error: "Forbidden" });

    const parsed = parseDecklistText(body.text);
    if (parsed.length === 0) {
      return reply.code(400).send({ error: "No cards parsed from decklist text" });
    }

    // Try to resolve card names to variantIds
    const names = [...new Set(parsed.map((c) => c.cardName))];
    const variants = await prisma.cardVariant.findMany({
      where: { name: { in: names }, game: existing.game },
      select: { variantId: true, name: true },
    });
    // Pick first non-foil variant for each name
    const nameToVariantId = new Map<string, string>();
    for (const v of variants) {
      if (!nameToVariantId.has(v.name) && !v.variantId.endsWith("-foil")) {
        nameToVariantId.set(v.name, v.variantId);
      }
    }

    const cards = parsed.map((c) => ({
      ...c,
      deckId: id,
      variantId: nameToVariantId.get(c.cardName) ?? undefined,
    }));

    const ops = [];
    if (body.replace) ops.push(prisma.deckCard.deleteMany({ where: { deckId: id } }));
    ops.push(prisma.deckCard.createMany({ data: cards }));
    ops.push(prisma.deck.update({ where: { id }, data: { updatedAt: new Date() } }));
    try {
      await prisma.$transaction(ops);
    } catch (e) {
      return reply.code(500).send({ error: `Database error: ${(e as Error).message}` });
    }

    const legality = checkLegality(cards, existing.format);
    return { ok: true, imported: cards.length, resolved: nameToVariantId.size, legality };
  });

  // Delete a deck
  app.delete("/v1/decks/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = getUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);

    const existing = await prisma.deck.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Not found" });
    if (existing.userId !== user.sub) return reply.code(403).send({ error: "Forbidden" });

    await prisma.deck.delete({ where: { id } });
    return { ok: true };
  });

  // ── Public deck view (no auth required) ──
  app.get("/v1/decks/:id/public", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const deck = await prisma.deck.findUnique({
      where: { id },
      include: {
        cards: { orderBy: [{ section: "asc" }, { cardName: "asc" }] },
        user: { select: { displayName: true } },
      },
    });
    if (!deck) return reply.code(404).send({ error: "Not found" });
    if (!deck.isPublic) return reply.code(403).send({ error: "This deck is private" });

    const variantIds = deck.cards.map((c) => c.variantId).filter(Boolean) as string[];
    const prices = variantIds.length > 0
      ? await prisma.priceCache.findMany({
          where: { variantId: { in: variantIds }, market: "tcgplayer", kind: "normal", currency: "USD" },
        })
      : [];
    const priceMap = new Map(prices.map((p) => [p.variantId, p.amount]));

    const variants = variantIds.length > 0
      ? await prisma.cardVariant.findMany({
          where: { variantId: { in: variantIds } },
          select: { variantId: true, imageUri: true, typeLine: true },
        })
      : [];
    const variantMap = new Map(variants.map((v) => [v.variantId, v]));

    const cardCount = deck.cards.reduce((s, c) => s + c.quantity, 0);
    const totalValue = deck.cards.reduce((s, c) => {
      const p = c.variantId ? (priceMap.get(c.variantId) ?? 0) : 0;
      return s + p * c.quantity;
    }, 0);

    return {
      deck: {
        id: deck.id,
        name: deck.name,
        format: deck.format,
        game: deck.game,
        commander: deck.commander,
        description: deck.description,
        authorName: deck.user?.displayName ?? "Anonymous",
        createdAt: deck.createdAt.toISOString(),
        updatedAt: deck.updatedAt.toISOString(),
        cards: deck.cards.map((c) => ({
          id: c.id,
          cardName: c.cardName,
          variantId: c.variantId,
          quantity: c.quantity,
          section: c.section,
          imageUri: c.variantId ? (variantMap.get(c.variantId)?.imageUri ?? null) : null,
          typeLine: c.variantId ? (variantMap.get(c.variantId)?.typeLine ?? null) : null,
          price: c.variantId ? (priceMap.get(c.variantId) ?? null) : null,
        })),
      },
      cardCount,
      totalValue: Math.round(totalValue * 100) / 100,
    };
  });

  // ── Toggle deck public/private ──
  app.patch("/v1/decks/:id/visibility", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = getUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { isPublic } = z.object({ isPublic: z.boolean() }).parse(req.body);
    const deck = await prisma.deck.findUnique({ where: { id } });
    if (!deck) return reply.code(404).send({ error: "Not found" });
    if (deck.userId !== user.sub) return reply.code(403).send({ error: "Forbidden" });
    await prisma.deck.update({ where: { id }, data: { isPublic } });
    return { ok: true, isPublic };
  });

  // EDHRec recommendations for a deck's commander
  app.get("/v1/decks/:id/edhrec", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = getUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);

    const deck = await prisma.deck.findUnique({
      where: { id },
      include: { cards: { select: { cardName: true, section: true } } },
    });
    if (!deck) return reply.code(404).send({ error: "Not found" });
    if (deck.userId !== user.sub && !deck.isPublic) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const commanderName =
      deck.commander ??
      deck.cards.find((c) => c.section === "commander")?.cardName;

    if (!commanderName) {
      return reply.code(400).send({ error: "No commander set on this deck" });
    }

    const data = await fetchEdhrecCommander(commanderName);
    if (!data) {
      return reply.code(404).send({ error: "Commander not found on EDHREC" });
    }

    // Mark which recommended cards the user already owns
    const ownedNames = new Set(
      deck.cards.map((c) => c.cardName.toLowerCase())
    );

    const recommendations = data.cardlists.map((c) => ({
      name: c.name,
      synergy: c.synergy,
      inclusion: Math.round(c.inclusion * 100),
      primary_type: c.primary_type,
      cmc: c.cmc,
      color_identity: c.color_identity,
      image: c.image_uris?.[0]?.normal ?? null,
      price_usd: c.prices?.usd?.price ?? null,
      alreadyInDeck: ownedNames.has(c.name.toLowerCase()),
    }));

    return {
      commander: commanderName,
      num_decks: data.num_decks_avg,
      avg_price: data.avg_price,
      themes: data.themes,
      similar: data.similar,
      recommendations,
    };
  });
}

// ── Decklist text parser ──────────────────────────────────────────────────────

// Archidekt-style type-category headers — skip entirely, don't treat as card names
const TYPE_CATEGORIES = new Set([
  "creature", "creatures", "instant", "instants", "sorcery", "sorceries",
  "enchantment", "enchantments", "artifact", "artifacts",
  "planeswalker", "planeswalkers", "land", "lands", "other",
  "mana fixing", "ramp", "card draw", "removal", "utility",
]);

function parseDecklistText(
  text: string
): Array<{ cardName: string; quantity: number; section: string }> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const cards: Array<{ cardName: string; quantity: number; section: string }> = [];
  let currentSection = "mainboard";

  for (const line of lines) {
    // Strip trailing "(count)" that Archidekt appends to category/section headers e.g. "Creatures (20)"
    const lower = line.toLowerCase().replace(/\s*\(\d+\)\s*$/, "").trim();

    // Section headers
    if (lower.startsWith("sideboard") || lower === "sb:") { currentSection = "sideboard"; continue; }
    if (lower.startsWith("commander")) { currentSection = "commander"; continue; }
    if (lower.startsWith("companion")) { currentSection = "companion"; continue; }
    if (lower.startsWith("main") || lower.startsWith("deck")) { currentSection = "mainboard"; continue; }
    if (line.startsWith("//") || line.startsWith("#")) continue; // comments

    // Skip Archidekt type-category headers ("Creatures", "Lands", "Instants", …)
    if (TYPE_CATEGORIES.has(lower)) continue;

    // Strip Archidekt annotation tags: *CMDR*, *CMDR2*, *F*, *SB*, etc.
    const isCmdr = /\*CMDR2?\*/i.test(line);
    const isSb   = /\*SB\*/i.test(line);
    const cleanLine = line.replace(/\s*\*[^*]+\*\s*/g, " ").trim();
    const effectiveSection = isCmdr ? "commander" : isSb ? "sideboard" : currentSection;

    // "4 Lightning Bolt" or "4x Lightning Bolt" or "Lightning Bolt"
    const match = cleanLine.match(/^(?:(\d+)[xX]?\s+)?(.+?)(?:\s+\([\w\d]+\)(?:\s+\d+)?)?$/);
    if (!match) continue;
    const qty = match[1] ? parseInt(match[1], 10) : 1;
    const name = match[2]?.trim();
    if (!name || name.length < 2) continue;

    cards.push({ cardName: name, quantity: qty, section: effectiveSection });
  }

  return cards;
}
