import type { ModelClient } from "../../llm/types.js";
import type { PipelineComponentRegistry } from "../registry.js";
import type { PipelineRunStore } from "../runStore.js";
import type { PipelineConfig, PipelineLogger, PipelineMetadata } from "../types.js";

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

export type PipelineOrchestratorDependencies = {
  db: unknown;
  loadConfig(configPathOrId: string): PipelineConfig;
  loadSourceRegistry(): unknown;
  logger: PipelineLogger;
  modelClient: ModelClient;
  now(): Date;
  registry: PipelineComponentRegistry;
  researchProfile: unknown;
  runMetadata: PipelineMetadata;
  runStore: Pick<PipelineRunStore, "startRun" | "finishRun" | "failRun">;
};

export type PipelineExecutionConcurrencyKey = Exclude<
  keyof NonNullable<PipelineConfig["execution"]>,
  "batchSize"
>;
