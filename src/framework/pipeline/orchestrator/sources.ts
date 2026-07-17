// Purpose: Normalizes source collector output and validates configured source IDs.
// Scope: Owns source-registry shape inspection outside the main orchestration flow.

import type { PipelineConfig, PipelineError, SourceCollectionResult } from "../types.js";

function isSourceCollectionResult(value: unknown): value is SourceCollectionResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "items" in value &&
    Array.isArray((value as SourceCollectionResult).items)
  );
}

export function normalizeCollectionResult(collected: unknown[] | SourceCollectionResult): {
  items: unknown[];
  errors: PipelineError[];
} {
  if (isSourceCollectionResult(collected)) {
    return {
      items: collected.items,
      errors: collected.errors ?? [],
    };
  }

  return {
    items: collected,
    errors: [],
  };
}

function sourceRegistryIds(sourceRegistry: unknown): Set<string> {
  if (
    typeof sourceRegistry !== "object" ||
    sourceRegistry === null ||
    !("sources" in sourceRegistry) ||
    !Array.isArray((sourceRegistry as { sources?: unknown }).sources)
  ) {
    return new Set();
  }

  return new Set(
    (sourceRegistry as { sources: Array<{ id?: unknown }> }).sources
      .map((source) => source.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
}

export function validateConfiguredSourceIds(config: PipelineConfig, sourceRegistry: unknown): void {
  const knownSourceIds = sourceRegistryIds(sourceRegistry);
  const configuredSourceIds = new Set([
    ...config.sourceIds,
    ...config.collectionMethods.flatMap((method) => method.sourceIds ?? []),
  ]);
  const unknownSourceIds = [...configuredSourceIds].filter(
    (sourceId) => !knownSourceIds.has(sourceId),
  );

  if (unknownSourceIds.length > 0) {
    throw new Error(
      `Pipeline references unknown source IDs: ${unknownSourceIds.sort().join(", ")}`,
    );
  }
}
