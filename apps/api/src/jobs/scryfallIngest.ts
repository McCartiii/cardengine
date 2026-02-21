import { prisma } from "../db.js";

const SCRYFALL_BULK_API = "https://api.scryfall.com/bulk-data";

interface ScryfallCard {
  id: string;
  oracle_id?: string;
  name: string;
  lang: string;
  layout: string;
  set: string;
  collector_number: string;
  oracle_text?: string;
  type_line?: string;
  colors?: string[];
  color_identity?: string[];
  cmc?: number;
  mana_cost?: string;
  rarity?: string;
  finishes?: string[];
  image_uris?: { normal?: string };
  card_faces?: Array<{
    oracle_text?: string;
    image_uris?: { normal?: string };
  }>;
  prices?: {
    usd?: string;
    usd_foil?: string;
    usd_etched?: string;
    eur?: string;
    eur_foil?: string;
    eur_etched?: string;
    tix?: string;
  };
  games?: string[];
}

function extractImageUri(card: ScryfallCard): string | null {
  if (card.image_uris?.normal) return card.image_uris.normal;
  if (card.card_faces?.[0]?.image_uris?.normal) return card.card_faces[0].image_uris.normal;
  return null;
}

function extractOracleText(card: ScryfallCard): string | null {
  if (card.oracle_text) return card.oracle_text;
  if (card.card_faces) {
    return card.card_faces.map((f) => f.oracle_text ?? "").join("\n//\n");
  }
  return null;
}

