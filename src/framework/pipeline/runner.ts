import { loadSourceRegistry } from "../../config/sourceRegistry.js";
import { isHttpStatusError, summarizeHttpErrorBody } from "../../http/client.js";
import { logger } from "../../logging/logger.js";
import { preview } from "../../logging/preview.js";
import { mapBatches, mapLimit } from "./concurrency.js";
import { loadPipelineConfig } from "./config.js";
import { PipelineComponentRegistry, pipelineComponentRegistry } from "./registry.js";
import { failRun, finishRun, startRun } from "./runs.js";
import type { RunSummary } from "./runs.js";
import type {
  ArtifactWriter,
  Classifier,
  ContentExtractor,
  ContentFetcher,
  PipelineArtifact,
  PipelineCollectionMethod,
  PipelineConfig,
  PipelineContext,
  PipelineCounts,
  PipelineError,
  PipelineLogger,
  PipelineMetadata,
  PipelineResult,
  PipelineStatus,
  Renderer,
  Scorer,
  Selector,
  SourceCollector,
  StructuredExtractor,
} from "./types.js";

export type PipelineRunItem = {
  id: string;
  item: unknown;
  content?: unknown;
  extractedContent?: unknown[];
  score?: unknown;
  classification?: unknown;
  structuredData?: unknown;
  metadata: PipelineMetadata;
};

type PipelineRunnerDependencies = {
  db: unknown;
  failRun(runId: string, errorSummary: string): void;
  finishRun(runId: string, result: RunSummary): void;
  loadConfig(configPathOrId: string): PipelineConfig;
  loadSourceRegistry(): unknown;
  logger: PipelineLogger;
  now(): Date;
  registry: PipelineComponentRegistry;
  researchProfile: unknown;
  startRun(pipelineId: string): string;
};

type PipelineExecutionConcurrencyKey = Exclude<
  keyof NonNullable<PipelineConfig["execution"]>,
  "batchSize"
>;

const PIPELINE_LOG_EVENTS = {
  STARTED: "pipeline.run.started",
  FINISHED: "pipeline.run.finished",
  STAGE_STARTED: "pipeline.stage.started",
  STAGE_FINISHED: "pipeline.stage.finished",
  STAGE_FAILED: "pipeline.stage.failed",
} as const;

const PIPELINE_LOG_MESSAGES = {
  STARTED: "pipeline run started",
  FINISHED: "pipeline run finished",
  STAGE_STARTED: "pipeline stage started",
  STAGE_FINISHED: "pipeline stage finished",
  STAGE_FAILED: "pipeline stage failed",
} as const;

const defaultDependencies: PipelineRunnerDependencies = {
  db: null,
  failRun,
  finishRun,
  loadConfig: loadPipelineConfig,
  loadSourceRegistry,
  logger,
  now: () => new Date(),
  registry: pipelineComponentRegistry,
  researchProfile: null,
  startRun,
};

