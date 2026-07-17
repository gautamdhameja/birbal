// Purpose: Defines and validates the enterprise use-case pipeline's configuration contract.
// Scope: Keeps app-specific limits and settings out of the generic pipeline framework.

import { z } from "zod";

import { loadPipelineConfig } from "../../framework/pipeline/config.js";
import type { PipelineConfig, PipelineContext } from "../../framework/pipeline/types.js";

export const USE_CASES_PIPELINE_ID = "use_cases";

const OptionalPositiveIntegerSchema = z.number().int().positive().optional();
const OptionalNonNegativeIntegerSchema = z.number().int().nonnegative().optional();

export const UseCasePipelineLimitsSchema = z.strictObject({
  limit: OptionalPositiveIntegerSchema,
  maxCandidates: OptionalPositiveIntegerSchema,
  maxItemAgeDays: OptionalPositiveIntegerSchema,
  maxSearchQueries: OptionalPositiveIntegerSchema,
  maxSearchResultsPerQuery: OptionalPositiveIntegerSchema,
  maxCandidatesForExtraction: OptionalPositiveIntegerSchema,
  maxResults: OptionalPositiveIntegerSchema,
  maxUseCasesPerRun: OptionalPositiveIntegerSchema,
  minConfidenceScore: z.number().min(1).max(5).optional(),
  maxPerCompany: OptionalPositiveIntegerSchema,
  maxPerIndustry: OptionalPositiveIntegerSchema,
  maxPerSource: OptionalPositiveIntegerSchema,
  extractionMaxContentChars: OptionalPositiveIntegerSchema,
  extractionMaxSupportingLinks: OptionalNonNegativeIntegerSchema,
  verificationBatchSize: OptionalPositiveIntegerSchema,
  verificationCandidateMultiplier: z.number().finite().positive().optional(),
  verificationCandidatePoolSize: OptionalPositiveIntegerSchema,
  maxVerificationLinks: OptionalNonNegativeIntegerSchema,
  verificationMaxChars: OptionalPositiveIntegerSchema,
  verificationPromptLinkedMaxChars: OptionalPositiveIntegerSchema,
  verificationPromptSourceMaxChars: OptionalPositiveIntegerSchema,
  minVerificationConfidenceScore: z.number().min(1).max(5).optional(),
});

export const UseCasePipelineSettingsSchema = z.strictObject({
  searchRetry: z
    .strictObject({
      enabled: z.boolean().optional(),
      maxAttempts: z.number().int().positive().optional(),
    })
    .optional(),
  dedupe: z
    .strictObject({
      allowPreviouslyPublished: z.boolean().optional(),
      previouslyPublishedLookback: z.number().int().positive().optional(),
    })
    .optional(),
  verification: z
    .strictObject({
      enabled: z.boolean().optional(),
    })
    .optional(),
});

export type UseCasePipelineLimits = z.infer<typeof UseCasePipelineLimitsSchema>;
export type UseCasePipelineSettings = z.infer<typeof UseCasePipelineSettingsSchema>;
export type UseCasePipelineConfig = PipelineConfig<UseCasePipelineSettings, UseCasePipelineLimits>;

export function parseUseCasePipelineConfig(config: PipelineConfig): UseCasePipelineConfig {
  if (config.pipelineId !== USE_CASES_PIPELINE_ID) {
    throw new Error(
      `Expected ${USE_CASES_PIPELINE_ID} pipeline config, received ${config.pipelineId}.`,
    );
  }

  const limits = UseCasePipelineLimitsSchema.parse(config.limits);
  const settings = UseCasePipelineSettingsSchema.optional().parse(config.settings);

  return {
    ...config,
    limits,
    ...(settings ? { settings } : {}),
  };
}

export function loadUseCasePipelineConfig(configPathOrId: string): UseCasePipelineConfig {
  return parseUseCasePipelineConfig(loadPipelineConfig(configPathOrId));
}

export function useCasePipelineConfigFromContext(context: PipelineContext): UseCasePipelineConfig {
  return parseUseCasePipelineConfig(context.config);
}
