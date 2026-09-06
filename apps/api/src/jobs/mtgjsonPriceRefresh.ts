import { createGunzip } from "node:zlib";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import streamJson from "stream-json";
import pickModule from "stream-json/filters/Pick.js";
import streamObjectModule from "stream-json/streamers/StreamObject.js";
import { prisma } from "../db.js";

const { parser } = streamJson;
const { pick } = pickModule;
const { streamObject } = streamObjectModule;

const MTGJSON_BASE = "https://mtgjson.com/api/v5";
const MAP_CONCURRENCY = 4;
const WRITE_BATCH_SIZE = 2_000;

interface MtgjsonSetCard {
  uuid: string;
  identifiers?: { scryfallId?: string };
}

interface MtgjsonSetFile {
  data?: { cards?: MtgjsonSetCard[] };
}

type Finish = "normal" | "foil" | "etched";
type PricePoints = Partial<Record<Finish, Record<string, number>>>;

interface ProviderPrices {
  currency: string;
  retail?: PricePoints;
  buylist?: PricePoints;
}

interface MtgjsonPriceFile {
  meta?: { date?: string };
  data?: Record<
    string,
    {
      paper?: Record<string, ProviderPrices>;
    }
  >;
}

interface PriceRow {
  variantId: string;
  market: string;
  kind: string;
  currency: string;
  amount: number;
  date: string;
}

function scryfallIdFromVariant(variantId: string): string | null {
  const match = /^scryfall:([0-9a-f-]{36})(?:-foil)?$/i.exec(variantId);
  return match?.[1] ?? null;
}

async function mapSet(setId: string): Promise<number> {
  const variants = await prisma.cardVariant.findMany({
    where: { setId, mtgjsonUuid: null },
    select: { variantId: true },
  });
  if (variants.length === 0) return 0;

  const response = await fetch(
    `${MTGJSON_BASE}/${encodeURIComponent(setId.toUpperCase())}.json`,
    {
      headers: { "User-Agent": "CardEngine/1.0" },
      signal: AbortSignal.timeout(20_000),
    }
  );
  if (!response.ok) {
    if (response.status !== 404) {
      console.warn(`[mtgjson] Set mapping ${setId} returned ${response.status}`);
    }
    return 0;
  }

  const payload = (await response.json()) as MtgjsonSetFile;
  const uuidByScryfallId = new Map<string, string>();
  for (const card of payload.data?.cards ?? []) {
    const scryfallId = card.identifiers?.scryfallId;
    if (scryfallId && card.uuid) uuidByScryfallId.set(scryfallId, card.uuid);
  }

  const mappings = variants.flatMap((variant) => {
    const scryfallId = scryfallIdFromVariant(variant.variantId);
    const uuid = scryfallId ? uuidByScryfallId.get(scryfallId) : undefined;
    return uuid ? [{ variantId: variant.variantId, uuid }] : [];
  });

  for (let i = 0; i < mappings.length; i += WRITE_BATCH_SIZE) {
    const batch = mappings.slice(i, i + WRITE_BATCH_SIZE);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let parameter = 1;
    for (const mapping of batch) {
      placeholders.push(`($${parameter++}, $${parameter++})`);
      values.push(mapping.variantId, mapping.uuid);
    }
    await prisma.$executeRawUnsafe(
      `UPDATE "CardVariant" AS c
       SET "mtgjson_uuid" = v.uuid
       FROM (VALUES ${placeholders.join(", ")}) AS v("variantId", uuid)
       WHERE c."variantId" = v."variantId"`,
      ...values
    );
  }

  return mappings.length;
}

async function backfillMtgjsonMappings(): Promise<number> {
  const rows = await prisma.cardVariant.findMany({
    where: { mtgjsonUuid: null, setId: { not: null } },
    distinct: ["setId"],
    select: { setId: true },
  });
  const setIds = rows.flatMap((row) => (row.setId ? [row.setId] : []));
  let mapped = 0;

  for (let i = 0; i < setIds.length; i += MAP_CONCURRENCY) {
    const chunk = setIds.slice(i, i + MAP_CONCURRENCY);
    const results = await Promise.all(
      chunk.map((setId) =>
        mapSet(setId).catch((error) => {
          console.warn(`[mtgjson] Failed mapping set ${setId}`, error);
          return 0;
        })
      )
    );
    mapped += results.reduce((sum, count) => sum + count, 0);
    console.log(
      `[mtgjson] Mapped ${Math.min(i + chunk.length, setIds.length)}/${setIds.length} sets`
    );
  }

  return mapped;
}

function latestPoint(
  points: Record<string, number> | undefined,
  fallbackDate: string
): { date: string; amount: number } | null {
  if (!points) return null;
  const dates = Object.keys(points).sort();
  const date = dates[dates.length - 1];
  if (!date) return null;
  const amount = points[date];
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { date: date || fallbackDate, amount };
}

