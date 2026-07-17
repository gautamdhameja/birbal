// Purpose: Executes configured source collection methods.
// Scope: Owns collector concurrency, source errors, and run-item creation.

import { mapLimit } from "../concurrency.js";
import type { PipelineRunItem } from "../orchestrator/contracts.js";
import { PipelinePolicyAbortError, toPipelineError } from "../orchestrator/errors.js";
import { createRunItem, incrementCount } from "../orchestrator/items.js";
import { executionLimit, shouldContinueAfterSourceFailure } from "../orchestrator/policy.js";
import { normalizeCollectionResult } from "../orchestrator/sources.js";
import type {
  PipelineCollectionMethod,
  PipelineContext,
  PipelineCounts,
  PipelineError,
  SourceCollector,
} from "../types.js";

export async function collectItems(
  methods: PipelineCollectionMethod[],
  collectorsById: Map<string, SourceCollector>,
  context: PipelineContext,
  counts: PipelineCounts,
  errors: PipelineError[],
): Promise<PipelineRunItem[]> {
  const continueAfterFailure = shouldContinueAfterSourceFailure(context.config);
  const abortAfterFailure = (error: PipelineError, methodId: string): never => {
    incrementCount(counts, "collectionErrors");
    errors.push(error);
    throw new PipelinePolicyAbortError(
      `Pipeline stopped after source collection failure in ${methodId}.`,
    );
  };

  const collectionResults = await mapLimit(
    methods,
    executionLimit(context.config, "collectionConcurrency"),
    async (method) => {
      const collector = collectorsById.get(method.collectorId);
      if (!collector) {
        const error = {
          message: `Collector is not registered for method ${method.id}: ${method.collectorId}`,
          stepId: method.id,
          code: "collector_missing",
        } satisfies PipelineError;
        if (!continueAfterFailure) {
          abortAfterFailure(error, method.id);
        }

        return {
          items: [],
          error,
        };
      }

      let normalized;
      try {
        const collected = await collector.collect(method, context);
        normalized = normalizeCollectionResult(collected);
      } catch (error) {
        const pipelineError = toPipelineError(error, {
          stepId: method.id,
          code: "collection_failed",
          metadata: {
            collectorId: method.collectorId,
          },
        });
        if (!continueAfterFailure) {
          abortAfterFailure(pipelineError, method.id);
        }

        return {
          items: [],
          error: pipelineError,
        };
      }

      if (normalized.errors.length > 0 && !continueAfterFailure) {
        incrementCount(counts, "collectionErrors", normalized.errors.length);
        errors.push(...normalized.errors);
        throw new PipelinePolicyAbortError(
          `Pipeline stopped after source collection failure in ${method.id}.`,
        );
      }

      return {
        items: normalized.items,
        errors: normalized.errors,
        method,
      };
    },
    { stopOnError: !continueAfterFailure },
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

    if (result.errors && result.errors.length > 0) {
      incrementCount(counts, "collectionErrors", result.errors.length);
      errors.push(...result.errors);
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
