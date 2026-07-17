import { searchWeb, type SearchWebResult } from "../../brave-search/client.js";
import { loadSourceRegistry } from "../../config/sourceRegistry.js";
import { OUTPUT } from "../../constants/runtime.js";
import {
  createSearchSnapshot,
  listSearchSnapshotItems,
  upsertSearchSnapshotItem,
  updateSearchSnapshotResultCount,
} from "../../db/searchSnapshots.js";
import { sqlitePipelineRunStore } from "../../db/pipelineRuns.js";
import { runPipeline } from "../../../framework/pipeline/orchestrator.js";
import type {
  PipelineCollectionMethod,
  PipelineLogger,
  PipelineResult,
} from "../../../framework/pipeline/types.js";
import { logger } from "../../logging/logger.js";
import { getDefaultModelClient } from "../../model-providers/default.js";
import { registerBirbalPipelineComponents } from "../register.js";
import { collectUseCaseSearchCandidates, rankUseCaseSearchCandidates } from "./search.js";
import type { UseCaseSearchCandidate, UseCaseSearchConfig } from "./search.js";
import {
  loadUseCasePipelineConfig,
  type UseCasePipelineConfig,
  USE_CASES_PIPELINE_ID,
} from "./config.js";

export type UseCaseSearchCommandOptions = {
  configPath?: string;
  limit?: number;
};

export type UseCaseProcessCommandOptions = UseCaseSearchCommandOptions & {
  dryRun?: boolean;
  snapshotId?: string;
};

type UseCaseSearchRetryConfig = {
  enabled: boolean;
  maxAttempts: number;
};

type UseCaseAdaptiveAttempt = {
  attempt: number;
  snapshotId: string;
  searchedQueries: number;
  totalSearchedQueries: number;
  candidateCount: number;
  selectedCount: number;
  searchErrors: number;
};

type PersistedUseCaseSearchSnapshot = {
  id: string;
  pipelineId: string;
};

type UseCaseSnapshotProcessMode = "probe" | "final";

type ProcessUseCaseSnapshotOptions = {
  mode: UseCaseSnapshotProcessMode;
  runMetadata?: Record<string, unknown>;
};

type UseCaseSearchFunction = (
  query: string,
  maxResults: number,
  freshness?: string,
) => Promise<SearchWebResult[]>;

export type UseCaseAdaptivePipelineDependencies = {
  logger?: PipelineLogger;
  persistSnapshot?(
    config: UseCasePipelineConfig,
    candidates: readonly UseCaseSearchCandidate[],
    queryCount: number,
    metadata: unknown,
  ): PersistedUseCaseSearchSnapshot;
  processSnapshot?(
    config: UseCasePipelineConfig,
    snapshotId: string,
    options: ProcessUseCaseSnapshotOptions,
  ): Promise<PipelineResult>;
  search?: UseCaseSearchFunction;
};

const SNAPSHOT_COLLECTION_METHOD_ID = "search_snapshot";
const SNAPSHOT_COLLECTOR_ID = "search_snapshot_collector";
const NOOP_ARTIFACT_WRITER_ID = "noop_artifact_writer";
const DEFAULT_SEARCH_RETRY_ATTEMPTS = 3;

function useCaseSearchConfig(configPath?: string, limit?: number): UseCasePipelineConfig {
  const config = loadUseCasePipelineConfig(configPath ?? USE_CASES_PIPELINE_ID);
  if (!limit) {
    return config;
  }

  return {
    ...config,
    limits: {
      ...config.limits,
      maxCandidatesForExtraction: limit,
    },
    metadata: {
      ...config.metadata,
      cliSearchLimit: limit,
    },
  };
}

