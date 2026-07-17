import { mapBatches, mapLimit } from "../concurrency.js";
import type { PipelineRunItem } from "../orchestrator/contracts.js";
import { PipelinePolicyAbortError, toPipelineError } from "../orchestrator/errors.js";
import { incrementCount } from "../orchestrator/items.js";
import {
  assertBatchResultLength,
  batchSize,
  executionLimit,
  shouldContinueAfterNonPolicyFailure,
  shouldContinueAfterScoringFailure,
  shouldContinueAfterStructuredExtractionFailure,
} from "../orchestrator/policy.js";
import { runTimedStage } from "../orchestrator/telemetry.js";
import type {
  Classifier,
  PipelineContext,
  PipelineCounts,
  PipelineError,
  Scorer,
  StructuredExtractor,
} from "../types.js";

export async function scoreItems(
  items: PipelineRunItem[],
  scorer: Scorer,
  context: PipelineContext,
  counts: PipelineCounts,
  errors: PipelineError[],
): Promise<PipelineRunItem[]> {
  async function scoreOne(item: PipelineRunItem): Promise<PipelineRunItem | undefined> {
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

      if (!shouldContinueAfterScoringFailure(context.config)) {
        throw new PipelinePolicyAbortError(
          `Pipeline stopped after scoring failure for ${item.id}.`,
        );
      }

      return undefined;
    }
  }

  if (!scorer.scoreBatch || batchSize(context.config, "scoring") <= 1) {
    const scoredItems = await mapLimit(
      items,
      executionLimit(context.config, "scoringConcurrency"),
      scoreOne,
      { stopOnError: !shouldContinueAfterScoringFailure(context.config) },
    );

    return scoredItems.filter((item): item is PipelineRunItem => item !== undefined);
  }

  const scoredItems = await mapBatches(
    items,
    batchSize(context.config, "scoring"),
    executionLimit(context.config, "scoringConcurrency"),
    async (batch): Promise<Array<PipelineRunItem | undefined>> => {
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

        if (!shouldContinueAfterScoringFailure(context.config)) {
          throw new PipelinePolicyAbortError("Pipeline stopped after batch scoring failure.");
        }

        return batch.map(() => undefined);
      }
    },
    { stopOnError: !shouldContinueAfterScoringFailure(context.config) },
  );

  return scoredItems.filter((item): item is PipelineRunItem => item !== undefined);
}

export async function classifyAndExtractStructured(
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

        if (!shouldContinueAfterNonPolicyFailure(context.config)) {
          throw new PipelinePolicyAbortError(
            `Pipeline stopped after classification failure for ${item.id}.`,
          );
        }

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
            { stopOnError: !shouldContinueAfterNonPolicyFailure(context.config) },
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

                if (!shouldContinueAfterNonPolicyFailure(context.config)) {
                  throw new PipelinePolicyAbortError(
                    "Pipeline stopped after batch classification failure.",
                  );
                }

                return batch;
              }
            },
            { stopOnError: !shouldContinueAfterNonPolicyFailure(context.config) },
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

        if (!shouldContinueAfterStructuredExtractionFailure(context.config)) {
          throw new PipelinePolicyAbortError(
            `Pipeline stopped after structured extraction failure for ${item.id}.`,
          );
        }

        return item;
      }
    }

    if (
      !activeStructuredExtractor.extractStructuredBatch ||
      batchSize(context.config, "structuredExtraction") <= 1
    ) {
      const continueAfterStructuredExtractionFailure =
        shouldContinueAfterStructuredExtractionFailure(context.config);
      output = await runTimedStage(
        context,
        "structured_extraction",
        output.length,
        () =>
          mapLimit(
            output,
            executionLimit(context.config, "structuredExtractionConcurrency"),
            extractOne,
            { stopOnError: !continueAfterStructuredExtractionFailure },
          ),
        {
          concurrency: executionLimit(context.config, "structuredExtractionConcurrency"),
        },
      );
    } else {
      const continueAfterStructuredExtractionFailure =
        shouldContinueAfterStructuredExtractionFailure(context.config);
      output = await runTimedStage(
        context,
        "structured_extraction",
        output.length,
        async () => {
          const extractBatch = async (batch: PipelineRunItem[]): Promise<PipelineRunItem[]> => {
            try {
              const structuredData = await activeStructuredExtractor.extractStructuredBatch?.(
                batch,
                context,
              );
              assertBatchResultLength(structuredData ?? [], batch.length, "extractStructuredBatch");
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

              if (!shouldContinueAfterStructuredExtractionFailure(context.config)) {
                throw new PipelinePolicyAbortError(
                  "Pipeline stopped after batch structured extraction failure.",
                );
              }

              return batch;
            }
          };

          return mapBatches(
            output,
            batchSize(context.config, "structuredExtraction"),
            executionLimit(context.config, "structuredExtractionConcurrency"),
            extractBatch,
            { stopOnError: !continueAfterStructuredExtractionFailure },
          );
        },
        {
          concurrency: executionLimit(context.config, "structuredExtractionConcurrency"),
          batchSize: batchSize(context.config, "structuredExtraction"),
        },
      );
    }
  }

  return output;
}
