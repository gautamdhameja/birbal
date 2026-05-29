// Purpose: Implements the framework pipeline types module.
// Scope: Stays generic so applications can plug in their own components.

import type { Rubric } from "../scoring/rubric.js";

export type PipelineId = string;

export type PipelineMetadata = Record<string, unknown>;

export type PipelineCounts = Record<string, number>;

export type PipelineStatus = "success" | "partial_success" | "failed";

export type PipelineCollectionMethod = {
  id: string;
  collectorId: string;
  sourceIds?: string[];
  queries?: string[];
  enabled?: boolean;
  metadata?: PipelineMetadata;
};

export type PipelineContentFetchPolicy = {
  enabled: boolean;
  fetchForTopN: number;
  maxChars: number;
  preferFetchedContent: boolean;
  fetcherId?: string;
  extractorIds?: string[];
  metadata?: PipelineMetadata;
};

export type PipelineBatchConfig = {
  scoring?: number;
  classification?: number;
  structuredExtraction?: number;
};

export type PipelineExecutionConfig = {
  collectionConcurrency?: number;
  contentFetchConcurrency?: number;
  scoringConcurrency?: number;
  classificationConcurrency?: number;
  structuredExtractionConcurrency?: number;
  batchSize?: PipelineBatchConfig;
};

export type PipelineFailurePolicy = {
  failFast: boolean;
  continueOnSourceFailure: boolean;
  continueOnContentFetchFailure: boolean;
  continueOnScoringFailure: boolean;
  continueOnStructuredExtractionFailure: boolean;
  minItemsRequiredForSuccess: number;
};

export type PipelineOutputConfig = {
  format: string;
  directory?: string;
  filenameTemplate?: string;
  artifactWriterId: string;
  metadata?: PipelineMetadata;
};

export type PipelineScheduleConfig = {
  enabled?: boolean;
  timezone?: string;
  cron?: string;
  rrule?: string;
  metadata?: PipelineMetadata;
};

export type PipelineLogger = {
  debug(payload: PipelineMetadata, message?: string): void;
  info(payload: PipelineMetadata, message?: string): void;
  warn(payload: PipelineMetadata, message?: string): void;
  error(payload: PipelineMetadata, message?: string): void;
};

export type PipelineArtifact = {
  id: string;
  type: string;
  path?: string;
  url?: string;
  metadata?: PipelineMetadata;
};

export type PipelineError = {
  message: string;
  stepId?: string;
  sourceId?: string;
  itemId?: string;
  code?: string;
  cause?: unknown;
  metadata?: PipelineMetadata;
};

export interface PipelineConfig<TSettings = PipelineMetadata> {
  pipelineId: PipelineId;
  enabled: boolean;
  description: string;
  sourceIds: string[];
  collectionMethods: PipelineCollectionMethod[];
  contentFetchPolicy: PipelineContentFetchPolicy;
  scorerId?: string;
  rubricId?: string;
  classifierId?: string;
  structuredExtractorId?: string;
  selectorId: string;
  rendererId: string;
  output: PipelineOutputConfig;
  limits: PipelineCounts;
  execution?: PipelineExecutionConfig;
  failurePolicy: PipelineFailurePolicy;
  schedule?: PipelineScheduleConfig;
  settings?: TSettings;
  metadata?: PipelineMetadata;
}

export interface PipelineContext<
  TConfig extends PipelineConfig = PipelineConfig,
  TDb = unknown,
  TResearchProfile = unknown,
  TSourceRegistry = unknown,
> {
  pipelineId: PipelineId;
  runId: string;
  config: TConfig;
  logger: PipelineLogger;
  db: TDb;
  rubric?: Rubric;
  rubrics: readonly Rubric[];
  researchProfile: TResearchProfile;
  sourceRegistry: TSourceRegistry;
  startedAt: Date;
  metadata: PipelineMetadata;
}

export interface PipelineResult<TArtifact extends PipelineArtifact = PipelineArtifact> {
  pipelineId: PipelineId;
  runId: string;
  status: PipelineStatus;
  artifacts: TArtifact[];
  counts: PipelineCounts;
  errors: PipelineError[];
  metadata: PipelineMetadata;
}

export interface PipelineStep<
  TInput = unknown,
  TOutput = unknown,
  TContext extends PipelineContext = PipelineContext,
> {
  id: string;
  description?: string;
  run(input: TInput, context: TContext): Promise<TOutput>;
}

export interface SourceCollector<
  TQuery = unknown,
  TCollectedItem = unknown,
  TContext extends PipelineContext = PipelineContext,
> {
  collect(
    query: TQuery,
    context: TContext,
  ): Promise<TCollectedItem[] | SourceCollectionResult<TCollectedItem>>;
}

export type SourceCollectionResult<TCollectedItem = unknown> = {
  items: TCollectedItem[];
  errors?: PipelineError[];
};

export interface ContentFetcher<
  TItem = unknown,
  TFetchedContent = unknown,
  TContext extends PipelineContext = PipelineContext,
> {
  fetch(item: TItem, context: TContext): Promise<TFetchedContent>;
}

export interface ContentExtractor<
  TFetchedContent = unknown,
  TExtractedContent = unknown,
  TContext extends PipelineContext = PipelineContext,
> {
  extract(content: TFetchedContent, context: TContext): Promise<TExtractedContent>;
}

export interface Scorer<
  TItem = unknown,
  TScore = unknown,
  TContext extends PipelineContext = PipelineContext,
> {
  score(item: TItem, context: TContext): Promise<TScore>;
  scoreBatch?(items: TItem[], context: TContext): Promise<TScore[]>;
}

export interface Classifier<
  TItem = unknown,
  TClassification = unknown,
  TContext extends PipelineContext = PipelineContext,
> {
  classify(item: TItem, context: TContext): Promise<TClassification>;
  classifyBatch?(items: TItem[], context: TContext): Promise<TClassification[]>;
}

export interface StructuredExtractor<
  TInput = unknown,
  TStructuredOutput = unknown,
  TContext extends PipelineContext = PipelineContext,
> {
  extractStructured(input: TInput, context: TContext): Promise<TStructuredOutput>;
  extractStructuredBatch?(inputs: TInput[], context: TContext): Promise<TStructuredOutput[]>;
}

export interface Selector<
  TItem = unknown,
  TSelectedItem = TItem,
  TContext extends PipelineContext = PipelineContext,
> {
  select(items: TItem[], context: TContext): Promise<TSelectedItem[]>;
}

export interface Renderer<
  TInput = unknown,
  TRenderedOutput = string,
  TContext extends PipelineContext = PipelineContext,
> {
  render(input: TInput, context: TContext): Promise<TRenderedOutput>;
}

export interface ArtifactWriter<
  TRenderedOutput = unknown,
  TArtifact extends PipelineArtifact = PipelineArtifact,
  TContext extends PipelineContext = PipelineContext,
> {
  write(output: TRenderedOutput, context: TContext): Promise<TArtifact>;
}