function incrementCount(counts: PipelineCounts, key: string, amount = 1): void {
  counts[key] = (counts[key] ?? 0) + amount;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function serializeErrorCause(error: unknown): unknown {
  if (isHttpStatusError(error)) {
    return {
      name: error.name,
      status: error.status,
      statusText: error.statusText,
      bodyPreview: summarizeHttpErrorBody(error.body),
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: preview(error.message),
    };
  }

  return preview(error);
}

function toPipelineError(error: unknown, metadata: Omit<PipelineError, "message">): PipelineError {
  return {
    ...metadata,
    message: preview(errorMessage(error)),
    cause: serializeErrorCause(error),
  };
}

function statusFrom(
  errors: readonly PipelineError[],
  artifacts: readonly PipelineArtifact[],
): PipelineStatus {
  if (artifacts.length === 0) {
    return "failed";
  }

  return errors.length > 0 ? "partial" : "success";
}

function assertComponent<TComponent>(
  component: TComponent | undefined,
  componentName: string,
): TComponent {
  if (!component) {
    throw new Error(`Pipeline component is required but was not resolved: ${componentName}`);
  }

  return component;
}

function itemId(item: unknown, index: number): string {
  if (typeof item === "object" && item !== null && "id" in item) {
    const value = (item as { id?: unknown }).id;
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return `item:${index + 1}`;
}

function createRunItem(
  item: unknown,
  index: number,
  metadata: PipelineMetadata = {},
): PipelineRunItem {
  return {
    id: itemId(item, index),
    item,
    metadata,
  };
}

function enabledCollectionMethods(config: PipelineConfig): PipelineCollectionMethod[] {
  return config.collectionMethods.filter((method) => method.enabled !== false);
}

function executionLimit(config: PipelineConfig, key: PipelineExecutionConcurrencyKey): number {
  const value = config.execution?.[key];
  return typeof value === "number" ? value : 1;
}

function batchSize(
  config: PipelineConfig,
  key: keyof NonNullable<NonNullable<PipelineConfig["execution"]>["batchSize"]>,
): number {
  const value = config.execution?.batchSize?.[key];
  return typeof value === "number" ? value : 1;
}

function fetchLimit(config: PipelineConfig, itemCount: number): number {
  return Math.min(config.contentFetchPolicy.maxItems ?? itemCount, itemCount);
}

function collectedItemLimit(config: PipelineConfig, itemCount: number): number {
  const value = config.limits.maxCandidates;
  return typeof value === "number" && value > 0 ? Math.min(value, itemCount) : itemCount;
}

function finishMetadata(metadata: PipelineMetadata, finishedAt: Date): PipelineMetadata {
  return {
    ...metadata,
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - Date.parse(String(metadata.startedAt)),
  };
}

function logPipelineStarted(
  logger: PipelineLogger,
  config: PipelineConfig,
  runId: string,
  startedAt: Date,
): void {
  logger.info(
    {
      event: PIPELINE_LOG_EVENTS.STARTED,
      pipelineId: config.pipelineId,
      runId,
      startedAt: startedAt.toISOString(),
    },
    PIPELINE_LOG_MESSAGES.STARTED,
  );
}

function logPipelineFinished(
  logger: PipelineLogger,
  result: PipelineResult,
  startedAt: Date,
): void {
  const finishedAt = String(result.metadata.finishedAt);
  const durationMs =
    typeof result.metadata.durationMs === "number"
      ? result.metadata.durationMs
      : Date.parse(finishedAt) - startedAt.getTime();

  logger.info(
    {
      event: PIPELINE_LOG_EVENTS.FINISHED,
      pipelineId: result.pipelineId,
      runId: result.runId,
      status: result.status,
      startedAt: startedAt.toISOString(),
      finishedAt,
      durationMs,
      counts: result.counts,
      artifactCount: result.artifacts.length,
      errorCount: result.errors.length,
    },
    PIPELINE_LOG_MESSAGES.FINISHED,
  );
}

function countOutput(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    return value.length;
  }

  return value === undefined || value === null ? undefined : 1;
}

async function runTimedStage<TResult>(
  context: PipelineContext,
  stageId: string,
  inputCount: number | undefined,
  run: () => Promise<TResult>,
  metadata: PipelineMetadata = {},
): Promise<TResult> {
  const startedAt = new Date();
  const basePayload = {
    pipelineId: context.pipelineId,
    runId: context.runId,
    stageId,
    ...metadata,
  };

  context.logger.debug(
    {
      event: PIPELINE_LOG_EVENTS.STAGE_STARTED,
      ...basePayload,
      startedAt: startedAt.toISOString(),
      inputCount,
    },
    PIPELINE_LOG_MESSAGES.STAGE_STARTED,
  );

  try {
    const result = await run();
    const finishedAt = new Date();
    context.logger.debug(
      {
        event: PIPELINE_LOG_EVENTS.STAGE_FINISHED,
        ...basePayload,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        inputCount,
        outputCount: countOutput(result),
      },
      PIPELINE_LOG_MESSAGES.STAGE_FINISHED,
    );

    return result;
  } catch (error) {
    const finishedAt = new Date();
    context.logger.warn(
      {
        event: PIPELINE_LOG_EVENTS.STAGE_FAILED,
        ...basePayload,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        inputCount,
        error: error instanceof Error ? error.message : String(error),
      },
      PIPELINE_LOG_MESSAGES.STAGE_FAILED,
    );
    throw error;
  }
}

function failedResult(
  config: PipelineConfig,
  runId: string,
  metadata: PipelineMetadata,
  counts: PipelineCounts,
  errors: PipelineError[],
): PipelineResult {
  return {
    pipelineId: config.pipelineId,
    runId,
    status: "failed",
    artifacts: [],
    counts,
    errors,
    metadata,
  };
}

function finishSharedRun(
  deps: PipelineRunnerDependencies,
  runId: string,
  result: PipelineResult,
): void {
  deps.finishRun(runId, {
    status: result.status,
    sourcesAttempted: result.counts.collectionMethodsRun ?? 0,
    sourcesSucceeded: result.counts.collectionMethodsRun ?? 0,
    sourcesFailed: result.counts.collectionErrors ?? 0,
    itemsCollected: result.counts.collected ?? 0,
    itemsScored: result.counts.scored ?? 0,
    itemsRejected: result.counts.rejected ?? 0,
    itemsSelected: result.counts.selected ?? 0,
    artifacts: result.artifacts,
    errors: result.errors,
    metadata: result.metadata,
  });
}

function finishPipelineRun(
  deps: PipelineRunnerDependencies,
  runId: string,
  result: PipelineResult,
  startedAt: Date,
): PipelineResult {
  finishSharedRun(deps, runId, result);
  logPipelineFinished(deps.logger, result, startedAt);

  return result;
}

function failPipelineRun(
  deps: PipelineRunnerDependencies,
  config: PipelineConfig,
  runId: string,
  startedAt: Date,
  metadata: PipelineMetadata,
  counts: PipelineCounts,
  errors: PipelineError[],
  errorSummary: string,
): PipelineResult {
  deps.failRun(runId, errorSummary);
  const result = failedResult(config, runId, finishMetadata(metadata, deps.now()), counts, errors);
  logPipelineFinished(deps.logger, result, startedAt);

  return result;
}

async function collectItems(
  methods: PipelineCollectionMethod[],
  collectorsById: Map<string, SourceCollector>,
  context: PipelineContext,
  counts: PipelineCounts,
  errors: PipelineError[],
): Promise<PipelineRunItem[]> {
  const collectionResults = await mapLimit(
    methods,
    executionLimit(context.config, "collectionConcurrency"),
    async (method) => {
      const collector = collectorsById.get(method.collectorId);
      if (!collector) {
        return {
          items: [],
          error: {
            message: `Collector is not registered for method ${method.id}: ${method.collectorId}`,
            stepId: method.id,
            code: "collector_missing",
          } satisfies PipelineError,
        };
      }

      try {
        const collected = await collector.collect(method, context);
        return {
          items: collected,
          method,
        };
      } catch (error) {
        return {
          items: [],
          error: toPipelineError(error, {
            stepId: method.id,
            code: "collection_failed",
            metadata: {
              collectorId: method.collectorId,
            },
          }),
        };
      }
    },
  );

  const items: PipelineRunItem[] = [];
  for (const result of collectionResults) {
    if (result.error) {
      incrementCount(counts, "collectionErrors");
      errors.push(result.error);
      continue;
    }

    const method = result.method;
    if (!method) {
      continue;
    }

    incrementCount(counts, "collectionMethodsRun");
    incrementCount(counts, "collected", result.items.length);
    items.push(
      ...result.items.map((item, index) =>
        createRunItem(item, items.length + index, {
          collectionMethodId: method.id,
          collectorId: method.collectorId,
        }),
      ),
    );
  }

  return items;
}

async function fetchAndExtractContent(
  items: PipelineRunItem[],
  config: PipelineConfig,
  fetcher: ContentFetcher | undefined,
  extractors: ContentExtractor[],
  context: PipelineContext,
  counts: PipelineCounts,
  errors: PipelineError[],
): Promise<PipelineRunItem[]> {
  if (!config.contentFetchPolicy.enabled) {
    return items;
  }

  if (!fetcher) {
    errors.push({
      message: "Content fetch policy is enabled but no content fetcher is configured.",
      code: "content_fetcher_missing",
    });
    return config.contentFetchPolicy.requireFetchedContent ? [] : items;
  }

  const limit = fetchLimit(config, items.length);

  return mapLimit(items, executionLimit(config, "contentFetchConcurrency"), async (item, index) => {
    if (index >= limit) {
      return item;
    }

    let content: unknown;
    try {
      content = await fetcher.fetch(item, context);
      incrementCount(counts, "contentFetched");
    } catch (error) {
      incrementCount(counts, "contentFetchErrors");
      errors.push(
        toPipelineError(error, {
          itemId: item.id,
          code: "content_fetch_failed",
        }),
      );

      if (!config.contentFetchPolicy.requireFetchedContent) {
        return {
          ...item,
          metadata: {
            ...item.metadata,
            contentFetchStatus: "failed",
          },
        };
      }

      return undefined;
    }

    const extractedContent = [];
    for (const extractor of extractors) {
      try {
        extractedContent.push(await extractor.extract(content, context));
        incrementCount(counts, "contentExtracted");
      } catch (error) {
        incrementCount(counts, "contentExtractionErrors");
        errors.push(
          toPipelineError(error, {
            itemId: item.id,
            code: "content_extraction_failed",
          }),
        );
      }
    }

    return {
      ...item,
      content,
      extractedContent,
      metadata: {
        ...item.metadata,
        contentFetchStatus: "fetched",
      },
    };
  }).then((fetchedItems) =>
    fetchedItems.filter((item): item is PipelineRunItem => item !== undefined),
  );
}

function assertBatchResultLength<TValue>(
  results: readonly TValue[],
  expectedLength: number,
  componentName: string,
): void {
  if (results.length !== expectedLength) {
    throw new Error(
      `${componentName} returned ${results.length} results for ${expectedLength} input items.`,
    );
  }
}

async function scoreItems(
  items: PipelineRunItem[],
  scorer: Scorer,
  context: PipelineContext,
  counts: PipelineCounts,
  errors: PipelineError[],
): Promise<PipelineRunItem[]> {
  async function scoreOne(item: PipelineRunItem): Promise<PipelineRunItem> {
    try {
      const score = await scorer.score(item, context);
      incrementCount(counts, "scored");
      return { ...item, score };
    } catch (error) {
      incrementCount(counts, "scoreErrors");
      errors.push(
        toPipelineError(error, {
          itemId: item.id,
          code: "score_failed",
        }),
      );
      return item;
    }
  }

  if (!scorer.scoreBatch || batchSize(context.config, "scoring") <= 1) {
    return mapLimit(items, executionLimit(context.config, "scoringConcurrency"), scoreOne);
  }

  return mapBatches(
    items,
    batchSize(context.config, "scoring"),
    executionLimit(context.config, "scoringConcurrency"),
    async (batch) => {
      try {
        const scores = await scorer.scoreBatch?.(batch, context);
        assertBatchResultLength(scores ?? [], batch.length, "scoreBatch");
        incrementCount(counts, "scored", batch.length);
        return batch.map((item, index) => ({
          ...item,
          score: scores?.[index],
        }));
      } catch (error) {
        incrementCount(counts, "scoreErrors", batch.length);
        for (const item of batch) {
          errors.push(
            toPipelineError(error, {
              itemId: item.id,
              code: "score_failed",
            }),
          );
        }
        return batch;
      }
    },
  );
}

async function classifyAndExtractStructured(
  items: PipelineRunItem[],
  classifier: Classifier | undefined,
  structuredExtractor: StructuredExtractor | undefined,
  context: PipelineContext,
  counts: PipelineCounts,
  errors: PipelineError[],
): Promise<PipelineRunItem[]> {
  let output = items;

  if (classifier) {
    const activeClassifier = classifier;
    async function classifyOne(item: PipelineRunItem): Promise<PipelineRunItem> {
      try {
        const classification = await activeClassifier.classify(item, context);
        incrementCount(counts, "classified");
        return { ...item, classification };
      } catch (error) {
        incrementCount(counts, "classificationErrors");
        errors.push(
          toPipelineError(error, {
            itemId: item.id,
            code: "classification_failed",
          }),
        );
        return item;
      }
    }

    if (!activeClassifier.classifyBatch || batchSize(context.config, "classification") <= 1) {
      output = await runTimedStage(
        context,
        "classification",
        output.length,
        () =>
          mapLimit(
            output,
            executionLimit(context.config, "classificationConcurrency"),
            classifyOne,
          ),
        {
          concurrency: executionLimit(context.config, "classificationConcurrency"),
        },
      );
    } else {
      output = await runTimedStage(
        context,
        "classification",
        output.length,
        () =>
          mapBatches(
            output,
            batchSize(context.config, "classification"),
            executionLimit(context.config, "classificationConcurrency"),
            async (batch) => {
              try {
                const classifications = await activeClassifier.classifyBatch?.(batch, context);
                assertBatchResultLength(classifications ?? [], batch.length, "classifyBatch");
                incrementCount(counts, "classified", batch.length);
                return batch.map((item, index) => ({
                  ...item,
                  classification: classifications?.[index],
                }));
              } catch (error) {
                incrementCount(counts, "classificationErrors", batch.length);
                for (const item of batch) {
                  errors.push(
                    toPipelineError(error, {
                      itemId: item.id,
                      code: "classification_failed",
                    }),
                  );
                }
                return batch;
              }
            },
          ),
        {
          concurrency: executionLimit(context.config, "classificationConcurrency"),
          batchSize: batchSize(context.config, "classification"),
        },
      );
    }
  }

  if (structuredExtractor) {
    const activeStructuredExtractor = structuredExtractor;
    async function extractOne(item: PipelineRunItem): Promise<PipelineRunItem> {
      try {
        const structuredData = await activeStructuredExtractor.extractStructured(item, context);
        incrementCount(counts, "structuredExtracted");
        return { ...item, structuredData };
      } catch (error) {
        incrementCount(counts, "structuredExtractionErrors");
        errors.push(
          toPipelineError(error, {
            itemId: item.id,
            code: "structured_extraction_failed",
          }),
        );
        return item;
      }
    }

    if (
      !activeStructuredExtractor.extractStructuredBatch ||
      batchSize(context.config, "structuredExtraction") <= 1
    ) {
      output = await runTimedStage(
        context,
        "structured_extraction",
        output.length,
        () =>
          mapLimit(
            output,
            executionLimit(context.config, "structuredExtractionConcurrency"),
            extractOne,
          ),
        {
          concurrency: executionLimit(context.config, "structuredExtractionConcurrency"),
        },
      );
    } else {
      output = await runTimedStage(
        context,
        "structured_extraction",
        output.length,
        () =>
          mapBatches(
            output,
            batchSize(context.config, "structuredExtraction"),
            executionLimit(context.config, "structuredExtractionConcurrency"),
            async (batch) => {
              try {
                const structuredData = await activeStructuredExtractor.extractStructuredBatch?.(
                  batch,
                  context,
                );
                assertBatchResultLength(
                  structuredData ?? [],
                  batch.length,
                  "extractStructuredBatch",
                );
                incrementCount(counts, "structuredExtracted", batch.length);
                return batch.map((item, index) => ({
                  ...item,
                  structuredData: structuredData?.[index],
                }));
              } catch (error) {
                incrementCount(counts, "structuredExtractionErrors", batch.length);
                for (const item of batch) {
                  errors.push(
                    toPipelineError(error, {
                      itemId: item.id,
                      code: "structured_extraction_failed",
                    }),
                  );
                }
                return batch;
              }
            },
          ),
        {
          concurrency: executionLimit(context.config, "structuredExtractionConcurrency"),
          batchSize: batchSize(context.config, "structuredExtraction"),
        },
      );
    }
  }

  return output;
}

async function selectItems(
  items: PipelineRunItem[],
  selector: Selector,
  context: PipelineContext,
  counts: PipelineCounts,
): Promise<unknown[]> {
  const selected = await selector.select(items, context);
  incrementCount(counts, "selected", selected.length);
  return selected;
}

async function renderAndWriteArtifact(
  selectedItems: unknown[],
  renderer: Renderer,
  writer: ArtifactWriter,
  context: PipelineContext,
  counts: PipelineCounts,
): Promise<PipelineArtifact> {
  const rendered = await renderer.render(selectedItems, context);
  incrementCount(counts, "rendered");

  const artifact = await writer.write(rendered, context);
  incrementCount(counts, "artifactsWritten");

  return artifact;
}

export async function runPipeline(
  configPathOrId: string,
  dependencies: Partial<PipelineRunnerDependencies> = {},
): Promise<PipelineResult> {
  const deps = {
    ...defaultDependencies,
    ...dependencies,
  };
  const config = deps.loadConfig(configPathOrId);
  const startedAt = deps.now();
  const runId = deps.startRun(config.pipelineId);
  const counts: PipelineCounts = {};
  const errors: PipelineError[] = [];
  const metadata: PipelineMetadata = {
    configPathOrId,
    startedAt: startedAt.toISOString(),
  };
  logPipelineStarted(deps.logger, config, runId, startedAt);

  if (!config.enabled) {
    const finishedAt = deps.now();
    const result: PipelineResult = {
      pipelineId: config.pipelineId,
      runId,
      status: "success",
      artifacts: [],
      counts,
      errors,
      metadata: finishMetadata({ ...metadata, skipped: true }, finishedAt),
    };
    return finishPipelineRun(deps, runId, result, startedAt);
  }

  let sourceRegistry: unknown;
  try {
    sourceRegistry = deps.loadSourceRegistry();
  } catch (error) {
    errors.push(toPipelineError(error, { code: "source_registry_load_failed" }));
    return failPipelineRun(
      deps,
      config,
      runId,
      startedAt,
      metadata,
      counts,
      errors,
      errorMessage(error),
    );
  }

  let components: ReturnType<PipelineComponentRegistry["resolveFromConfig"]>;
  try {
    components = deps.registry.resolveFromConfig(config);
  } catch (error) {
    errors.push(toPipelineError(error, { code: "component_resolution_failed" }));
    return failPipelineRun(
      deps,
      config,
      runId,
      startedAt,
      metadata,
      counts,
      errors,
      errorMessage(error),
    );
  }

  const context: PipelineContext = {
    pipelineId: config.pipelineId,
    runId,
    config,
    logger: deps.logger,
    db: deps.db,
    researchProfile: deps.researchProfile,
    sourceRegistry,
    startedAt,
    metadata,
  };
  const collectorsById = new Map(
    enabledCollectionMethods(config).map((method) => [
      method.collectorId,
      deps.registry.getCollector(method.collectorId),
    ]),
  );

  const collectionMethods = enabledCollectionMethods(config);
  let items = await runTimedStage(
    context,
    "collection",
    collectionMethods.length,
    () => collectItems(collectionMethods, collectorsById, context, counts, errors),
    {
      concurrency: executionLimit(config, "collectionConcurrency"),
    },
  );
  const collectedLimit = collectedItemLimit(config, items.length);
  if (items.length > collectedLimit) {
    incrementCount(counts, "collectionLimited", items.length - collectedLimit);
    items = items.slice(0, collectedLimit);
  }
  items = await runTimedStage(
    context,
    "content_fetch",
    items.length,
    () =>
      fetchAndExtractContent(
        items,
        config,
        components.contentFetchers[0],
        components.contentExtractors,
        context,
        counts,
        errors,
      ),
    {
      concurrency: executionLimit(config, "contentFetchConcurrency"),
      maxItems: config.contentFetchPolicy.maxItems,
      requireFetchedContent: config.contentFetchPolicy.requireFetchedContent,
    },
  );
  items = await runTimedStage(
    context,
    "scoring",
    items.length,
    () =>
      scoreItems(items, assertComponent(components.scorers[0], "scorer"), context, counts, errors),
    {
      concurrency: executionLimit(config, "scoringConcurrency"),
      batchSize: batchSize(config, "scoring"),
    },
  );
  items = await classifyAndExtractStructured(
    items,
    components.classifiers[0],
    components.structuredExtractors[0],
    context,
    counts,
    errors,
  );

  try {
    const selectedItems = await runTimedStage(context, "selection", items.length, () =>
      selectItems(items, assertComponent(components.selectors[0], "selector"), context, counts),
    );
    const artifact = await runTimedStage(context, "render_and_write", selectedItems.length, () =>
      renderAndWriteArtifact(
        selectedItems,
        assertComponent(components.renderers[0], "renderer"),
        assertComponent(components.artifactWriters[0], "artifactWriter"),
        context,
        counts,
      ),
    );
    const artifacts = [artifact];
    const finishedAt = deps.now();

    const result: PipelineResult = {
      pipelineId: config.pipelineId,
      runId,
      status: statusFrom(errors, artifacts),
      artifacts,
      counts,
      errors,
      metadata: finishMetadata(metadata, finishedAt),
    };
    return finishPipelineRun(deps, runId, result, startedAt);
  } catch (error) {
    errors.push(toPipelineError(error, { code: "artifact_stage_failed" }));
    return failPipelineRun(
      deps,
      config,
      runId,
      startedAt,
      metadata,
      counts,
      errors,
      errorMessage(error),
    );
  }
}
