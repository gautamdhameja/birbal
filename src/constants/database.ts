export const DATABASE = {
  DIRECTORY: "data",
  FILE_NAME: "agent.db",
  JOURNAL_MODE: "journal_mode = WAL",
  ERRORS: {
    INVALID_RECENT_LIMIT: "listRecentItems limit must be a positive integer.",
  },
  SQL: {
    INIT_SCHEMA: `
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE,
        summary TEXT NOT NULL,
        published_at TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_items_published_at ON items (published_at DESC);
    `,
    ITEM_EXISTS_BY_URL: "SELECT 1 FROM items WHERE url = ? LIMIT 1",
    UPSERT_ITEM: `
      INSERT INTO items (
        id,
        source,
        title,
        url,
        summary,
        published_at,
        raw_json
      )
      VALUES (
        @id,
        @source,
        @title,
        @url,
        @summary,
        @publishedAt,
        @rawJson
      )
      ON CONFLICT(url) DO UPDATE SET
        id = excluded.id,
        source = excluded.source,
        title = excluded.title,
        summary = excluded.summary,
        published_at = excluded.published_at,
        raw_json = excluded.raw_json,
        updated_at = CURRENT_TIMESTAMP
    `,
    LIST_RECENT_ITEMS: `
      SELECT id, source, title, url, summary, published_at, raw_json
      FROM items
      ORDER BY published_at DESC, title ASC
      LIMIT ?
    `,
  },
} as const;
