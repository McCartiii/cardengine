import { prisma } from "../db.js";
import { sendPush, type PushMessage } from "../services/push.js";
import {
  currencySymbol,
  normalizeCurrency,
  normalizeMarket,
  normalizeRetailPriceKind,
} from "../lib/pricing.js";

/** The notification for an alert that hit: "Sol Ring is up to $3.20". */
export function alertCopy(opts: { cardName: string; direction: string; threshold: number; price: number; currency: string; market: string }) {
  const symbol = currencySymbol(opts.currency);
  const suffix = opts.currency === "TIX" ? " tix" : "";
  const money = (n: number) => `${symbol}${n.toFixed(2)}${suffix}`;
  const up = opts.direction === "above";
  return {
    title: up ? `📈 ${opts.cardName} is up to ${money(opts.price)}` : `📉 ${opts.cardName} dropped to ${money(opts.price)}`,
    body: `Your alert for ${up ? "above" : "below"} ${money(opts.threshold)} just hit on ${MARKET_NAME[opts.market] ?? opts.market}. Tap to see prices.`,
  };
}

const MARKET_NAME: Record<string, string> = { tcgplayer: "TCGplayer", cardmarket: "Cardmarket", cardkingdom: "Card Kingdom", mtgo: "MTGO" };

export async function checkWatchlistAlerts() {
  try {
    const entries = await prisma.watchlistEntry.findMany({
      where: { enabled: true },
    });

    const uniqueVariantIds = [...new Set(entries.map((e) => e.variantId))];
    const allPrices = await prisma.priceCache.findMany({
      where: { variantId: { in: uniqueVariantIds } },
    });
    const priceIndex = new Map<string, (typeof allPrices)[0]>();
    for (const p of allPrices) {
      priceIndex.set(`${p.variantId}:${p.market}:${p.kind}:${p.currency}`, p);
    }

    // Collect card names for nicer notification copy
    const variants =
      uniqueVariantIds.length > 0
        ? await prisma.cardVariant.findMany({
            where: { variantId: { in: uniqueVariantIds } },
            select: { variantId: true, name: true },
          })
        : [];
    const nameIndex = new Map(variants.map((v) => [v.variantId, v.name]));

    const pushMessages: PushMessage[] = [];

    for (const entry of entries) {
      const market = normalizeMarket(entry.market);
      const kind = normalizeRetailPriceKind(entry.kind);
      const currency = normalizeCurrency(entry.currency);
      const cache = priceIndex.get(
        `${entry.variantId}:${market}:${kind}:${currency}`
      );
      if (!cache) continue;

      const triggered =
        entry.direction === "above"
          ? cache.amount >= entry.thresholdAmount
          : cache.amount <= entry.thresholdAmount;

      if (!triggered) continue;

      const cardName = nameIndex.get(entry.variantId) ?? entry.variantId;
      const { title: notifTitle, body: notifBody } = alertCopy({
        cardName,
        direction: entry.direction,
        threshold: entry.thresholdAmount,
        price: cache.amount,
        currency,
        market: cache.market,
      });

      await prisma.$transaction([
        prisma.notification.create({
          data: {
            userId: entry.userId,
            type: "price_alert",
            title: notifTitle,
            body: notifBody,
            data: {
              variantId: entry.variantId,
              market,
              kind,
              currency,
              currentPrice: cache.amount,
              threshold: entry.thresholdAmount,
              direction: entry.direction,
            },
          },
        }),
        prisma.watchlistEntry.update({
          where: { id: entry.id },
          data: { enabled: false },
        }),
      ]);

      // Every phone this user is signed in on.
      const tokens = await prisma.pushToken.findMany({
        where: { userId: entry.userId },
        select: { token: true },
      });
      for (const { token } of tokens) {
        pushMessages.push({
          to: token,
          title: notifTitle,
          body: notifBody,
          sound: "default",
          data: { variantId: entry.variantId, screen: "card" },
        });
      }
    }

    await sendPush(pushMessages);
  } catch (err) {
    console.error("[watchlist-check] Error:", err);
  }
}
