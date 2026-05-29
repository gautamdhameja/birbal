// Purpose: Exposes the public pipeline framework API.
// Scope: Keeps imports stable while implementation modules stay focused.

export {
  filesystemArtifactWriter,
  formatPipelineRunDate,
  renderOutputPath,
} from "./artifactWriter.js";
export { mapBatches, mapLimit } from "./concurrency.js";
export { loadPipelineConfig } from "./config.js";
export { registerFrameworkPipelineComponents } from "./defaultComponents.js";
export { PipelineComponentRegistry, pipelineComponentRegistry } from "./registry.js";
export type {
  PipelineComponentRegistration,
  PipelineComponentRegistryOptions,
  ResolvedPipelineComponents,
} from "./registry.js";
export { runPipeline, validateConfiguredSourceIds } from "./orchestrator.js";
export type { PipelineOrchestratorDependencies, PipelineRunItem } from "./orchestrator.js";
export {
  createInMemoryPipelineRunStore,
  normalizeRunStatus,
  PIPELINE_RUN_STATUSES,
  PIPELINE_RUN_TYPES,
  summarizeRunErrors,
} from "./runStore.js";
export type {
  InMemoryPipelineRunStoreOptions,
  PipelineRunStore,
  RunSummary,
  StoredRun,
  StoredRunStatus,
} from "./runStore.js";
export type {
  ArtifactWriter,
  Classifier,
  ContentExtractor,
  ContentFetcher,
  PipelineArtifact,
  PipelineCollectionMethod,
  PipelineConfig,
  PipelineContentFetchPolicy,
  PipelineContext,
  PipelineCounts,
  PipelineError,
  PipelineExecutionConfig,
  PipelineFailurePolicy,
  PipelineId,
  PipelineLogger,
  PipelineMetadata,
  PipelineOutputConfig,
  PipelineResult,
  PipelineScheduleConfig,
  PipelineStatus,
  PipelineStep,
  Renderer,
  Scorer,
  Selector,
  SourceCollectionResult,
  SourceCollector,
  StructuredExtractor,
} from "./types.js";
