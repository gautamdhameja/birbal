// Purpose: Shares Birbal pipeline component adapter helpers.
// Scope: Keeps app-specific framework glue out of individual component modules.

import { loadSourceRegistry } from "../config/sourceRegistry.js";
import type { SourceRegistry } from "../config/sourceRegistry.js";
import { CONTENT_FETCH_STATUSES } from "../constants/candidates.js";
import { getItemByUrl, upsertItem } from "../db/items.js";
import type { CandidateItem } from "../daily/types.js";
import { fetchUrlContent } from "../framework/content/fetchUrl.js";
import type { FetchUrlContentResult } from "../framework/content/fetchUrl.js";
import { formatPipelineRunDate } from "../framework/pipeline/artifactWriter.js";
import type { PipelineRunItem } from "../framework/pipeline/orchestrator.js";
import type {
  ContentFetcher,
  PipelineCollectionMethod,
  PipelineContext,
} from "../framework/pipeline/types.js";
import { loadPreferences } from "../memory/preferences.js";
import type { UserPreferences } from "../memory/types.js";

export function asRunItem(value: unknown): PipelineRunItem {
  return value as PipelineRunItem;
}

export function fetchedPlainText(item: PipelineRunItem): string {
  if (
    typeof item.content === "object" &&
    item.content !== null &&
    "plainText" in item.content &&
    typeof item.content.plainText === "string"
  ) {
    return item.content.plainText;
  }

  return "";
}

export function preferencesFromContext(context: PipelineContext): UserPreferences {
  return (context.researchProfile as UserPreferences | null) ?? loadPreferences();
}

export function sourceRegistryFromContext(context: PipelineContext): SourceRegistry {
  return (context.sourceRegistry as SourceRegistry | null) ?? loadSourceRegistry();
}

export function scopedSourceRegistry(
  sourceRegistry: SourceRegistry,
  sourceIds: readonly string[],
): SourceRegistry {
  if (sourceIds.length === 0) {
    return sourceRegistry;
  }

  const allowedSourceIds = new Set(sourceIds);
  return {
    sources: sourceRegistry.sources.filter((source) => allowedSourceIds.has(source.id)),
  };
}

export function collectionSourceIds(
  method: PipelineCollectionMethod,
  context: PipelineContext,
): string[] {
  return method.sourceIds ?? context.config.sourceIds;
}

export function outputLimit(context: PipelineContext): number | undefined {
  const limit = context.config.limits.limit ?? context.config.limits.maxResults;
  return typeof limit === "number" && Number.isInteger(limit) && limit > 0 ? limit : undefined;
}

export function runDateString(context: PipelineContext): string {
  return formatPipelineRunDate(context);
}

function isCandidateItem(value: unknown): value is CandidateItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "sourceId" in value &&
    "sourceName" in value &&
    "sourceType" in value &&
    "url" in value &&
    "contentFetchStatus" in value
  );
}

function fetchedTextFromCandidate(candidate: CandidateItem): FetchUrlContentResult | null {
  if (
    !candidate.contentText ||
    (candidate.contentFetchStatus !== CONTENT_FETCH_STATUSES.FETCHED &&
      candidate.contentFetchStatus !== CONTENT_FETCH_STATUSES.PAYWALLED)
  ) {
    return null;
  }

  return {
    url: candidate.url,
    contentType: "",
    title: candidate.title,
    plainText: candidate.contentText,
    contentLength: candidate.contentText.length,
    fetchStatus: candidate.contentFetchStatus,
  };
}

export function candidateWithFetchedContent(runItem: PipelineRunItem): CandidateItem {
  const candidate = runItem.item as CandidateItem;
  if (
    typeof runItem.content === "object" &&
    runItem.content !== null &&
    "plainText" in runItem.content
  ) {
    const fetched = runItem.content as FetchUrlContentResult;
    return {
      ...candidate,
      title: candidate.title || fetched.title,
      summary: candidate.summary || fetched.plainText,
      contentText: fetched.plainText,
      contentFetchStatus: fetched.fetchStatus,
      raw: {
        item: candidate.raw,
        fetchedText: fetched,
      },
    };
  }

  return candidate;
}

export const urlTextFetcher: ContentFetcher = {
  async fetch(item, context) {
    const runItem = asRunItem(item);
    const candidate = runItem.item as { url: string };
    const persistedCandidate = getItemByUrl(candidate.url);
    const cached = persistedCandidate ? fetchedTextFromCandidate(persistedCandidate) : null;
    if (cached) {
      return cached;
    }

    const fetched = await fetchUrlContent({
      url: candidate.url,
      maxChars: context.config.contentFetchPolicy.maxChars,
    });
    if (isCandidateItem(runItem.item) && fetched.fetchStatus !== CONTENT_FETCH_STATUSES.FAILED) {
      upsertItem({
        ...runItem.item,
        title: runItem.item.title || fetched.title,
        summary: runItem.item.summary || fetched.plainText,
        contentText: fetched.plainText,
        contentFetchStatus: fetched.fetchStatus,
      });
    }

    return fetched;
  },
};
