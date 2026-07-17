// Purpose: Executes content fetching and extraction stages.
// Scope: Owns fetch limits, content failure handling, and extracted content attachment.

import { mapLimit } from "../concurrency.js";
import type { PipelineRunItem } from "../orchestrator/contracts.js";
import { PipelinePolicyAbortError, toPipelineError } from "../orchestrator/errors.js";
import {
  fetchedContentError,
  fetchedContentStatus,
  incrementCount,
  preferFetchedContentOrder,
} from "../orchestrator/items.js";
import {
  executionLimit,
  fetchLimit,
  shouldContinueAfterContentFetchFailure,
  shouldContinueAfterNonPolicyFailure,
} from "../orchestrator/policy.js";
import type {
  ContentExtractor,
  ContentFetcher,
  PipelineConfig,
  PipelineContext,
  PipelineCounts,
  PipelineError,
} from "../types.js";

export async function fetchAndExtractContent(
  items: PipelineRunItem[],
  config: PipelineConfig,
  fetcher: ContentFetcher | undefined,
  extractors: ContentExtractor[],
  context: PipelineContext,
  counts: PipelineCounts,
  errors: PipelineError[],
): Promise<PipelineRunItem[]> {
  if (!config.contentFetchPolicy.enabled) {
    return items;
  }

  if (!fetcher) {
    errors.push({
      message: "Content fetch policy is enabled but no content fetcher is configured.",
      code: "content_fetcher_missing",
    });

    if (!shouldContinueAfterContentFetchFailure(config)) {
      throw new PipelinePolicyAbortError(
        "Pipeline stopped because content fetching is enabled but no fetcher is configured.",
      );
    }

    return items.map((item) => ({
      ...item,
      metadata: {
        ...item.metadata,
        contentFetchStatus: "not_fetched",
      },
    }));
  }

  const limit = fetchLimit(config, items.length);

  const fetchedItems = await mapLimit(
    items,
    executionLimit(config, "contentFetchConcurrency"),
    async (item, index) => {
      if (index >= limit) {
        return {
          ...item,
          metadata: {
            ...item.metadata,
            contentFetchStatus: "not_fetched",
          },
        };
      }

      let content: unknown;
      try {
        content = await fetcher.fetch(item, context);
      } catch (error) {
        incrementCount(counts, "contentFetchErrors");
        errors.push(
          toPipelineError(error, {
            itemId: item.id,
            code: "content_fetch_failed",
          }),
        );

        if (!shouldContinueAfterContentFetchFailure(config)) {
          throw new PipelinePolicyAbortError(
            `Pipeline stopped after content fetch failure for ${item.id}.`,
          );
        }

        return {
          ...item,
          metadata: {
            ...item.metadata,
            contentFetchStatus: "failed",
          },
        };
      }

      const contentFetchStatus = fetchedContentStatus(content);
      if (contentFetchStatus === "failed") {
        incrementCount(counts, "contentFetchErrors");
        errors.push(
          toPipelineError(fetchedContentError(content), {
            itemId: item.id,
            code: "content_fetch_failed",
          }),
        );

        if (!shouldContinueAfterContentFetchFailure(config)) {
          throw new PipelinePolicyAbortError(
            `Pipeline stopped after content fetch failure for ${item.id}.`,
          );
        }

        return {
          ...item,
          content,
          metadata: {
            ...item.metadata,
            contentFetchStatus,
          },
        };
      }

      incrementCount(counts, "contentFetched");

      const extractedContent = [];
      for (const extractor of extractors) {
        try {
          extractedContent.push(await extractor.extract(content, context));
          incrementCount(counts, "contentExtracted");
        } catch (error) {
          incrementCount(counts, "contentExtractionErrors");
          errors.push(
            toPipelineError(error, {
              itemId: item.id,
              code: "content_extraction_failed",
            }),
          );

          if (!shouldContinueAfterNonPolicyFailure(config)) {
            throw new PipelinePolicyAbortError(
              `Pipeline stopped after content extraction failure for ${item.id}.`,
            );
          }
        }
      }

      return {
        ...item,
        content,
        extractedContent,
        metadata: {
          ...item.metadata,
          contentFetchStatus: contentFetchStatus ?? "fetched",
        },
      };
    },
    { stopOnError: !shouldContinueAfterContentFetchFailure(config) },
  );

  return preferFetchedContentOrder(fetchedItems, config);
}
