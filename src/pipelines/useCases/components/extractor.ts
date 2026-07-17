// Purpose: Implements structured enterprise use-case extraction.
// Scope: Owns source-evidence preparation and extraction caching.

import {
  contentHash,
  getCachedUseCaseExtraction,
  upsertUseCaseExtractionCache,
} from "../../../db/useCaseModelCache.js";
import type { StructuredExtractor } from "../../../framework/pipeline/types.js";
import { ENTERPRISE_USE_CASE_EXTRACTOR_VERSION, extractEnterpriseUseCases } from "../extractor.js";
import { fetchSourceEvidence } from "../sourceEvidence.js";
import {
  asUseCaseCandidate,
  extractionMaxContentChars,
  extractionSourceEvidenceConfigFromContext,
  sourceEvidenceCacheText,
  useCaseCandidateToCandidateItem,
} from "./support.js";
import { asRunItem, fetchedPlainText } from "../../componentHelpers.js";

export const enterpriseUseCaseExtractor: StructuredExtractor = {
  async extractStructured(item, context) {
    const runItem = asRunItem(item);
    const contentText = fetchedPlainText(runItem);
    if (!contentText.trim()) {
      return [];
    }

    const candidate = useCaseCandidateToCandidateItem(asUseCaseCandidate(item), context);
    const sourceEvidence = await fetchSourceEvidence(
      candidate.url,
      extractionSourceEvidenceConfigFromContext(context, candidate, contentText),
    );
    context.logger.debug(
      {
        event: "pipeline.use_cases.extraction_evidence",
        sourceUrl: candidate.url,
        linkedEvidenceCount: sourceEvidence.linkedEvidence.length,
        linkedEvidenceUrls: sourceEvidence.linkedEvidence.map((document) => document.url),
      },
      "use-case extraction evidence prepared",
    );

    const hashedContent = contentHash(sourceEvidenceCacheText(sourceEvidence));
    const cached = getCachedUseCaseExtraction({
      contentHash: hashedContent,
      extractorVersion: ENTERPRISE_USE_CASE_EXTRACTOR_VERSION,
      sourceUrl: candidate.url,
    });
    if (cached) {
      context.logger.debug(
        {
          event: "pipeline.use_cases.extraction_cache_hit",
          sourceUrl: candidate.url,
          useCaseCount: cached.length,
        },
        "use-case extraction cache hit",
      );
      return cached;
    }

    const useCases = await extractEnterpriseUseCases(candidate, contentText, {
      traceId: context.runId,
      traceLabel: "pipeline.use_cases.enterprise_use_case_extractor",
      completeFn: context.modelClient.complete,
      maxContentChars: extractionMaxContentChars(context),
      sourceEvidence,
    });

    upsertUseCaseExtractionCache({
      contentHash: hashedContent,
      extractorVersion: ENTERPRISE_USE_CASE_EXTRACTOR_VERSION,
      sourceUrl: candidate.url,
      useCases,
    });

    return useCases;
  },
};