function rowsForVariant(
  variantId: string,
  entry: NonNullable<MtgjsonPriceFile["data"]>[string],
  fallbackDate: string
): PriceRow[] {
  const rows: PriceRow[] = [];
  for (const [provider, lists] of Object.entries(entry.paper ?? {})) {
    for (const [listType, points] of [
      ["retail", lists.retail],
      ["buylist", lists.buylist],
    ] as const) {
      for (const finish of ["normal", "foil", "etched"] as const) {
        const point = latestPoint(points?.[finish], fallbackDate);
        if (!point) continue;
        const retailKind = finish === "normal" ? "market" : finish;
        rows.push({
          variantId,
          market: provider,
          kind: listType === "retail" ? retailKind : `buylist-${retailKind}`,
          currency: lists.currency.toUpperCase(),
          amount: point.amount,
          date: point.date,
        });
      }
    }
  }
  return rows;
}

async function stagePriceBatch(runId: string, rows: PriceRow[]): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameter = 1;
  for (const row of rows) {
    placeholders.push(
      `($${parameter++}, $${parameter++}, $${parameter++}, $${parameter++}, $${parameter++}, $${parameter++}, $${parameter++}::date, NOW())`
    );
    values.push(
      runId,
      row.market,
      row.variantId,
      row.kind,
      row.currency,
      row.amount,
      row.date
    );
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO "PriceStage"
      ("runId", "market", "variantId", "kind", "currency", "amount", "sourceDate", "createdAt")
     VALUES ${placeholders.join(", ")}
     ON CONFLICT ("runId", "market", "variantId", "kind", "currency") DO UPDATE SET
       "amount" = EXCLUDED."amount",
       "sourceDate" = EXCLUDED."sourceDate"`,
    ...values
  );
}

async function promoteSnapshot(runId: string): Promise<number> {
  const promoted = await prisma.$transaction(
    async (tx) => {
      const promoted = await tx.$executeRaw`
        INSERT INTO "PriceCache"
          ("id", "market", "variantId", "kind", "currency", "amount", "source", "updatedAt")
        SELECT gen_random_uuid(), "market", "variantId", "kind", "currency",
               "amount", 'mtgjson', NOW()
        FROM "PriceStage"
        WHERE "runId" = ${runId}
        ON CONFLICT ("market", "variantId", "kind", "currency") DO UPDATE SET
          "amount" = EXCLUDED."amount",
          "source" = EXCLUDED."source",
          "updatedAt" = NOW()
      `;

      await tx.$executeRaw`
        DELETE FROM "PriceCache" AS cache
        WHERE cache."source" = 'mtgjson'
          AND NOT EXISTS (
            SELECT 1
            FROM "PriceStage" AS stage
            WHERE stage."runId" = ${runId}
              AND stage."market" = cache."market"
              AND stage."variantId" = cache."variantId"
              AND stage."kind" = cache."kind"
              AND stage."currency" = cache."currency"
          )
      `;

      return promoted;
    },
    { timeout: 10 * 60 * 1000 }
  );

  // History can lag behind the now-atomic current-price promotion. Keeping it
  // outside that transaction prevents a large history insert from rolling
  // back an otherwise valid current snapshot.
  await prisma.$executeRaw`
    INSERT INTO "PricePoint"
      ("id", "at", "market", "kind", "currency", "amount", "variantId", "source")
    SELECT 'pp-mtgjson-' || "variantId" || '-' || "market" || '-' ||
           "kind" || '-' || "sourceDate"::date::text,
           "sourceDate", "market", "kind", "currency", "amount",
           "variantId", 'mtgjson'
    FROM "PriceStage"
    WHERE "runId" = ${runId}
    ON CONFLICT ("id") DO UPDATE SET
      "amount" = EXCLUDED."amount",
      "source" = EXCLUDED."source"
  `;
  await prisma.priceStage.deleteMany({ where: { runId } });
  return promoted;
}

async function runMtgjsonRefresh(runId: string) {
  const mapped = await backfillMtgjsonMappings();
  console.log(`[mtgjson] Added ${mapped} Scryfall-to-MTGJSON mappings`);

  const variants = await prisma.cardVariant.findMany({
    where: { mtgjsonUuid: { not: null } },
    select: { variantId: true, mtgjsonUuid: true },
  });
  const variantsByUuid = new Map<string, string[]>();
  for (const variant of variants) {
    if (!variant.mtgjsonUuid) continue;
    const ids = variantsByUuid.get(variant.mtgjsonUuid) ?? [];
    ids.push(variant.variantId);
    variantsByUuid.set(variant.mtgjsonUuid, ids);
  }

  if (mapped === 0) {
    const [metadataResponse, latestPoint] = await Promise.all([
      fetch(`${MTGJSON_BASE}/AllPricesToday.json.gz`, {
        method: "HEAD",
        headers: { "User-Agent": "CardEngine/1.0" },
        signal: AbortSignal.timeout(20_000),
      }),
      prisma.pricePoint.findFirst({
        where: { source: "mtgjson" },
        orderBy: { at: "desc" },
        select: { at: true },
      }),
    ]);
    const modifiedHeader = metadataResponse.headers.get("last-modified");
    const modifiedAt = modifiedHeader ? new Date(modifiedHeader) : null;
    if (
      metadataResponse.ok &&
      modifiedAt &&
      !Number.isNaN(modifiedAt.getTime()) &&
      latestPoint &&
      latestPoint.at.toISOString().slice(0, 10) >=
        modifiedAt.toISOString().slice(0, 10)
    ) {
      console.log("[mtgjson] Latest daily snapshot is already loaded; skipping.");
      return {
        sourceDate: latestPoint.at.toISOString().slice(0, 10),
        mapped,
        variants: variants.length,
        pricesUpdated: 0,
        promoted: 0,
        skipped: true,
      };
    }
  }

  const response = await fetch(`${MTGJSON_BASE}/AllPricesToday.json.gz`, {
    headers: { "User-Agent": "CardEngine/1.0" },
    signal: AbortSignal.timeout(20 * 60_000),
  });
  if (!response.ok) {
    throw new Error(`MTGJSON AllPricesToday returned ${response.status}`);
  }
  if (!response.body) throw new Error("MTGJSON response had no body");

  const modifiedHeader = response.headers.get("last-modified");
  const modifiedAt = modifiedHeader ? new Date(modifiedHeader) : null;
  const fallbackDate =
    modifiedAt && !Number.isNaN(modifiedAt.getTime())
      ? modifiedAt.toISOString().slice(0, 10)
      : "";

  const pipeline = Readable.fromWeb(
      response.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>
    )
    .pipe(createGunzip())
    .pipe(parser())
    .pipe(pick({ filter: "data" }))
    .pipe(streamObject());

  const providerCoverage = new Map<string, number>();
  let feedEntryCount = 0;
  let pending: PriceRow[] = [];
  let pricesUpdated = 0;
  for await (const item of pipeline as AsyncIterable<{
    key: string;
    value: NonNullable<MtgjsonPriceFile["data"]>[string];
  }>) {
    feedEntryCount += 1;
    const uuid = item.key;
    const entry = item.value;
    for (const [provider, lists] of Object.entries(entry.paper ?? {})) {
      let count = 0;
      for (const points of [lists.retail, lists.buylist]) {
        for (const finish of ["normal", "foil", "etched"] as const) {
          count += Object.keys(points?.[finish] ?? {}).length;
        }
      }
      providerCoverage.set(
        provider,
        (providerCoverage.get(provider) ?? 0) + count
      );
    }
    const variantIds = variantsByUuid.get(uuid);
    if (!variantIds) continue;
    for (const variantId of variantIds) {
      pending.push(...rowsForVariant(variantId, entry, fallbackDate));
      if (pending.length >= WRITE_BATCH_SIZE) {
        await stagePriceBatch(runId, pending);
        pricesUpdated += pending.length;
        pending = [];
      }
    }
  }
  if (pending.length > 0) {
    await stagePriceBatch(runId, pending);
    pricesUpdated += pending.length;
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fallbackDate) ||
    feedEntryCount < 50_000
  ) {
    throw new Error(
      `MTGJSON snapshot failed validation: date=${fallbackDate || "missing"}, cards=${feedEntryCount}`
    );
  }
  const requiredProviders = [
    "tcgplayer",
    "cardmarket",
    "cardkingdom",
    "manapool",
  ];
  const undercoveredProviders = requiredProviders.filter(
    (provider) => (providerCoverage.get(provider) ?? 0) < 10_000
  );
  if (undercoveredProviders.length > 0) {
    throw new Error(
      `MTGJSON snapshot provider coverage too low: ${undercoveredProviders
        .map(
          (provider) =>
            `${provider}=${providerCoverage.get(provider) ?? 0}`
        )
        .join(", ")}`
    );
  }

  const minimumExpectedPrices = Math.max(
    1,
    Math.floor(variants.length * 0.25)
  );
  if (pricesUpdated < minimumExpectedPrices) {
    throw new Error(
      `MTGJSON snapshot coverage too low: ${pricesUpdated} prices for ${variants.length} mapped variants`
    );
  }

  const promoted = await promoteSnapshot(runId);

  console.log(
    `[mtgjson] Price refresh complete: ${promoted} prices promoted atomically`
  );
  return {
    sourceDate: fallbackDate,
    mapped,
    variants: variants.length,
    pricesUpdated,
    promoted,
  };
}

export async function refreshMtgjsonPrices() {
  const runId = randomUUID();
  await prisma.priceStage.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  try {
    return await runMtgjsonRefresh(runId);
  } finally {
    // Promotion deletes this run atomically. This also cleans partial staging
    // rows immediately when download, validation, or writing fails.
    await prisma.priceStage.deleteMany({ where: { runId } }).catch((error) => {
      console.error(`[mtgjson] Failed to clean staging run ${runId}`, error);
    });
  }
}

export const mtgjsonPriceTesting = {
  latestPoint,
  rowsForVariant,
  scryfallIdFromVariant,
};
