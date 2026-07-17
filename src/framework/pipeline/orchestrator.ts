// Purpose: Implements the framework pipeline orchestrator module.
// Scope: Stays generic so applications can plug in their own components.

import type { ModelClient } from "../llm/types.js";
import { loadPipelineConfig } from "./config.js";
import type { PipelineComponentRegistry } from "./registry.js";
import { pipelineComponentRegistry } from "./registry.js";
import { createInMemoryPipelineRunStore } from "./runStore.js";
import type {
  PipelineContext,
  PipelineCounts,
  PipelineError,
  PipelineLogger,
  PipelineMetadata,
  PipelineResult,
} from "./types.js";
import type { PipelineOrchestratorDependencies } from "./orchestrator/contracts.js";
import { errorMessage, PipelinePolicyAbortError, toPipelineError } from "./orchestrator/errors.js";
import { dedupeRunItems, incrementCount } from "./orchestrator/items.js";
import {
  assertComponent,
  assertMinimumViableItemCount,
  batchSize,
  collectedItemLimit,
  enabledCollectionMethods,
  executionLimit,
  statusFrom,
} from "./orchestrator/policy.js";
import { validateConfiguredSourceIds } from "./orchestrator/sources.js";
import {
  failPipelineRun,
  finishMetadata,
  finishPipelineRun,
  logPipelineStarted,
  runTimedStage,
} from "./orchestrator/telemetry.js";
import { collectItems } from "./stages/collection.js";
import { fetchAndExtractContent } from "./stages/content.js";
import { classifyAndExtractStructured, scoreItems } from "./stages/modelProcessing.js";
import { finalizePipeline, renderAndWriteArtifact, selectItems } from "./stages/output.js";

export type {
  PipelineOrchestratorDependencies,
  PipelineRunItem,
} from "./orchestrator/contracts.js";
export { validateConfiguredSourceIds } from "./orchestrator/sources.js";

const noopLogger: PipelineLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function missingSourceRegistryLoader(): never {
  throw new Error(
    "Pipeline source registry loader was not provided. Pass loadSourceRegistry in runPipeline dependencies.",
  );
}

const missingModelClient: ModelClient = {
  complete: async () => {
    throw new Error(
      "Pipeline model client was not provided. Pass modelClient in runPipeline dependencies.",
    );
  },
};

const defaultRunStore = createInMemoryPipelineRunStore();

const defaultDependencies: PipelineOrchestratorDependencies = {
  db: null,
  failRun: defaultRunStore.failRun,
  finishRun: defaultRunStore.finishRun,
  loadConfig: loadPipelineConfig,
  loadSourceRegistry: missingSourceRegistryLoader,
  logger: noopLogger,
  modelClient: missingModelClient,
  now: () => new Date(),
  registry: pipelineComponentRegistry,
  researchProfile: null,
  runMetadata: {},
  runStore: defaultRunStore,
  startRun: defaultRunStore.startRun,
};

function resolveDependencies(
  dependencies: Partial<PipelineOrchestratorDependencies>,
): PipelineOrchestratorDependencies {
  const deps = {
    ...defaultDependencies,
    ...dependencies,
  };

  if (dependencies.runStore && !dependencies.startRun) {
    deps.startRun = dependencies.runStore.startRun;
  }

  if (dependencies.runStore && !dependencies.finishRun) {
    deps.finishRun = dependencies.runStore.finishRun;
  }

  if (dependencies.runStore && !dependencies.failRun) {
    deps.failRun = dependencies.runStore.failRun;
  }

  return deps;
}

export async function runPipeline(
  configPathOrId: string,
  dependencies: Partial<PipelineOrchestratorDependencies> = {},
): Promise<PipelineResult> {
  const deps = resolveDependencies(dependencies);
  const config = deps.loadConfig(configPathOrId);
  const startedAt = deps.now();
  const runId = deps.startRun(config.pipelineId);
  const counts: PipelineCounts = {};
  const errors: PipelineError[] = [];
  const metadata: PipelineMetadata = {
    ...deps.runMetadata,
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
    validateConfiguredSourceIds(config, sourceRegistry);
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
    modelClient: deps.modelClient,
    rubric: components.rubrics[0],
    rubrics: components.rubrics,
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

  try {
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
    items = dedupeRunItems(items, counts);
    const collectedLimit = collectedItemLimit(config, items.length);
    if (items.length > collectedLimit) {
      incrementCount(counts, "collectionLimited", items.length - collectedLimit);
      items = items.slice(0, collectedLimit);
    }
    assertMinimumViableItemCount(config, items.length, "collection");

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
        fetchForTopN: config.contentFetchPolicy.fetchForTopN,
        maxChars: config.contentFetchPolicy.maxChars,
        maxResponseBytes: config.contentFetchPolicy.maxResponseBytes,
        preferFetchedContent: config.contentFetchPolicy.preferFetchedContent,
      },
    );
    assertMinimumViableItemCount(config, items.length, "content_fetch");

    if (components.scorers[0]) {
      items = await runTimedStage(
        context,
        "scoring",
        items.length,
        () =>
          scoreItems(
            items,
            assertComponent(components.scorers[0], "scorer"),
            context,
            counts,
            errors,
          ),
        {
          concurrency: executionLimit(config, "scoringConcurrency"),
          batchSize: batchSize(config, "scoring"),
        },
      );
      assertMinimumViableItemCount(config, items.length, "scoring");
    }

    items = await classifyAndExtractStructured(
      items,
      components.classifiers[0],
      components.structuredExtractors[0],
      context,
      counts,
      errors,
    );

    const selectedItems = await runTimedStage(context, "selection", items.length, () =>
      selectItems(items, assertComponent(components.selectors[0], "selector"), context, counts),
    );
    assertMinimumViableItemCount(config, selectedItems.length, "selection");

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
    if (components.finalizers[0]) {
      await runTimedStage(context, "finalization", selectedItems.length, () =>
        finalizePipeline(selectedItems, artifact, components.finalizers[0], context),
      );
    }
    const finishedAt = deps.now();

    const result: PipelineResult = {
      pipelineId: config.pipelineId,
      runId,
      status: statusFrom(errors, artifacts, selectedItems.length, config),
      artifacts,
      counts,
      errors,
      metadata: finishMetadata(metadata, finishedAt),
    };
    return finishPipelineRun(deps, runId, result, startedAt);
  } catch (error) {
    errors.push(
      toPipelineError(error, {
        code:
          error instanceof PipelinePolicyAbortError ? "failure_policy_abort" : "pipeline_failed",
      }),
    );
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
