export const DATABASE = {
  DIRECTORY: "data",
  FILE_NAME: "agent.db",
  FOREIGN_KEYS: "foreign_keys = ON",
  JOURNAL_MODE: "journal_mode = WAL",
  ERRORS: {
    INVALID_LIMIT: "limit must be a positive integer.",
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

      CREATE TABLE IF NOT EXISTS scores (
        item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
        relevance REAL NOT NULL,
        technical_depth REAL NOT NULL,
        novelty REAL NOT NULL,
        practicality REAL NOT NULL,
        reason TEXT NOT NULL,
        final_score REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_scores_final_score ON scores (final_score DESC);
    `,
    ITEM_EXISTS_BY_URL: "SELECT 1 FROM items WHERE url = ? LIMIT 1",
    GET_ITEM_BY_URL: `
      SELECT id, source, title, url, summary, published_at, raw_json
      FROM items
      WHERE url = ?
      LIMIT 1
    `,
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
    UPSERT_SCORE: `
      INSERT INTO scores (
        item_id,
        relevance,
        technical_depth,
        novelty,
        practicality,
        reason,
        final_score
      )
      VALUES (
        @itemId,
        @relevance,
        @technicalDepth,
        @novelty,
        @practicality,
        @reason,
        @finalScore
      )
      ON CONFLICT(item_id) DO UPDATE SET
        relevance = excluded.relevance,
        technical_depth = excluded.technical_depth,
        novelty = excluded.novelty,
        practicality = excluded.practicality,
        reason = excluded.reason,
        final_score = excluded.final_score,
        updated_at = CURRENT_TIMESTAMP
    `,
    GET_SCORE_BY_ITEM_ID: `
      SELECT relevance, technical_depth, novelty, practicality, reason, final_score
      FROM scores
      WHERE item_id = ?
      LIMIT 1
    `,
    LIST_TOP_SCORED_ITEMS: `
      SELECT
        items.id,
        items.source,
        items.title,
        items.url,
        items.summary,
        items.published_at,
        items.raw_json,
        scores.relevance,
        scores.technical_depth,
        scores.novelty,
        scores.practicality,
        scores.reason,
        scores.final_score
      FROM scores
      INNER JOIN items ON items.id = scores.item_id
      ORDER BY scores.final_score DESC, items.title ASC
      LIMIT ?
    `,
    LIST_TOP_SCORED_ITEMS_BY_IDS: `
      SELECT
        items.id,
        items.source,
        items.title,
        items.url,
        items.summary,
        items.published_at,
        items.raw_json,
        scores.relevance,
        scores.technical_depth,
        scores.novelty,
        scores.practicality,
        scores.reason,
        scores.final_score
      FROM scores
      INNER JOIN items ON items.id = scores.item_id
      WHERE items.id IN
    `,
    LIST_TOP_SCORED_ITEMS_ORDER_LIMIT: `
      ORDER BY scores.final_score DESC, items.title ASC
      LIMIT ?
    `,
  },
} as const;
