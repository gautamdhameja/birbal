import { XMLParser } from "fast-xml-parser";

import { BIRBAL_USER_AGENT } from "../http/headers.js";
import { getArxivConfig } from "./config.js";

type ArxivSearchOptions = {
  query: string;
  maxResults: number;
};

export type ArxivPaper = {
  title: string;
  url: string;
  summary: string;
  authors: string[];
  published: string;
};

type ParsedXmlRecord = Record<string, unknown>;

const parser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  trimValues: true,
});

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function asRecord(value: unknown): ParsedXmlRecord {
  return typeof value === "object" && value !== null ? (value as ParsedXmlRecord) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizePhrase(value: string): string {
  return normalizeWhitespace(value).replace(/["\\]/g, " ");
}

function tokenizeQuery(value: string): string[] {
  return normalizeWhitespace(value)
    .split(" ")
    .map((term) => term.replace(/["\\()]/g, "").trim())
    .filter(Boolean);
}

export function buildArxivSearchQuery(query: string, mode: "phrase" | "all-terms" = "phrase"): string {
  const normalizedQuery = sanitizePhrase(query);

  if (mode === "all-terms") {
    return tokenizeQuery(query)
      .map((term) => `all:${term}`)
      .join(" AND ");
  }

  return normalizedQuery.includes(" ") ? `all:"${normalizedQuery}"` : `all:${normalizedQuery}`;
}

function extractAuthors(entry: ParsedXmlRecord): string[] {
  return asArray(entry.author)
    .map((author) => normalizeWhitespace(asString(asRecord(author).name)))
    .filter(Boolean);
}

function extractUrl(entry: ParsedXmlRecord): string {
  const alternateLink = asArray(entry.link)
    .map(asRecord)
    .find((link) => link.rel === "alternate" && typeof link.href === "string");

  return asString(alternateLink?.href) || asString(entry.id);
}

export function parseArxivAtomFeed(xml: string): ArxivPaper[] {
  const parsed = asRecord(parser.parse(xml));
  const feed = asRecord(parsed.feed);

  return asArray(feed.entry).map((entry) => {
    const record = asRecord(entry);

    return {
      title: normalizeWhitespace(asString(record.title)),
      url: extractUrl(record),
      summary: normalizeWhitespace(asString(record.summary)),
      authors: extractAuthors(record),
      published: asString(record.published),
    };
  });
}

function buildArxivUrl({ query, maxResults }: ArxivSearchOptions, mode: "phrase" | "all-terms"): string {
  const { ARXIV_QUERY_URL } = getArxivConfig();
  const url = new URL(ARXIV_QUERY_URL);

  url.searchParams.set("search_query", buildArxivSearchQuery(query, mode));
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(maxResults));
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");

  return url.toString();
}

async function fetchArxivSearch(options: ArxivSearchOptions, mode: "phrase" | "all-terms"): Promise<ArxivPaper[]> {
  const response = await fetch(buildArxivUrl(options, mode), {
    headers: {
      accept: "application/atom+xml, application/xml, text/xml",
      "user-agent": BIRBAL_USER_AGENT,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "<failed to read response body>");
    throw new Error(`arXiv request failed with HTTP ${response.status} ${response.statusText}: ${body}`);
  }

  return parseArxivAtomFeed(await response.text());
}

export async function searchArxiv(options: ArxivSearchOptions): Promise<ArxivPaper[]> {
  const phraseResults = await fetchArxivSearch(options, "phrase");
  if (phraseResults.length > 0) {
    return phraseResults;
  }

  return fetchArxivSearch(options, "all-terms");
}
