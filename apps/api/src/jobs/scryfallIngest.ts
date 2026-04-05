import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { prisma } from "../db.js";
import sharp from "sharp";

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

/** Fetch an image URL and compute dHash + pHash. Returns null on any fetch/decode failure. */
async function computeHashes(imageUrl: string): Promise<{ dHash: string; pHash: string } | null> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();

    const { data: dData, info: dInfo } = await sharp(Buffer.from(arrayBuffer))
      .resize(9, 8, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const dHashVal = computeDHashFromRaw(dData, dInfo.width, dInfo.height, dInfo.channels);

    const { data: pData, info: pInfo } = await sharp(Buffer.from(arrayBuffer))
      .resize(32, 32, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pHashVal = computePHashFromRaw(pData, pInfo.width, pInfo.height, pInfo.channels);

    return {
      dHash: dHashVal.toString(16).padStart(16, "0"),
      pHash: pHashVal.toString(16).padStart(16, "0"),
    };
  } catch {
    return null;
  }
}

function computeDHashFromRaw(data: Buffer, width: number, height: number, channels: number): bigint {
  const luma = (col: number, row: number): number => {
    const i = (row * width + col) * channels;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    return (r * 299 + g * 587 + b * 114) / 1000;
  };
  let hash = 0n;
  let bit = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width - 1; col++) {
      if (luma(col, row) > luma(col + 1, row)) hash |= 1n << BigInt(bit);
      bit++;
    }
  }
  return hash;
}

function computePHashFromRaw(data: Buffer, width: number, height: number, channels: number): bigint {
  const grid: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * channels;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      grid.push((r * 299 + g * 587 + b * 114) / 1000);
    }
  }
  const cos = (n: number, k: number): number =>
    Math.cos(((2 * n + 1) * k * Math.PI) / (2 * width));
  const dct: number[] = [];
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let sum = 0;
      for (let x = 0; x < width; x++) {
        const cx = cos(x, u);
        for (let y = 0; y < height; y++) {
          sum += grid[x * width + y]! * cx * cos(y, v);
        }
      }
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      dct.push((2 / width) * cu * cv * sum);
    }
  }
  // Skip DC component (index 0) for brightness/foil tolerance — 63 AC coefficients
  const vals = dct.slice(1);
  const sorted = [...vals].sort((a, b) => a - b);
  const median = (sorted[30]! + sorted[31]!) / 2;
  let hash = 0n;
  for (let i = 0; i < 63; i++) {
    if (vals[i]! > median) hash |= 1n << BigInt(i);
  }
  return hash;
}

interface HashData {
  dHash: string | null;
  pHash: string | null;
  foilDHash: string | null;
  foilPHash: string | null;
}

const PRICE_FIELDS: Array<{
  field: keyof NonNullable<ScryfallCard["prices"]>;
  market: string;
  kind: string;
  currency: string;
}> = [
  { field: "usd",        market: "tcgplayer",  kind: "market", currency: "USD" },
  { field: "usd_foil",   market: "tcgplayer",  kind: "foil",   currency: "USD" },
  { field: "usd_etched", market: "tcgplayer",  kind: "etched", currency: "USD" },
  { field: "eur",        market: "cardmarket", kind: "market", currency: "EUR" },
  { field: "eur_foil",   market: "cardmarket", kind: "foil",   currency: "EUR" },
  { field: "eur_etched", market: "cardmarket", kind: "etched", currency: "EUR" },
  { field: "tix",        market: "mtgo",       kind: "market", currency: "TIX" },
];