function useCaseProcessConfig(configPath?: string, limit?: number): UseCasePipelineConfig {
  const config = loadUseCasePipelineConfig(configPath ?? USE_CASES_PIPELINE_ID);
  if (!limit) {
    return config;
  }

  return {
    ...config,
    failurePolicy: {
      ...config.failurePolicy,
      minItemsRequiredForSuccess: limit,
    },
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

function enabledUseCaseQueries(config: UseCasePipelineConfig): string[] {
  return config.collectionMethods
    .filter((method) => method.enabled !== false)
    .flatMap((method) => method.queries ?? []);
}

function sourceDomains(config: UseCasePipelineConfig): string[] {
  const sourceRegistry = loadSourceRegistry();
  const allowedSourceIds = new Set(config.sourceIds);

  return sourceRegistry.sources
    .filter((source) => allowedSourceIds.has(source.id))
    .flatMap((source) => source.domains);
}

function searchConfig(config: UseCasePipelineConfig): UseCaseSearchConfig {
  return {
    prioritizedDomains: sourceDomains(config),
    maxSearchQueries: config.limits.maxSearchQueries ?? 1,
    maxSearchResultsPerQuery: config.limits.maxSearchResultsPerQuery ?? 10,
    maxCandidatesForExtraction: config.limits.maxCandidatesForExtraction ?? 30,
    maxCandidateAgeDays: config.limits.maxItemAgeDays,
    referenceDate: new Date(),
  };
}

function selectedUseCaseTarget(config: UseCasePipelineConfig): number {
  const target = config.limits.limit ?? config.limits.maxResults ?? config.limits.maxUseCasesPerRun;
  if (typeof target === "number" && Number.isInteger(target) && target > 0) {
    return target;
  }

  return Math.max(1, config.failurePolicy.minItemsRequiredForSuccess);
}

function searchRetryConfig(config: UseCasePipelineConfig): UseCaseSearchRetryConfig {
  const settings = config.settings?.searchRetry ?? {};
  const configuredMaxAttempts = settings.maxAttempts ?? DEFAULT_SEARCH_RETRY_ATTEMPTS;

  return {
    enabled: settings.enabled !== false,
    maxAttempts: Math.max(1, configuredMaxAttempts),
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

function processConfigFromSnapshot(
  config: UseCasePipelineConfig,
  snapshotId: string,
  options: {
    metadata?: Record<string, unknown>;
    persistSelectedUseCases?: boolean;
    writeArtifact?: boolean;
  } = {},
): UseCasePipelineConfig {
  const writeArtifact = options.writeArtifact ?? true;
  const persistSelectedUseCases = options.persistSelectedUseCases ?? true;

  return {
    ...config,
    collectionMethods: [snapshotCollectionMethod(snapshotId)],
    output: writeArtifact
      ? config.output
      : {
          ...config.output,
          artifactWriterId: NOOP_ARTIFACT_WRITER_ID,
          metadata: {
            ...config.output.metadata,
            probe: true,
          },
        },
    metadata: {
      ...config.metadata,
      ...options.metadata,
      searchSnapshotId: snapshotId,
      processOnly: true,
      suppressUseCasePersistence: !persistSelectedUseCases,
    },
  };
}

function processModeConfig(mode: UseCaseSnapshotProcessMode): {
  persistSelectedUseCases: boolean;
  writeArtifact: boolean;
} {
  return {
    persistSelectedUseCases: mode === "final",
    writeArtifact: mode === "final",
  };
}

function persistSearchSnapshot(
  config: UseCasePipelineConfig,
  candidates: readonly UseCaseSearchCandidate[],
  queryCount: number,
  metadata: unknown,
) {
  const snapshot = createSearchSnapshot({
    pipelineId: config.pipelineId,
    queryCount,
    metadata,
  });

  candidates.forEach((candidate, index) => {
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
  updateSearchSnapshotResultCount(snapshot.id, candidates.length);

  return snapshot;
}

async function processSnapshot(
  config: UseCasePipelineConfig,
  snapshotId: string,
  options: ProcessUseCaseSnapshotOptions,
) {
  const loadConfig = () =>
    processConfigFromSnapshot(config, snapshotId, {
      ...processModeConfig(options.mode),
    });

  return runPipeline(USE_CASES_PIPELINE_ID, {
    loadConfig,
    loadSourceRegistry,
    logger,
    modelClient: getDefaultModelClient(),
    runMetadata: options.runMetadata ?? {},
    runStore: sqlitePipelineRunStore,
  });
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
  const snapshot = persistSearchSnapshot(config, result.candidates, result.searchedQueries, {
    searchErrors: result.searchErrors,
  });

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

export async function runUseCaseAdaptivePipeline(
  config: UseCasePipelineConfig,
  dependencies: UseCaseAdaptivePipelineDependencies = {},
): Promise<PipelineResult> {
  const queries = enabledUseCaseQueries(config);
  const retryConfig = searchRetryConfig(config);
  const targetCount = selectedUseCaseTarget(config);
  const maxAttempts = retryConfig.enabled ? retryConfig.maxAttempts : 1;
  const baseSearchConfig = searchConfig(config);
  const activeLogger = dependencies.logger ?? logger;
  const persistSnapshot = dependencies.persistSnapshot ?? persistSearchSnapshot;
  const processSearchSnapshot = dependencies.processSnapshot ?? processSnapshot;
  const search =
    dependencies.search ??
    ((query, maxResults, freshness) => searchWeb({ query, maxResults, freshness }));
  const attempts: UseCaseAdaptiveAttempt[] = [];
  const accumulatedCandidates: UseCaseSearchCandidate[] = [];
  const searchErrors: Array<{ query: string; error: string }> = [];
  let totalSearchedQueries = 0;
  let finalResult: PipelineResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const queryOffset = (attempt - 1) * baseSearchConfig.maxSearchQueries;
    if (queryOffset >= queries.length) {
      break;
    }

    const searchResult = await collectUseCaseSearchCandidates(
      {
        ...baseSearchConfig,
        queryOffset,
      },
      search,
      queries,
    );
    totalSearchedQueries += searchResult.searchedQueries;
    searchErrors.push(...searchResult.searchErrors);
    accumulatedCandidates.push(...searchResult.candidates);

    const rankedCandidates = rankUseCaseSearchCandidates(accumulatedCandidates, baseSearchConfig);
    const snapshot = persistSnapshot(config, rankedCandidates, totalSearchedQueries, {
      adaptiveSearch: {
        attempt,
        maxAttempts,
        targetCount,
        searchedQueriesThisAttempt: searchResult.searchedQueries,
        totalSearchedQueries,
      },
      searchErrors,
    });
    const isLastAttempt =
      attempt === maxAttempts || queryOffset + searchResult.searchedQueries >= queries.length;
    const probeResult = await processSearchSnapshot(config, snapshot.id, {
      mode: "probe",
    });
    const selectedCount = probeResult.counts.selected ?? 0;
    attempts.push({
      attempt,
      snapshotId: snapshot.id,
      searchedQueries: searchResult.searchedQueries,
      totalSearchedQueries,
      candidateCount: rankedCandidates.length,
      selectedCount,
      searchErrors: searchResult.searchErrors.length,
    });

    activeLogger.info(
      {
        event: "pipeline.use_cases.adaptive_search_attempt",
        attempt,
        maxAttempts,
        snapshotId: snapshot.id,
        targetCount,
        selectedCount,
        searchedQueries: searchResult.searchedQueries,
        totalSearchedQueries,
        candidateCount: rankedCandidates.length,
      },
      "use-case adaptive search attempt completed",
    );

    if (selectedCount >= targetCount || isLastAttempt) {
      finalResult = await processSearchSnapshot(config, snapshot.id, {
        mode: "final",
        runMetadata: {
          adaptiveSearch: {
            enabled: retryConfig.enabled,
            targetCount,
            maxAttempts,
            attempts,
            totalSearchedQueries,
            searchErrors,
          },
        },
      });
      break;
    }
  }

  if (!finalResult) {
    throw new Error("Use-case adaptive pipeline did not run because no search queries were found.");
  }

  return finalResult;
}

export function renderUseCaseAdaptiveDryRun(config: UseCasePipelineConfig): unknown {
  const queries = enabledUseCaseQueries(config);
  const retryConfig = searchRetryConfig(config);
  const targetCount = selectedUseCaseTarget(config);
  const maxAttempts = retryConfig.enabled ? retryConfig.maxAttempts : 1;
  const baseSearchConfig = searchConfig(config);

  return {
    dryRun: true,
    config,
    adaptiveSearch: {
      enabled: retryConfig.enabled,
      maxAttempts,
      maxSearchQueriesPerAttempt: baseSearchConfig.maxSearchQueries,
      maxSearchQueriesTotal: maxAttempts * baseSearchConfig.maxSearchQueries,
      targetCount,
      configuredQueryCount: queries.length,
    },
  };
}

export async function runUseCaseAdaptivePipelineCommand(
  options: UseCaseProcessCommandOptions = {},
): Promise<void> {
  const config = useCaseProcessConfig(options.configPath, options.limit);

  if (options.dryRun) {
    console.log(
      JSON.stringify(renderUseCaseAdaptiveDryRun(config), null, OUTPUT.JSON_INDENT_SPACES),
    );
    return;
  }

  registerBirbalPipelineComponents();

  const finalResult = await runUseCaseAdaptivePipeline(config);
  if (finalResult.status === "failed") {
    process.exitCode = 1;
  }

  console.log(JSON.stringify(finalResult, null, OUTPUT.JSON_INDENT_SPACES));
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
