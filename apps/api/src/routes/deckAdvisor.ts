import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, optionalAuth, type AuthUser } from "../middleware/auth.js";
import { fetchEdhrecCommander, sanitizeCommanderName } from "../services/edhrec.js";
import { suggestDecks, getRecommendations, getSwapSuggestions } from "../services/deckAdvisor.js";

export function registerDeckAdvisorRoutes(app: FastifyInstance) {
  // ── Deck advisor: suggest decks from collection ──
  app.post("/v1/deck/suggest", { preHandler: [requireAuth] }, async (req) => {
    const user = (req as FastifyRequest & { user: AuthUser }).user;
    const suggestions = await suggestDecks(user.sub);
    return { suggestions };
  });

  // ── Deck advisor: card recommendations ──
  app.post("/v1/deck/recs", { preHandler: [optionalAuth] }, async (req) => {
    const user = (req as FastifyRequest & { user?: AuthUser }).user;
    const body = z
      .object({
        commanderName: z.string().min(1),
        currentCards: z.array(z.string()).default([]),
        budget: z.number().positive().optional(),
      })
      .parse(req.body);

    const recs = await getRecommendations({
      commanderName: body.commanderName,
      currentCards: body.currentCards,
      userId: user?.sub,
      budget: body.budget,
    });

    return { recommendations: recs };
  });

  // ── Deck advisor: swap suggestions ──
  app.post("/v1/deck/swaps", { preHandler: [optionalAuth] }, async (req) => {
    const user = (req as FastifyRequest & { user?: AuthUser }).user;
    const body = z
      .object({
        commanderName: z.string().min(1),
        currentCards: z.array(z.string()).default([]),
        budget: z.number().positive().optional(),
      })
      .parse(req.body);

    const swaps = await getSwapSuggestions({
      commanderName: body.commanderName,
      currentCards: body.currentCards,
      userId: user?.sub,
      budget: body.budget,
    });

    return { swaps };
  });

  // ── EDHRec: standalone commander lookup ──
  app.get("/v1/edhrec/commander/:name", async (req, reply) => {
    const { name } = z.object({ name: z.string().min(1) }).parse(req.params);
    const data = await fetchEdhrecCommander(name);
    if (!data) return reply.code(404).send({ error: "Commander not found on EDHREC" });
    return {
      commander: name,
      sanitized: sanitizeCommanderName(name),
      num_decks: data.num_decks_avg,
      avg_price: data.avg_price,
      themes: data.themes,
      similar: data.similar,
      recommendations: data.cardlists.map((c) => ({
        name: c.name,
        synergy: c.synergy,
        inclusion: Math.round(c.inclusion * 100),
        primary_type: c.primary_type,
        cmc: c.cmc,
        color_identity: c.color_identity,
        image: c.image_uris?.[0]?.normal ?? null,
        price_usd: c.prices?.usd?.price ?? null,
      })),
    };
  });

  // ── AI deck advice (Claude) ──
  app.post(
    "/v1/ai/deck-advice",
    {
      preHandler: [requireAuth],
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return reply.code(503).send({ error: "AI advice not configured" });

      const body = z
        .object({
          deckId: z.string().optional(),
          commander: z.string().optional(),
          cards: z
            .array(
              z.object({
                name: z.string(),
                quantity: z.number().default(1),
                section: z.string().default("mainboard"),
              })
            )
            .optional(),
          question: z
            .string()
            .max(500)
            .default(
              "What are the main weaknesses and top 5 improvements for this deck?"
            ),
        })
        .parse(req.body);

      if (!body.deckId && (!body.cards || body.cards.length === 0)) {
        return reply.code(400).send({ error: "Provide deckId or cards[]" });
      }

      let cards = body.cards ?? [];
      let commander = body.commander ?? null;
      let deckName = "Unnamed deck";

      if (body.deckId) {
        const user = (req as FastifyRequest & { user: AuthUser }).user;
        const deck = await prisma.deck.findUnique({
          where: { id: body.deckId },
          include: { cards: true },
        });
        if (!deck) return reply.code(404).send({ error: "Deck not found" });
        if (deck.userId !== user.sub) return reply.code(403).send({ error: "Forbidden" });
        cards = deck.cards.map((c) => ({
          name: c.cardName,
          quantity: c.quantity,
          section: c.section,
        }));
        commander =
          deck.commander ??
          deck.cards.find((c) => c.section === "commander")?.cardName ??
          null;
        deckName = deck.name;
      }

      const deckList = cards
        .map(
          (c) =>
            `${c.quantity}x ${c.name}${c.section !== "mainboard" ? ` [${c.section}]` : ""}`
        )
        .join("\n");

      const prompt = [
        `You are an expert Magic: The Gathering deck advisor.`,
        commander ? `Commander: ${commander}` : "",
        `Deck: ${deckName}`,
        `\nDecklist:\n${deckList}`,
        `\nUser question: ${body.question}`,
        `\nProvide concise, actionable advice. Focus on synergies, weaknesses, budget-friendly improvements, and specific card recommendations. Format with clear sections.`,
      ]
        .filter(Boolean)
        .join("\n");

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-opus-4-6",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        app.log.error({ status: res.status }, "[ai/deck-advice] Anthropic API error");
        return reply.code(502).send({ error: "AI service error" });
      }

      const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
      const text = data.content.find((b) => b.type === "text")?.text ?? "";
      return { advice: text };
    }
  );
}
