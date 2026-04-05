import { prisma } from "../db.js";

interface ExpoPushMessage {
  to: string | string[];
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
}

async function sendExpoPushNotifications(messages: ExpoPushMessage[]) {
  if (messages.length === 0) return;
  // Expo push API accepts batches of up to 100
  const BATCH = 100;
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        console.warn(`[expo-push] HTTP ${res.status}: ${await res.text()}`);
      }
    } catch (err) {
      console.warn("[expo-push] Failed to send batch:", err);
    }
  }
}

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

    const pushMessages: ExpoPushMessage[] = [];

    for (const entry of entries) {
      const cache = priceIndex.get(
        `${entry.variantId}:${entry.market}:${entry.kind}:${entry.currency}`
      );
      if (!cache) continue;

      const triggered =
        entry.direction === "above"
          ? cache.amount >= entry.thresholdAmount
          : cache.amount <= entry.thresholdAmount;

      if (!triggered) continue;

      const cardName = nameIndex.get(entry.variantId) ?? entry.variantId;
      const dirLabel = entry.direction === "above" ? "⬆ Above" : "⬇ Below";
      const notifTitle = `${dirLabel} $${entry.thresholdAmount} — ${cardName}`;
      const notifBody = `Now $${cache.amount.toFixed(2)} on ${cache.market} (${cache.kind})`;

      await prisma.$transaction([
        prisma.notification.create({
          data: {
            userId: entry.userId,
            type: "price_alert",
            title: notifTitle,
            body: notifBody,
            data: {
              variantId: entry.variantId,
              market: entry.market,
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

      // Collect Expo push tokens for this user
      const tokens = await prisma.pushToken.findMany({
        where: { userId: entry.userId },
        select: { token: true },
      });
      for (const { token } of tokens) {
        if (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[")) {
          pushMessages.push({
            to: token,
            title: notifTitle,
            body: notifBody,
            sound: "default",
            data: { variantId: entry.variantId, screen: "card" },
          });
        }
      }
    }

    await sendExpoPushNotifications(pushMessages);
  } catch (err) {
    console.error("[watchlist-check] Error:", err);
  }
}
