import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync("cardengine.db");
  await initSchema(db);
  return db;
}

async function initSchema(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    -- Card data table
    CREATE TABLE IF NOT EXISTS cards (
      variantId TEXT PRIMARY KEY,
      cardId TEXT NOT NULL,
      name TEXT NOT NULL,
      setId TEXT,
      collectorNumber TEXT,
      oracleText TEXT,
      typeLine TEXT,
      colors TEXT,
      colorIdentity TEXT,
      cmc REAL,
      manaCost TEXT,
      rarity TEXT,
      imageUri TEXT,
      game TEXT NOT NULL DEFAULT 'mtg'
    );

    -- FTS5 virtual table for full-text search on name and oracle text
    CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
      name,
      oracleText,
      content=cards,
      content_rowid=rowid
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS cards_ai AFTER INSERT ON cards BEGIN
      INSERT INTO cards_fts(rowid, name, oracleText)
      VALUES (NEW.rowid, NEW.name, NEW.oracleText);
    END;

    CREATE TRIGGER IF NOT EXISTS cards_ad AFTER DELETE ON cards BEGIN
      INSERT INTO cards_fts(cards_fts, rowid, name, oracleText)
      VALUES ('delete', OLD.rowid, OLD.name, OLD.oracleText);
    END;

    CREATE TRIGGER IF NOT EXISTS cards_au AFTER UPDATE ON cards BEGIN
      INSERT INTO cards_fts(cards_fts, rowid, name, oracleText)
      VALUES ('delete', OLD.rowid, OLD.name, OLD.oracleText);
      INSERT INTO cards_fts(rowid, name, oracleText)
      VALUES (NEW.rowid, NEW.name, NEW.oracleText);
    END;

    -- Ledger events for offline collection
    CREATE TABLE IF NOT EXISTS ledger_events (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      type TEXT NOT NULL,
      variantId TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      synced INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_synced ON ledger_events(synced);
    CREATE INDEX IF NOT EXISTS idx_ledger_at ON ledger_events(at);

    -- Saved decks
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      formatId TEXT,
      game TEXT NOT NULL DEFAULT 'mtg',
      cards TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    -- Sync metadata
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Deck advisor cache (EDHREC recommendations, cached locally)
    CREATE TABLE IF NOT EXISTS advisor_cache (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      fetchedAt TEXT NOT NULL
    );
  `);
}

/** Insert or replace card records from the bundle API. */
export async function insertCardBundle(
  database: SQLite.SQLiteDatabase,
  items: Array<{
    variantId: string;
    cardId: string;
    name: string;
    setId?: string;
    collectorNumber?: string;
    oracleText?: string;
    typeLine?: string;
    colors?: string[];
    colorIdentity?: string[];
    cmc?: number;
    manaCost?: string;
    rarity?: string;
    imageUri?: string;
    game?: string;
  }>
) {
  const BATCH = 200;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    await database.withTransactionAsync(async () => {
      for (const item of batch) {
        await database.runAsync(
          `INSERT OR REPLACE INTO cards
            (variantId, cardId, name, setId, collectorNumber, oracleText, typeLine, colors, colorIdentity, cmc, manaCost, rarity, imageUri, game)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.variantId,
            item.cardId,
            item.name,
            item.setId ?? null,
            item.collectorNumber ?? null,
            item.oracleText ?? null,
            item.typeLine ?? null,
            item.colors ? JSON.stringify(item.colors) : null,
            item.colorIdentity ? JSON.stringify(item.colorIdentity) : null,
            item.cmc ?? null,
            item.manaCost ?? null,
            item.rarity ?? null,
            item.imageUri ?? null,
            item.game ?? "mtg",
          ]
        );
      }
    });
  }
}

/** Search cards using FTS5. */
export async function searchCards(
  database: SQLite.SQLiteDatabase,
  query: string,
  limit = 20
): Promise<Array<Record<string, unknown>>> {
  // Use FTS for text search, fall back to LIKE for short queries
  if (query.length < 2) {
    return database.getAllAsync(
      `SELECT * FROM cards WHERE name LIKE ? LIMIT ?`,
      [`%${query}%`, limit]
    );
  }
  return database.getAllAsync(
    `SELECT cards.* FROM cards_fts
     JOIN cards ON cards.rowid = cards_fts.rowid
     WHERE cards_fts MATCH ?
     LIMIT ?`,
    [query, limit]
  );
}

/** Get unsynced ledger events. */
export async function getUnsyncedEvents(
  database: SQLite.SQLiteDatabase
): Promise<Array<Record<string, unknown>>> {
  return database.getAllAsync(
    `SELECT * FROM ledger_events WHERE synced = 0 ORDER BY at ASC`
  );
}

/** Mark events as synced. */
export async function markEventsSynced(
  database: SQLite.SQLiteDatabase,
  ids: string[]
) {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  await database.runAsync(
    `UPDATE ledger_events SET synced = 1 WHERE id IN (${placeholders})`,
    ids
  );
}

/** Get cached advisor data (returns null if expired or missing). */
export async function getAdvisorCache(
  database: SQLite.SQLiteDatabase,
  key: string,
  maxAgeMs = 24 * 60 * 60 * 1000
): Promise<unknown | null> {
  const rows = await database.getAllAsync(
    `SELECT data, fetchedAt FROM advisor_cache WHERE key = ?`,
    [key]
  );
  if (rows.length === 0) return null;
  const row = rows[0] as { data: string; fetchedAt: string };
  const age = Date.now() - new Date(row.fetchedAt).getTime();
  if (age > maxAgeMs) return null;
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

/** Store advisor data in the local cache. */
export async function setAdvisorCache(
  database: SQLite.SQLiteDatabase,
  key: string,
  data: unknown
): Promise<void> {
  await database.runAsync(
    `INSERT OR REPLACE INTO advisor_cache (key, data, fetchedAt) VALUES (?, ?, ?)`,
    [key, JSON.stringify(data), new Date().toISOString()]
  );
}

/** Insert a ledger event locally. */
export async function insertLedgerEvent(
  database: SQLite.SQLiteDatabase,
  event: { id: string; at: string; type: string; variantId: string; payload: unknown }
) {
  await database.runAsync(
    `INSERT OR IGNORE INTO ledger_events (id, at, type, variantId, payload, synced) VALUES (?, ?, ?, ?, ?, 0)`,
    [event.id, event.at, event.type, event.variantId, JSON.stringify(event.payload)]
  );
}
