import * as cheerio from "cheerio";
import { prisma } from "../db.js";

interface TopDeck {
  name: string;
  colors: string[];
  archetype: string;
}

const CONSTRUCTED_FORMATS = ["standard", "modern", "pioneer", "legacy", "vintage", "pauper"] as const;

/**
 * Scrape MTGGoldfish metagame pages and store snapshots (cache, not history).
 * Commander: duplicate row for brackets 0–5 (same payload) so agent lookups never miss.
 * Other formats: single row per format at bracket 0.
 */
export async function runMetaSnapshotJob(): Promise<void> {
  console.log("[meta-snapshot] Starting MTGGoldfish scrape...");

  try {
    const topDecks = await scrapeMetagame("commander");
    const snapshotData = {
      topDecks,
      staples: commanderStaples(),
      fetchedAt: new Date().toISOString(),
    } as any;

    for (const bracket of [0, 1, 2, 3, 4, 5]) {
      await prisma.metaSnapshot.upsert({
        where: { format_bracket: { format: "commander", bracket } },
        create: {
          format: "commander",
          bracket,
          data: snapshotData,
        },
        update: {
          data: snapshotData,
          fetchedAt: new Date(),
        },
      });
    }

    console.log(`[meta-snapshot] Commander: stored ${topDecks.length} archetypes for bracket keys 0–5.`);
  } catch (err) {
    console.error("[meta-snapshot] Commander scrape failed:", err);
  }

  for (const fmt of CONSTRUCTED_FORMATS) {
    try {
      const topDecks = await scrapeMetagame(fmt);
      const snapshotData = {
        topDecks,
        staples: constructedStaples(fmt),
        fetchedAt: new Date().toISOString(),
      } as any;

      await prisma.metaSnapshot.upsert({
        where: { format_bracket: { format: fmt, bracket: 0 } },
        create: {
          format: fmt,
          bracket: 0,
          data: snapshotData,
        },
        update: {
          data: snapshotData,
          fetchedAt: new Date(),
        },
      });

      console.log(`[meta-snapshot] ${fmt}: stored ${topDecks.length} archetypes (bracket 0).`);
    } catch (err) {
      console.error(`[meta-snapshot] ${fmt} scrape failed:`, err);
    }
  }
}

async function scrapeMetagame(format: string): Promise<TopDeck[]> {
  const res = await fetch(`https://www.mtggoldfish.com/metagame/${format}#paper`, {
    headers: { "User-Agent": "CardEngine/1.0 (contact@cardengine.app)" },
  });
  if (!res.ok) throw new Error(`MTGGoldfish ${format} HTTP ${res.status}`);

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

function commanderStaples(): string[] {
  return [
    "Sol Ring",
    "Arcane Signet",
    "Command Tower",
    "Cyclonic Rift",
    "Rhystic Study",
    "Smothering Tithe",
    "Demonic Tutor",
    "Vampiric Tutor",
  ];
}

function constructedStaples(format: string): string[] {
  // Lightweight hints for the agent when snapshot is thin; not format-legal filters.
  const common = ["Lightning Bolt", "Thoughtseize", "Counterspell", "Path to Exile", "Fatal Push"];
  if (format === "pauper") {
    return ["Lightning Bolt", "Counterspell", "Skred", "Preordain", "Spell Pierce"];
  }
  if (format === "vintage") {
    return ["Black Lotus", "Ancestral Recall", "Mox Pearl", "Mox Ruby", "Bazaar of Baghdad"];
  }
  return common;
}
