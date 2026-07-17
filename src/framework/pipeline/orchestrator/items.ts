import { normalizeUrl } from "../../network/normalizeUrl.js";
import type { PipelineConfig, PipelineCounts, PipelineMetadata } from "../types.js";
import type { PipelineRunItem } from "./contracts.js";

export function incrementCount(counts: PipelineCounts, key: string, amount = 1): void {
  counts[key] = (counts[key] ?? 0) + amount;
}

export function fetchedContentStatus(content: unknown): string | undefined {
  if (
    typeof content === "object" &&
    content !== null &&
    "fetchStatus" in content &&
    typeof content.fetchStatus === "string"
  ) {
    return content.fetchStatus;
  }

  return undefined;
}

export function fetchedContentError(content: unknown): unknown {
  if (typeof content === "object" && content !== null && "error" in content) {
    const error = content.error;
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      return new Error(error.message);
    }

    return error;
  }

  return content;
}

function fetchedContentRank(item: PipelineRunItem): number {
  const status =
    typeof item.metadata.contentFetchStatus === "string"
      ? item.metadata.contentFetchStatus
      : fetchedContentStatus(item.content);

  if (status === "fetched" || status === "paywalled") {
    return 0;
  }

  if (status === "failed") {
    return 2;
  }

  return 1;
}

export function preferFetchedContentOrder(
  items: PipelineRunItem[],
  config: PipelineConfig,
): PipelineRunItem[] {
  if (!config.contentFetchPolicy.preferFetchedContent) {
    return items;
  }

  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const rankDifference = fetchedContentRank(left.item) - fetchedContentRank(right.item);
      return rankDifference || left.index - right.index;
    })
    .map(({ item }) => item);
}

function itemId(item: unknown, index: number): string {
  if (typeof item === "object" && item !== null && "id" in item) {
    const value = (item as { id?: unknown }).id;
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return `item:${index + 1}`;
}

export function createRunItem(
  item: unknown,
  index: number,
  metadata: PipelineMetadata = {},
): PipelineRunItem {
  return {
    id: itemId(item, index),
    item,
    metadata,
  };
}

function runItemDedupeKey(item: PipelineRunItem): string {
  if (
    typeof item.item === "object" &&
    item.item !== null &&
    "url" in item.item &&
    typeof item.item.url === "string"
  ) {
    return `url:${normalizeUrl(item.item.url)}`;
  }

  return `id:${item.id}`;
}

export function dedupeRunItems(
  items: PipelineRunItem[],
  counts: PipelineCounts,
): PipelineRunItem[] {
  const seen = new Set<string>();
  const deduped: PipelineRunItem[] = [];

  for (const item of items) {
    const key = runItemDedupeKey(item);
    if (seen.has(key)) {
      incrementCount(counts, "duplicatesRemoved");
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}
