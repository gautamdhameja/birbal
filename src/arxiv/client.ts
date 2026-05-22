import { XMLParser } from "fast-xml-parser";

import { ARXIV } from "../constants/arxiv.js";
import type { ArxivSearchMode } from "../constants/arxiv.js";
import { HTTP } from "../constants/runtime.js";
import { buildHttpStatusError, fetchWithTimeout, readResponseText } from "../http/client.js";
import { getArxivConfig } from "./config.js";

type ArxivSearchOptions = {
  query: string;
  maxResults: number;
  signal?: AbortSignal;
};

export type ArxivPaper = {
  title: string;
  url: string;
  summary: string;
  authors: string[];
  published: string;
};

type ParsedXmlRecord = Record<string, unknown>;
const RETRYABLE_ARXIV_STATUSES = new Set<number>(ARXIV.RETRYABLE_STATUSES);

let nextArxivRequestAt = 0;
let arxivRequestQueue = Promise.resolve();

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

export function buildArxivSearchQuery(
  query: string,
  mode: ArxivSearchMode = ARXIV.SEARCH_MODES.PHRASE,
): string {
  const normalizedQuery = sanitizePhrase(query);

  if (mode === ARXIV.SEARCH_MODES.ALL_TERMS) {
    return tokenizeQuery(query)
      .map((term) => `${ARXIV.QUERY_PREFIX}:${term}`)
      .join(ARXIV.QUERY_OPERATOR);
  }

  return normalizedQuery.includes(" ")
    ? `${ARXIV.QUERY_PREFIX}:"${normalizedQuery}"`
    : `${ARXIV.QUERY_PREFIX}:${normalizedQuery}`;
}

function extractAuthors(entry: ParsedXmlRecord): string[] {
  return asArray(entry.author)
    .map((author) => normalizeWhitespace(asString(asRecord(author).name)))
    .filter(Boolean);
}

function extractUrl(entry: ParsedXmlRecord): string {
  const alternateLink = asArray(entry.link)
    .map(asRecord)
    .find((link) => link.rel === ARXIV.LINK_REL.ALTERNATE && typeof link.href === "string");

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

function buildArxivUrl({ query, maxResults }: ArxivSearchOptions, mode: ArxivSearchMode): string {
  const { ARXIV_QUERY_URL } = getArxivConfig();
  const url = new URL(ARXIV_QUERY_URL);

  url.searchParams.set(ARXIV.QUERY_PARAMS.SEARCH_QUERY, buildArxivSearchQuery(query, mode));
  url.searchParams.set(ARXIV.QUERY_PARAMS.START, ARXIV.QUERY_VALUES.START);
  url.searchParams.set(ARXIV.QUERY_PARAMS.MAX_RESULTS, String(maxResults));
  url.searchParams.set(ARXIV.QUERY_PARAMS.SORT_BY, ARXIV.QUERY_VALUES.SORT_BY);
  url.searchParams.set(ARXIV.QUERY_PARAMS.SORT_ORDER, ARXIV.QUERY_VALUES.SORT_ORDER);

  return url.toString();
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const complete = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", complete);
      resolve();
    };
    const timeout = setTimeout(complete, ms);

    signal?.addEventListener("abort", complete, { once: true });
    if (signal?.aborted) {
      complete();
    }
  });
}

async function waitForArxivRequestSlot(signal?: AbortSignal): Promise<void> {
  const waitTurn = arxivRequestQueue.then(async () => {
    const waitMs = Math.max(0, nextArxivRequestAt - Date.now());
    if (waitMs > 0) {
      await delay(waitMs, signal);
    }

    nextArxivRequestAt = Date.now() + ARXIV.REQUEST_INTERVAL_MS;
  });

  arxivRequestQueue = waitTurn.catch(() => undefined);
  await waitTurn;
}

async function fetchArxivSearch(
  options: ArxivSearchOptions,
  mode: ArxivSearchMode,
): Promise<ArxivPaper[]> {
  const url = buildArxivUrl(options, mode);

  for (let attempt = 1; attempt <= ARXIV.MAX_ATTEMPTS; attempt += 1) {
    await waitForArxivRequestSlot(options.signal);

    const response = await fetchWithTimeout(url, {
      signal: options.signal,
      headers: {
        accept: HTTP.XML_ACCEPT,
        [HTTP.USER_AGENT_HEADER]: HTTP.USER_AGENT,
      },
    });

    if (response.ok) {
      return parseArxivAtomFeed(await readResponseText(response));
    }

    const shouldRetry =
      RETRYABLE_ARXIV_STATUSES.has(response.status) && attempt < ARXIV.MAX_ATTEMPTS;
    if (!shouldRetry) {
      throw await buildHttpStatusError(ARXIV.ERRORS.HTTP_FAILED_PREFIX, response);
    }

    await delay(ARXIV.RETRY_DELAY_MS * attempt, options.signal);
  }

  throw new Error(ARXIV.ERRORS.EXHAUSTED_RETRIES);
}

export async function searchArxiv(options: ArxivSearchOptions): Promise<ArxivPaper[]> {
  const phraseResults = await fetchArxivSearch(options, ARXIV.SEARCH_MODES.PHRASE);
  if (phraseResults.length > 0) {
    return phraseResults;
  }

  return fetchArxivSearch(options, ARXIV.SEARCH_MODES.ALL_TERMS);
}
