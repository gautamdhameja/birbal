// Purpose: Composes domain-specific SQLite statement catalogs.
// Scope: Preserves the stable DATABASE.SQL import surface for persistence modules.

import { ITEM_SQL } from "./sql/items.js";
import { RUN_SQL } from "./sql/runs.js";
import { SCHEMA_SQL } from "./sql/schema.js";
import { SEARCH_SNAPSHOT_SQL } from "./sql/searchSnapshots.js";
import { USE_CASE_SQL } from "./sql/useCases.js";
import { USE_CASE_MODEL_CACHE_SQL } from "./sql/useCaseModelCache.js";

export const DATABASE_SQL = {
  ...SCHEMA_SQL,
  ...RUN_SQL,
  ...ITEM_SQL,
  ...USE_CASE_SQL,
  ...SEARCH_SNAPSHOT_SQL,
  ...USE_CASE_MODEL_CACHE_SQL,
} as const;