async function processCardBatch(
  cards: ScryfallCard[],
  hashResults: Map<string, HashData>
): Promise<{ cards: number; prices: number }> {
  const cardRows = cards.map((card) => {
    const isFoil = card.finishes?.includes("foil") && !card.finishes?.includes("nonfoil");
    const variantId = `scryfall:${card.id}${isFoil ? "-foil" : ""}`;
    const hashes = hashResults.get(variantId) ?? { dHash: null, pHash: null, foilDHash: null, foilPHash: null };
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
      dHash: hashes.dHash,
      pHash: hashes.pHash,
      foilDHash: hashes.foilDHash,
      foilPHash: hashes.foilPHash,
    };
  });

  const priceRows: { market: string; variantId: string; kind: string; currency: string; amount: number }[] = [];
  for (const card of cards) {
    const isFoil = card.finishes?.includes("foil") && !card.finishes?.includes("nonfoil");
    const variantId = `scryfall:${card.id}${isFoil ? "-foil" : ""}`;
    for (const pf of PRICE_FIELDS) {
      const raw = card.prices?.[pf.field];
      if (raw) {
        const amount = parseFloat(raw);
        if (!isNaN(amount) && amount > 0) {
          priceRows.push({ market: pf.market, variantId, kind: pf.kind, currency: pf.currency, amount });
        }
      }
    }
  }

  await prisma.$transaction(
    async (tx) => {
      if (cardRows.length > 0) {
        const values: unknown[] = [];
        const placeholders: string[] = [];
        let paramIdx = 1;

        for (const row of cardRows) {
          const colorsJson = row.colors.length > 0 ? JSON.stringify(row.colors) : null;
          const ciJson = row.colorIdentity.length > 0 ? JSON.stringify(row.colorIdentity) : null;
          placeholders.push(
            `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
          );
          values.push(
            row.variantId, row.game, row.cardId, row.printingId, row.name,
            row.setId, row.collectorNumber, row.oracleText, row.typeLine,
            colorsJson, ciJson, row.cmc, row.manaCost, row.rarity, row.imageUri,
            row.dHash, row.pHash, row.foilDHash, row.foilPHash
          );
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO "CardVariant" ("variantId", "game", "cardId", "printingId", "name", "setId", "collectorNumber", "oracle_text", "type_line", "colors", "color_identity", "cmc", "mana_cost", "rarity", "image_uri", "d_hash", "p_hash", "foil_d_hash", "foil_p_hash", "updatedAt")
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
             "d_hash" = COALESCE(EXCLUDED."d_hash", "CardVariant"."d_hash"),
             "p_hash" = COALESCE(EXCLUDED."p_hash", "CardVariant"."p_hash"),
             "foil_d_hash" = COALESCE(EXCLUDED."foil_d_hash", "CardVariant"."foil_d_hash"),
             "foil_p_hash" = COALESCE(EXCLUDED."foil_p_hash", "CardVariant"."foil_p_hash"),
             "updatedAt" = NOW()`,
          ...values
        );
      }

      if (priceRows.length > 0) {
        const pValues: unknown[] = [];
        const pPlaceholders: string[] = [];
        let pIdx = 1;

        for (const row of priceRows) {
          pPlaceholders.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
          pValues.push(row.market, row.variantId, row.kind, row.currency, row.amount);
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO "PriceCache" ("id", "market", "variantId", "kind", "currency", "amount", "updatedAt")
           VALUES ${pPlaceholders.map((p) => p.replace(/^\(/, "(gen_random_uuid(), ").replace(/\)$/, ", NOW())"))}
           ON CONFLICT ("market", "variantId", "kind", "currency") DO UPDATE SET
             "amount" = EXCLUDED."amount",
             "updatedAt" = NOW()`,
          ...pValues
        );

        const dateUTC = new Date().toISOString().slice(0, 10);
        const hValues: unknown[] = [];
        const hPlaceholders: string[] = [];
        let hIdx = 1;
        for (const row of priceRows) {
          const deterministicId = `pp-${row.variantId}-${row.market}-${row.kind}-${dateUTC}`;
          hPlaceholders.push(`($${hIdx++}, NOW(), $${hIdx++}, $${hIdx++}, $${hIdx++}, $${hIdx++}, $${hIdx++})`);
          hValues.push(deterministicId, row.market, row.kind, row.currency, row.amount, row.variantId);
        }
        await tx.$executeRawUnsafe(
          `INSERT INTO "PricePoint" ("id", "at", "market", "kind", "currency", "amount", "variantId")
           VALUES ${hPlaceholders.join(", ")}
           ON CONFLICT ("id") DO NOTHING`,
          ...hValues
        );
      }
    },
    { timeout: 30_000 }
  );

  return { cards: cardRows.length, prices: priceRows.length };
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

  // Stream line-by-line instead of buffering the entire ~200MB JSON into memory.
  // Scryfall formats one card object per line inside the JSON array.
  const nodeStream = Readable.fromWeb(
    cardsRes.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>
  );
  const rl = createInterface({ input: nodeStream, crlfDelay: Infinity });

  const BATCH_SIZE = 200;
  const HASH_CONCURRENCY = 10;
  let batch: ScryfallCard[] = [];
  let cardsProcessed = 0;
  let pricesUpdated = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "[" || trimmed === "]") continue;

    // Strip the trailing comma present on all lines except the last card
    const json = trimmed.endsWith(",") ? trimmed.slice(0, -1) : trimmed;

    let card: ScryfallCard;
    try {
      card = JSON.parse(json) as ScryfallCard;
    } catch {
      continue;
    }

    // Same filter as before
    if (
      card.lang !== "en" ||
      card.layout === "token" ||
      card.layout === "art_series" ||
      !(card.games?.includes("paper") ?? true)
    ) {
      continue;
    }

    if (options?.maxCards && cardsProcessed + batch.length >= options.maxCards) break;

    batch.push(card);

    if (batch.length >= BATCH_SIZE) {
      // Compute perceptual hashes for batch (10 concurrent to avoid rate limiting)
      const hashResults: Map<string, HashData> = new Map();
      for (let j = 0; j < batch.length; j += HASH_CONCURRENCY) {
        const chunk = batch.slice(j, j + HASH_CONCURRENCY);
        await Promise.all(
          chunk.map(async (c) => {
            const isFoil = c.finishes?.includes("foil") && !c.finishes?.includes("nonfoil");
            const variantId = `scryfall:${c.id}${isFoil ? "-foil" : ""}`;
            const imageUri = extractImageUri(c);
            const faceImageUri = c.card_faces?.[0]?.image_uris?.normal ?? null;
            const foilImageUri = faceImageUri && faceImageUri !== imageUri ? faceImageUri : null;
            const [hashes, foilHashes] = await Promise.all([
              imageUri ? computeHashes(imageUri) : Promise.resolve(null),
              foilImageUri ? computeHashes(foilImageUri) : Promise.resolve(null),
            ]);
            hashResults.set(variantId, {
              dHash: hashes?.dHash ?? null,
              pHash: hashes?.pHash ?? null,
              foilDHash: foilHashes?.dHash ?? null,
              foilPHash: foilHashes?.pHash ?? null,
            });
          })
        );
      }

      const result = await processCardBatch(batch, hashResults);
      cardsProcessed += result.cards;
      pricesUpdated += result.prices;
      batch = [];

      if (cardsProcessed % 2000 < BATCH_SIZE) {
        console.log(`[scryfall-ingest] Processed ${cardsProcessed} cards...`);
      }
    }
  }

  if (batch.length > 0) {
    const hashResults: Map<string, HashData> = new Map();
    const HASH_CONCURRENCY = 10;
    for (let j = 0; j < batch.length; j += HASH_CONCURRENCY) {
      const chunk = batch.slice(j, j + HASH_CONCURRENCY);
      await Promise.all(
        chunk.map(async (c) => {
          const isFoil = c.finishes?.includes("foil") && !c.finishes?.includes("nonfoil");
          const variantId = `scryfall:${c.id}${isFoil ? "-foil" : ""}`;
          const imageUri = extractImageUri(c);
          const faceImageUri = c.card_faces?.[0]?.image_uris?.normal ?? null;
          const foilImageUri = faceImageUri && faceImageUri !== imageUri ? faceImageUri : null;
          const [hashes, foilHashes] = await Promise.all([
            imageUri ? computeHashes(imageUri) : Promise.resolve(null),
            foilImageUri ? computeHashes(foilImageUri) : Promise.resolve(null),
          ]);
          hashResults.set(variantId, {
            dHash: hashes?.dHash ?? null,
            pHash: hashes?.pHash ?? null,
            foilDHash: foilHashes?.dHash ?? null,
            foilPHash: foilHashes?.pHash ?? null,
          });
        })
      );
    }
    const result = await processCardBatch(batch, hashResults);
    cardsProcessed += result.cards;
    pricesUpdated += result.prices;
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
