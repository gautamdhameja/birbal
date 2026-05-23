import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import type { PipelineConfig, PipelineComponentConfig } from "./types.js";

const PIPELINE_CONFIG_DIRECTORY = "config/pipelines";
const PIPELINE_CONFIG_EXTENSION = ".json";
const PIPELINE_CONFIG_ERRORS = {
  INVALID_JSON: "Pipeline config is not valid JSON.",
  INVALID_CONFIG: "Pipeline config is invalid.",
} as const;

const NonEmptyStringSchema = z.string().trim().min(1);
const MetadataSchema = z.record(z.string(), z.unknown());
const LimitsSchema = z.record(z.string(), z.number().finite().nonnegative());
const PositiveIntegerSchema = z.number().int().positive();
const NonNegativeIntegerSchema = z.number().int().nonnegative();

const DefaultFailurePolicy = {
  failFast: false,
  continueOnSourceFailure: true,
  continueOnContentFetchFailure: true,
  continueOnScoringFailure: true,
  minItemsRequiredForSuccess: 1,
} as const;

const PipelineCollectionMethodSchema = z.strictObject({
  id: NonEmptyStringSchema,
  collectorId: NonEmptyStringSchema,
  sourceIds: z.array(NonEmptyStringSchema).optional(),
  queries: z.array(NonEmptyStringSchema).optional(),
  enabled: z.boolean().optional(),
  metadata: MetadataSchema.optional(),
});

const PipelineContentFetchPolicySchema = z.strictObject({
  enabled: z.boolean(),
  fetcherId: NonEmptyStringSchema.optional(),
  extractorIds: z.array(NonEmptyStringSchema).optional(),
  maxItems: z.number().int().positive().optional(),
  requireFetchedContent: z.boolean().optional(),
  metadata: MetadataSchema.optional(),
});

const PipelineOutputConfigSchema = z.strictObject({
  format: NonEmptyStringSchema,
  directory: NonEmptyStringSchema.optional(),
  filenameTemplate: NonEmptyStringSchema.optional(),
  artifactWriterId: NonEmptyStringSchema.optional(),
  metadata: MetadataSchema.optional(),
});

const PipelineExecutionConfigSchema = z.strictObject({
  collectionConcurrency: PositiveIntegerSchema.optional(),
  contentFetchConcurrency: PositiveIntegerSchema.optional(),
  scoringConcurrency: PositiveIntegerSchema.optional(),
  classificationConcurrency: PositiveIntegerSchema.optional(),
  structuredExtractionConcurrency: PositiveIntegerSchema.optional(),
  batchSize: z
    .strictObject({
      scoring: PositiveIntegerSchema.optional(),
      classification: PositiveIntegerSchema.optional(),
      structuredExtraction: PositiveIntegerSchema.optional(),
    })
    .optional(),
});

const PipelineFailurePolicySchema = z
  .strictObject({
    failFast: z.boolean().optional(),
    continueOnSourceFailure: z.boolean().optional(),
    continueOnContentFetchFailure: z.boolean().optional(),
    continueOnScoringFailure: z.boolean().optional(),
    minItemsRequiredForSuccess: NonNegativeIntegerSchema.optional(),
  })
  .optional()
  .transform((policy) => ({
    ...DefaultFailurePolicy,
    ...(policy ?? {}),
  }));

const PipelineScheduleConfigSchema = z
  .strictObject({
    enabled: z.boolean().optional(),
    timezone: NonEmptyStringSchema.optional(),
    cron: NonEmptyStringSchema.optional(),
    rrule: NonEmptyStringSchema.optional(),
    metadata: MetadataSchema.optional(),
  })
  .refine((schedule) => schedule.cron || schedule.rrule, {
    message: "Pipeline schedule must include cron or rrule.",
  });

const PipelineConfigFileSchema = z.strictObject({
  pipelineId: NonEmptyStringSchema,
  enabled: z.boolean(),
  description: NonEmptyStringSchema,
  sourceIds: z.array(NonEmptyStringSchema),
  collectionMethods: z.array(PipelineCollectionMethodSchema).min(1),
  contentFetchPolicy: PipelineContentFetchPolicySchema,
  scorerId: NonEmptyStringSchema,
  classifierId: NonEmptyStringSchema.optional(),
  structuredExtractorId: NonEmptyStringSchema.optional(),
  selectorId: NonEmptyStringSchema,
  rendererId: NonEmptyStringSchema,
  output: PipelineOutputConfigSchema,
  limits: LimitsSchema,
  execution: PipelineExecutionConfigSchema.optional(),
  failurePolicy: PipelineFailurePolicySchema,
  schedule: PipelineScheduleConfigSchema.optional(),
  settings: MetadataSchema.optional(),
  metadata: MetadataSchema.optional(),
});

type PipelineConfigFile = z.infer<typeof PipelineConfigFileSchema>;

const PipelineConfigSchema = PipelineConfigFileSchema.transform((config) => ({
  ...config,
  components: buildPipelineComponentConfig(config),
}));

export type ValidatedPipelineConfig = z.infer<typeof PipelineConfigSchema>;

function buildPipelineComponentConfig(config: PipelineConfigFile): PipelineComponentConfig {
  return {
    collectors: config.collectionMethods.map((method) => method.collectorId),
    contentFetcher: config.contentFetchPolicy.fetcherId,
    contentExtractors: config.contentFetchPolicy.extractorIds,
    scorer: config.scorerId,
    classifier: config.classifierId,
    structuredExtractor: config.structuredExtractorId,
    selector: config.selectorId,
    renderer: config.rendererId,
    artifactWriter: config.output.artifactWriterId,
  };
}

function getDefaultPipelineConfigPath(configName: string): string {
  return join(
    process.cwd(),
    PIPELINE_CONFIG_DIRECTORY,
    `${configName}${PIPELINE_CONFIG_EXTENSION}`,
  );
}

function resolvePipelineConfigPath(configPathOrName: string): string {
  if (configPathOrName.endsWith(PIPELINE_CONFIG_EXTENSION)) {
    return configPathOrName;
  }

  const directPath = getDefaultPipelineConfigPath(configPathOrName);
  if (existsSync(directPath)) {
    return directPath;
  }

  return getDefaultPipelineConfigPath(configPathOrName.replaceAll("_", "-"));
}

function parsePipelineConfigJson(rawConfig: string): unknown {
  try {
    return JSON.parse(rawConfig);
  } catch (error) {
    throw new Error(
      `${PIPELINE_CONFIG_ERRORS.INVALID_JSON} ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function loadPipelineConfig(configPathOrName: string): PipelineConfig {
  const parsed = PipelineConfigSchema.safeParse(
    parsePipelineConfigJson(readFileSync(resolvePipelineConfigPath(configPathOrName), "utf8")),
  );
  if (!parsed.success) {
    throw new Error(`${PIPELINE_CONFIG_ERRORS.INVALID_CONFIG} ${parsed.error.message}`);
  }

  return parsed.data;
}
