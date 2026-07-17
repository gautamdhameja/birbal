// Purpose: Implements daily digest classification.
// Scope: Owns model classification and deterministic fallback behavior.

import {
  classifyCandidateCategory,
  fallbackCategoryFromScore,
} from "../../../daily/classification.js";
import type { PipelineContext, Classifier } from "../../../../framework/pipeline/types.js";
import { asRunItem, candidateWithFetchedContent } from "../../componentHelpers.js";
import { selectedRunItemScore } from "./support.js";

export const enterpriseDigestClassifier: Classifier = {
  async classify(item: unknown, context: PipelineContext) {
    const runItem = asRunItem(item);
    const candidate = candidateWithFetchedContent(runItem);
    const score = selectedRunItemScore(runItem);

    try {
      return await classifyCandidateCategory(candidate, score, {
        traceId: context.runId,
        traceLabel: "pipeline.daily.enterprise_digest_classifier",
        completeFn: context.modelClient.complete,
      });
    } catch {
      return fallbackCategoryFromScore(score);
    }
  },
};
