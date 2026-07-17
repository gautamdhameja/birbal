import type { PipelineExecutionConcurrencyKey } from "./contracts.js";
import { PipelinePolicyAbortError } from "./errors.js";
import type {
  PipelineArtifact,
  PipelineCollectionMethod,
  PipelineConfig,
  PipelineError,
  PipelineStatus,
} from "../types.js";

export function statusFrom(
  errors: readonly PipelineError[],
  artifacts: readonly PipelineArtifact[],
  selectedItemCount: number,
  config: PipelineConfig,
): PipelineStatus {
  if (
    artifacts.length === 0 ||
    selectedItemCount < config.failurePolicy.minItemsRequiredForSuccess
  ) {
    return "failed";
  }

  return errors.length > 0 ? "partial_success" : "success";
}

export function enabledCollectionMethods(config: PipelineConfig): PipelineCollectionMethod[] {
  return config.collectionMethods.filter((method) => method.enabled !== false);
}

export function executionLimit(
  config: PipelineConfig,
  key: PipelineExecutionConcurrencyKey,
): number {
  const value = config.execution?.[key];
  return typeof value === "number" ? value : 1;
}

export function batchSize(
  config: PipelineConfig,
  key: keyof NonNullable<NonNullable<PipelineConfig["execution"]>["batchSize"]>,
): number {
  const value = config.execution?.batchSize?.[key];
  return typeof value === "number" ? value : 1;
}

export function fetchLimit(config: PipelineConfig, itemCount: number): number {
  return Math.min(config.contentFetchPolicy.fetchForTopN, itemCount);
}

export function collectedItemLimit(config: PipelineConfig, itemCount: number): number {
  const value = config.limits.maxCandidates;
  return typeof value === "number" && value > 0 ? Math.min(value, itemCount) : itemCount;
}

export function shouldContinueAfterSourceFailure(config: PipelineConfig): boolean {
  return config.failurePolicy.continueOnSourceFailure && !config.failurePolicy.failFast;
}

export function shouldContinueAfterContentFetchFailure(config: PipelineConfig): boolean {
  return config.failurePolicy.continueOnContentFetchFailure && !config.failurePolicy.failFast;
}

export function shouldContinueAfterScoringFailure(config: PipelineConfig): boolean {
  return config.failurePolicy.continueOnScoringFailure && !config.failurePolicy.failFast;
}

export function shouldContinueAfterStructuredExtractionFailure(config: PipelineConfig): boolean {
  return (
    config.failurePolicy.continueOnStructuredExtractionFailure && !config.failurePolicy.failFast
  );
}

export function shouldContinueAfterNonPolicyFailure(config: PipelineConfig): boolean {
  return !config.failurePolicy.failFast;
}

export function assertMinimumViableItemCount(
  config: PipelineConfig,
  availableItemCount: number,
  stageId: string,
): void {
  const minimum = config.failurePolicy.minItemsRequiredForSuccess;
  if (availableItemCount >= minimum) {
    return;
  }

  throw new PipelinePolicyAbortError(
    `Pipeline cannot produce the minimum viable output after ${stageId}: ${availableItemCount} item(s) available, ${minimum} required.`,
  );
}

export function assertComponent<TComponent>(
  component: TComponent | undefined,
  componentName: string,
): TComponent {
  if (!component) {
    throw new Error(`Pipeline component is required but was not resolved: ${componentName}`);
  }

  return component;
}

export function assertBatchResultLength<TValue>(
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