export async function ingestScryfallBulk(options?: { maxCards?: number }) {
  console.log("[scryfall-ingest] Fetching bulk data catalog...");
  const bulkRes = await fetch(SCRYFALL_BULK_API);
  if (!bulkRes.ok) throw new Error(`Scryfall bulk API returned ${bulkRes.status}`);

  const bulkData = await bulkRes.json();
  const defaultCards = bulkData.data.find((e: { type: string }) => e.type === "default_cards");
  if (!defaultCards) throw new Error("No default_cards entry found in Scryfall bulk data.");

  console.log(`[scryfall-ingest] Downloading from ${defaultCards.download_uri}...`);
  const cardsRes = await fetch(defaultCards.download_uri);
  if (!cardsRes.ok) throw new Error(`Download returned ${cardsRes.status}`);

  const allCards: ScryfallCard[] = await cardsRes.json();
  console.log(`[scryfall-ingest] Downloaded ${allCards.length} cards total.`);

  // Filter: English, paper game, not tokens/art series
  let cards = allCards.filter(
    (c) =>
      c.lang === "en" &&
      c.layout !== "token" &&
      c.layout !== "art_series" &&
      (c.games?.includes("paper") ?? true)
  );
  if (options?.maxCards) {
    cards = cards.slice(0, options.maxCards);
  }
  console.log(`[scryfall-ingest] Processing ${cards.length} English paper cards...`);

  let cardsProcessed = 0;
  let pricesUpdated = 0;
  const BATCH_SIZE = 200;

  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = cards.slice(i, i + BATCH_SIZE);

    // Build card variant data
    const cardRows = batch.map((card) => {
      const isFoil = card.finishes?.includes("foil") && !card.finishes?.includes("nonfoil");
      const variantSuffix = isFoil ? "-foil" : "";
      const variantId = `scryfall:${card.id}${variantSuffix}`;
      return {
        variantId,
        game: "mtg",
        cardId: card.oracle_id ?? card.id,
        printingId: `${card.set}:${card.collector_number}`,
        name: card.name,
        setId: card.set,
        collectorNumber: card.collector_number,
        oracleText: extractOracleText(card),
        typeLine: card.type_line ?? null,
        colors: card.colors ?? [],
        colorIdentity: card.color_identity ?? [],
        cmc: card.cmc ?? null,
        manaCost: card.mana_cost ?? null,
        rarity: card.rarity ?? null,
        imageUri: extractImageUri(card),
      };
    });

    // Bulk upsert cards using raw SQL for performance
    // Use a single INSERT ... ON CONFLICT for the entire batch
    if (cardRows.length > 0) {
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let paramIdx = 1;

      for (const row of cardRows) {
        const colorsJson = row.colors.length > 0 ? JSON.stringify(row.colors) : null;
        const ciJson = row.colorIdentity.length > 0 ? JSON.stringify(row.colorIdentity) : null;
        placeholders.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
        );
        values.push(
          row.variantId,
          row.game,
          row.cardId,
          row.printingId,
          row.name,
          row.setId,
          row.collectorNumber,
          row.oracleText,
          row.typeLine,
          colorsJson,
          ciJson,
          row.cmc,
          row.manaCost,
          row.rarity,
          row.imageUri
        );
      }

      await prisma.$executeRawUnsafe(
        `INSERT INTO "CardVariant" ("variantId", "game", "cardId", "printingId", "name", "setId", "collectorNumber", "oracle_text", "type_line", "colors", "color_identity", "cmc", "mana_cost", "rarity", "image_uri", "updatedAt")
         VALUES ${placeholders.map((p) => p.replace(/\)$/, ", NOW())"))} 
         ON CONFLICT ("variantId") DO UPDATE SET
           "name" = EXCLUDED."name",
           "cardId" = EXCLUDED."cardId",
           "printingId" = EXCLUDED."printingId",
           "setId" = EXCLUDED."setId",
           "collectorNumber" = EXCLUDED."collectorNumber",
           "oracle_text" = EXCLUDED."oracle_text",
           "type_line" = EXCLUDED."type_line",
           "colors" = EXCLUDED."colors",
           "color_identity" = EXCLUDED."color_identity",
           "cmc" = EXCLUDED."cmc",
           "mana_cost" = EXCLUDED."mana_cost",
           "rarity" = EXCLUDED."rarity",
           "image_uri" = EXCLUDED."image_uri",
           "updatedAt" = NOW()`,
        ...values
      );
      cardsProcessed += cardRows.length;
    }

    // Bulk upsert prices — capture ALL Scryfall price fields
    const priceRows: { market: string; variantId: string; kind: string; currency: string; amount: number }[] = [];
    for (const card of batch) {
      const isFoil = card.finishes?.includes("foil") && !card.finishes?.includes("nonfoil");
      const variantSuffix = isFoil ? "-foil" : "";
      const variantId = `scryfall:${card.id}${variantSuffix}`;

      // Map each Scryfall price field → (market, kind, currency)
      const priceFields: Array<{
        field: keyof NonNullable<ScryfallCard["prices"]>;
        market: string;
        kind: string;
        currency: string;
      }> = [
        { field: "usd",         market: "tcgplayer",  kind: "market",  currency: "USD" },
        { field: "usd_foil",    market: "tcgplayer",  kind: "foil",    currency: "USD" },
        { field: "usd_etched",  market: "tcgplayer",  kind: "etched",  currency: "USD" },
        { field: "eur",         market: "cardmarket", kind: "market",  currency: "EUR" },
        { field: "eur_foil",    market: "cardmarket", kind: "foil",    currency: "EUR" },
        { field: "eur_etched",  market: "cardmarket", kind: "etched",  currency: "EUR" },
        { field: "tix",         market: "mtgo",       kind: "market",  currency: "TIX" },
      ];

      for (const pf of priceFields) {
        const raw = card.prices?.[pf.field];
        if (raw) {
          const amount = parseFloat(raw);
          if (!isNaN(amount) && amount > 0) {
            priceRows.push({
              market: pf.market,
              variantId,
              kind: pf.kind,
              currency: pf.currency,
              amount,
            });
          }
        }
      }
    }

    if (priceRows.length > 0) {
      const pValues: unknown[] = [];
      const pPlaceholders: string[] = [];
      let pIdx = 1;

      for (const row of priceRows) {
        pPlaceholders.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
        pValues.push(row.market, row.variantId, row.kind, row.currency, row.amount);
      }

      await prisma.$executeRawUnsafe(
        `INSERT INTO "PriceCache" ("id", "market", "variantId", "kind", "currency", "amount", "updatedAt")
         VALUES ${pPlaceholders.map((p) => p.replace(/^\(/, "(gen_random_uuid(), ").replace(/\)$/, ", NOW())"))}
         ON CONFLICT ("market", "variantId", "kind", "currency") DO UPDATE SET
           "amount" = EXCLUDED."amount",
           "updatedAt" = NOW()`,
        ...pValues
      );

      // Also write PricePoint snapshots for historical charts (one per variant/market/kind/day)
      const dateUTC = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const hValues2: unknown[] = [];
      const hPlaceholders2: string[] = [];
      let hIdx2 = 1;
      for (const row of priceRows) {
        const deterministicId = `pp-${row.variantId}-${row.market}-${row.kind}-${dateUTC}`;
        hPlaceholders2.push(`($${hIdx2++}, NOW(), $${hIdx2++}, $${hIdx2++}, $${hIdx2++}, $${hIdx2++}, $${hIdx2++})`);
        hValues2.push(deterministicId, row.market, row.kind, row.currency, row.amount, row.variantId);
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO "PricePoint" ("id", "at", "market", "kind", "currency", "amount", "variantId")
         VALUES ${hPlaceholders2.join(", ")}
         ON CONFLICT ("id") DO NOTHING`,
        ...hValues2
      );

      pricesUpdated += priceRows.length;
    }

    if ((i + BATCH_SIZE) % 2000 === 0 || i + BATCH_SIZE >= cards.length) {
      console.log(
        `[scryfall-ingest] Processed ${Math.min(i + BATCH_SIZE, cards.length)}/${cards.length} (${cardsProcessed} cards, ${pricesUpdated} prices)`
      );
    }
  }

  console.log(`[scryfall-ingest] Done. Cards: ${cardsProcessed}, Prices: ${pricesUpdated}`);
  return { cardsProcessed, pricesUpdated };
}

// Allow running as a standalone script
const isDirectRun =
  process.argv[1]?.endsWith("scryfallIngest.ts") ||
  process.argv[1]?.endsWith("scryfallIngest.js");
if (isDirectRun) {
  ingestScryfallBulk({
    maxCards: parseInt(process.env.MAX_CARDS ?? "0") || undefined,
  })
    .then((r) => {
      console.log("[scryfall-ingest] Result:", r);
      process.exit(0);
    })
    .catch((e) => {
      console.error("[scryfall-ingest] Error:", e);
      process.exit(1);
    });
}
