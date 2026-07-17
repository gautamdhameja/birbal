// Purpose: Defines SQLite statements for the searchSnapshots database domain.
// Scope: Owns reusable search snapshot statements.

export const SEARCH_SNAPSHOT_SQL = {
  CREATE_SEARCH_SNAPSHOT: `
      INSERT INTO search_snapshots (
        id,
        pipeline_id,
        query_count,
        result_count,
        metadata_json
      )
      VALUES (
        @id,
        @pipelineId,
        @queryCount,
        @resultCount,
        @metadataJson
      )
    `,
  UPDATE_SEARCH_SNAPSHOT_RESULT_COUNT: `
      UPDATE search_snapshots
      SET result_count = @resultCount
      WHERE id = @id
    `,
  UPSERT_SEARCH_SNAPSHOT_ITEM: `
      INSERT INTO search_snapshot_items (
        snapshot_id,
        rank,
        query,
        title,
        url,
        description,
        published_at,
        source_name,
        raw_json
      )
      VALUES (
        @snapshotId,
        @rank,
        @query,
        @title,
        @url,
        @description,
        @publishedAt,
        @sourceName,
        @rawJson
      )
      ON CONFLICT(snapshot_id, url) DO UPDATE SET
        rank = excluded.rank,
        query = excluded.query,
        title = excluded.title,
        description = excluded.description,
        published_at = excluded.published_at,
        source_name = excluded.source_name,
        raw_json = excluded.raw_json
    `,
  LIST_SEARCH_SNAPSHOTS: `
      SELECT
        id,
        pipeline_id,
        query_count,
        result_count,
        metadata_json,
        created_at
      FROM search_snapshots
      WHERE pipeline_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
  GET_SEARCH_SNAPSHOT: `
      SELECT
        id,
        pipeline_id,
        query_count,
        result_count,
        metadata_json,
        created_at
      FROM search_snapshots
      WHERE id = ?
      LIMIT 1
    `,
  GET_LATEST_SEARCH_SNAPSHOT: `
      SELECT
        id,
        pipeline_id,
        query_count,
        result_count,
        metadata_json,
        created_at
      FROM search_snapshots
      WHERE pipeline_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `,
  LIST_SEARCH_SNAPSHOT_ITEMS: `
      SELECT
        snapshot_id,
        rank,
        query,
        title,
        url,
        description,
        published_at,
        source_name,
        raw_json,
        created_at
      FROM search_snapshot_items
      WHERE snapshot_id = ?
      ORDER BY rank ASC, title ASC
    `,
} as const;
