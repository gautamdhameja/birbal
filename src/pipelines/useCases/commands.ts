// Purpose: Provides use-case-specific CLI workflows for search snapshots and model processing.
// Scope: Keeps app-specific acquisition/process commands out of the generic pipeline runner.

import { searchWeb } from "../../brave-search/client.js";
import { loadSourceRegistry } from "../../config/sourceRegistry.js";
import { OUTPUT } from "../../constants/runtime.js";
import {
  createSearchSnapshot,
  listSearchSnapshotItems,
  upsertSearchSnapshotItem,
  updateSearchSnapshotResultCount,
} from "../../db/searchSnapshots.js";
import { sqlitePipelineRunStore } from "../../db/pipelineRuns.js";
import { loadPipelineConfig } from "../../framework/pipeline/config.js";
import { runPipeline } from "../../framework/pipeline/orchestrator.js";
import type { PipelineConfig, PipelineCollectionMethod } from "../../framework/pipeline/types.js";
import { logger } from "../../logging/logger.js";
import { getDefaultModelClient } from "../../model-providers/default.js";
import { registerBirbalPipelineComponents } from "../register.js";
import { applyPipelineCliLimit } from "../../runPipeline.js";
import { collectUseCaseSearchCandidates } from "./search.js";
import type { UseCaseSearchConfig } from "./search.js";

export type UseCaseSearchCommandOptions = {
  configPath?: string;
  limit?: number;
};

export type UseCaseProcessCommandOptions = UseCaseSearchCommandOptions & {
  dryRun?: boolean;
  snapshotId?: string;
  trace?: boolean;
};

const USE_CASES_PIPELINE_ID = "use_cases";
const SNAPSHOT_COLLECTION_METHOD_ID = "search_snapshot";
const SNAPSHOT_COLLECTOR_ID = "search_snapshot_collector";

function useCaseSearchConfig(configPath?: string, limit?: number): PipelineConfig {
  return applyPipelineCliLimit(loadPipelineConfig(configPath ?? USE_CASES_PIPELINE_ID), limit);
}

function useCaseProcessConfig(configPath?: string, limit?: number): PipelineConfig {
  const config = loadPipelineConfig(configPath ?? USE_CASES_PIPELINE_ID);
  if (!limit) {
    return config;
  }

  return {
    ...config,
    limits: {
      ...config.limits,
      limit,
      maxResults: limit,
      maxUseCasesPerRun: limit,
    },
    metadata: {
      ...config.metadata,
      cliLimit: limit,
    },
  };
}

function enabledUseCaseQueries(config: PipelineConfig): string[] {
  return config.collectionMethods
    .filter((method) => method.enabled !== false)
    .flatMap((method) => method.queries ?? []);
}

function sourceDomains(config: PipelineConfig): string[] {
  const sourceRegistry = loadSourceRegistry();
  const allowedSourceIds = new Set(config.sourceIds);

  return sourceRegistry.sources
    .filter((source) => allowedSourceIds.has(source.id))
    .flatMap((source) => source.domains);
}

function searchConfig(config: PipelineConfig): UseCaseSearchConfig {
  return {
    prioritizedDomains: sourceDomains(config),
    maxSearchQueries: config.limits.maxSearchQueries ?? 1,
    maxSearchResultsPerQuery: config.limits.maxSearchResultsPerQuery ?? 10,
    maxCandidatesForExtraction: config.limits.maxCandidatesForExtraction ?? 30,
  };
}

function snapshotCollectionMethod(snapshotId: string): PipelineCollectionMethod {
  return {
    id: SNAPSHOT_COLLECTION_METHOD_ID,
    collectorId: SNAPSHOT_COLLECTOR_ID,
    enabled: true,
    metadata: {
      snapshotId,
    },
  };
}

function processConfigFromSnapshot(config: PipelineConfig, snapshotId: string): PipelineConfig {
  return {
    ...config,
    collectionMethods: [snapshotCollectionMethod(snapshotId)],
    metadata: {
      ...config.metadata,
      searchSnapshotId: snapshotId,
      processOnly: true,
    },
  };
}

export async function runUseCaseSearchSnapshotCommand(
  options: UseCaseSearchCommandOptions = {},
): Promise<void> {
  const config = useCaseSearchConfig(options.configPath, options.limit);
  const queries = enabledUseCaseQueries(config);
  const result = await collectUseCaseSearchCandidates(
    searchConfig(config),
    (query, maxResults, freshness) => searchWeb({ query, maxResults, freshness }),
    queries,
  );
  const snapshot = createSearchSnapshot({
    pipelineId: config.pipelineId,
    queryCount: result.searchedQueries,
    metadata: {
      searchErrors: result.searchErrors,
    },
  });

  result.candidates.forEach((candidate, index) => {
    upsertSearchSnapshotItem({
      snapshotId: snapshot.id,
      rank: index + 1,
      query: candidate.query,
      title: candidate.title,
      url: candidate.url,
      description: candidate.description,
      publishedAt: candidate.publishedAt,
      sourceName: candidate.sourceName,
      raw: candidate.raw,
    });
  });
  updateSearchSnapshotResultCount(snapshot.id, result.candidates.length);

  console.log(
    JSON.stringify(
      {
        snapshotId: snapshot.id,
        pipelineId: snapshot.pipelineId,
        searchedQueries: result.searchedQueries,
        candidates: result.candidates.length,
        searchErrors: result.searchErrors,
      },
      null,
      OUTPUT.JSON_INDENT_SPACES,
    ),
  );
}

export async function runUseCaseProcessSnapshotCommand(
  options: UseCaseProcessCommandOptions = {},
): Promise<void> {
  const snapshotId = options.snapshotId ?? "latest";
  const loadConfig = (value: string) =>
    processConfigFromSnapshot(
      useCaseProcessConfig(options.configPath ?? value, options.limit),
      snapshotId,
    );

  if (options.dryRun) {
    const config = loadConfig(USE_CASES_PIPELINE_ID);
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          config,
          snapshotItemCount:
            snapshotId === "latest" ? undefined : listSearchSnapshotItems(snapshotId).length,
        },
        null,
        OUTPUT.JSON_INDENT_SPACES,
      ),
    );
    return;
  }

  registerBirbalPipelineComponents();
  const result = await runPipeline(USE_CASES_PIPELINE_ID, {
    loadConfig,
    loadSourceRegistry,
    logger,
    modelClient: getDefaultModelClient(),
    runStore: sqlitePipelineRunStore,
  });

  if (result.status === "failed") {
    process.exitCode = 1;
  }

  console.log(JSON.stringify(result, null, OUTPUT.JSON_INDENT_SPACES));
}
