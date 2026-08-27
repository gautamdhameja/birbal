import { parseHttpUrl } from "./http-url.js";
import type { EvidenceSource } from "./types.js";

function normalizedHttpUrl(value: string): string | undefined {
  return parseHttpUrl(value)?.href;
}

function isUrlField(key: string): boolean {
  return key === "url" || key.endsWith("_url") || key.endsWith("Url");
}

function collectToolResultUrls(value: unknown, urls: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectToolResultUrls(item, urls);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && isUrlField(key)) {
      const normalized = normalizedHttpUrl(item);
      if (normalized) {
        urls.add(normalized);
      }
      continue;
    }
    collectToolResultUrls(item, urls);
  }
}

export type ResearchProvenanceLedger = {
  recordToolResult(result: unknown): void;
  missingSourceIds(sources: readonly EvidenceSource[]): string[];
};

export function createResearchProvenanceLedger(): ResearchProvenanceLedger {
  const urls = new Set<string>();
  return {
    recordToolResult(result) {
      collectToolResultUrls(result, urls);
    },
    missingSourceIds(sources) {
      return sources
        .filter((source) => {
          const normalized = normalizedHttpUrl(source.url);
          return normalized === undefined || !urls.has(normalized);
        })
        .map((source) => source.id);
    },
  };
}
