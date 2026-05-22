import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { BRAVE_SEARCH } from "../constants/brave-search.js";
import { USE_CASES } from "../constants/use-cases.js";
import type { ProductionUseCaseScoutConfig } from "./types.js";

const QuerySchema = z.string().trim().min(1);

const ProductionUseCaseScoutConfigSchema = z.strictObject({
  dailyQueries: z.array(QuerySchema).min(1),
  sourceSpecificQueries: z.array(QuerySchema).min(1),
  prioritizedDomains: z.array(QuerySchema).min(1),
  maxSearchResultsPerQuery: z
    .number()
    .int()
    .min(1)
    .max(BRAVE_SEARCH.MAX_RESULTS_LIMIT)
    .default(USE_CASES.DEFAULT_MAX_SEARCH_RESULTS_PER_QUERY),
  maxCandidatesForExtraction: z
    .number()
    .int()
    .min(1)
    .default(USE_CASES.DEFAULT_MAX_CANDIDATES_FOR_EXTRACTION),
  maxResults: z.number().int().min(1).default(USE_CASES.DEFAULT_MAX_RESULTS),
  freshness: z.string().trim().min(1).optional(),
});

function getDefaultConfigPath(): string {
  return join(process.cwd(), USE_CASES.DIRECTORY, USE_CASES.FILE_NAME);
}

function parseConfigJson(rawConfig: string): unknown {
  try {
    return JSON.parse(rawConfig);
  } catch (error) {
    throw new Error(
      `${USE_CASES.ERRORS.INVALID_JSON} ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function loadProductionUseCaseScoutConfig(
  configPath = getDefaultConfigPath(),
): ProductionUseCaseScoutConfig {
  const parsed = ProductionUseCaseScoutConfigSchema.safeParse(
    parseConfigJson(readFileSync(configPath, "utf8")),
  );
  if (!parsed.success) {
    throw new Error(`${USE_CASES.ERRORS.INVALID_CONFIG} ${parsed.error.message}`);
  }

  return parsed.data;
}
