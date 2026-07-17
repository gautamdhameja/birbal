import { collectDailyCandidateResult } from "../../../daily/pipeline.js";
import type {
  PipelineCollectionMethod,
  SourceCollector,
} from "../../../../framework/pipeline/types.js";
import {
  collectionSourceIds,
  preferencesFromContext,
  scopedSourceRegistry,
  sourceRegistryFromContext,
} from "../../componentHelpers.js";

export const sourceDomainCollector: SourceCollector = {
  async collect(method, context) {
    const collectionMethod = method as PipelineCollectionMethod;
    if (context.pipelineId !== "daily") {
      throw new Error("source_domain_collector is only implemented for the daily pipeline.");
    }

    const preferences = preferencesFromContext(context);
    const result = await collectDailyCandidateResult(
      scopedSourceRegistry(
        sourceRegistryFromContext(context),
        collectionSourceIds(collectionMethod, context),
      ),
      {
        dailyMix: preferences.dailyMix,
        enableAcademicFallback: preferences.enableAcademicFallback,
      },
    );

    context.logger.info(
      {
        event: "pipeline.daily.sources_used",
        sourcesUsed: result.sourcesUsed,
        sourceErrors: result.errors.length,
      },
      "daily sources selected",
    );

    return {
      items: result.candidates,
      errors: result.errors.map((error) => ({
        message: error.error,
        sourceId: error.source,
        code: "source_collection_failed",
        metadata: {
          source: error.source,
          topic: error.topic,
          status: error.status,
        },
      })),
    };
  },
};
