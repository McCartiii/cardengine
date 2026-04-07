import * as cheerio from "cheerio";
import { prisma } from "../db.js";

interface TopDeck {
  name: string;
  colors: string[];
  archetype: string;
}

/**
 * Scrape MTGGoldfish commander meta page and store top decks.
 * Runs nightly. Uses upsert — one row per format/bracket (cache, not history).
 */
export async function runMetaSnapshotJob(): Promise<void> {
  console.log("[meta-snapshot] Starting MTGGoldfish scrape...");

  try {
    const topDecks = await scrapeCommanderMeta();
    const staples = extractStaples();

    const snapshotData = {
      topDecks,
      staples,
      fetchedAt: new Date().toISOString(),
    } as any;

    await prisma.metaSnapshot.upsert({
      where: { format_bracket: { format: "commander", bracket: 0 } },
      create: {
        format: "commander",
        bracket: 0,
        data: snapshotData,
      },
      update: {
        data: snapshotData,
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

  return decks.slice(0, 50);
}

function extractStaples(): string[] {
  return [
    "Sol Ring", "Arcane Signet", "Command Tower", "Cyclonic Rift",
    "Rhystic Study", "Smothering Tithe", "Demonic Tutor", "Vampiric Tutor",
  ];
}
