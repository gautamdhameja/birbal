import { XMLParser } from "fast-xml-parser";

import { ARXIV } from "../constants/arxiv.js";
import type { ArxivSearchMode } from "../constants/arxiv.js";
import { HTTP } from "../../framework/network/constants.js";
import { fetchWithRetry } from "../../framework/network/fetch.js";
import { buildHttpStatusError, readResponseText } from "../../framework/network/client.js";
import { getArxivConfig } from "./config.js";
import type { ArxivConfig } from "./config.js";
import type {
  ArxivClient,
  ArxivClientDependencies,
  ArxivPaper,
  ArxivSearchOptions,
} from "./types.js";
export type { ArxivClient, ArxivPaper, ArxivSearchOptions } from "./types.js";

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

function buildArxivUrl(
  { query, maxResults }: ArxivSearchOptions,
  mode: ArxivSearchMode,
  { ARXIV_QUERY_URL }: ArxivConfig,
): string {
  const url = new URL(ARXIV_QUERY_URL);

  url.searchParams.set(ARXIV.QUERY_PARAMS.SEARCH_QUERY, buildArxivSearchQuery(query, mode));
  url.searchParams.set(ARXIV.QUERY_PARAMS.START, ARXIV.QUERY_VALUES.START);
  url.searchParams.set(ARXIV.QUERY_PARAMS.MAX_RESULTS, String(maxResults));
  url.searchParams.set(ARXIV.QUERY_PARAMS.SORT_BY, ARXIV.QUERY_VALUES.SORT_BY);
  url.searchParams.set(ARXIV.QUERY_PARAMS.SORT_ORDER, ARXIV.QUERY_VALUES.SORT_ORDER);

  return url.toString();
}

function defaultDelay(ms: number, signal?: AbortSignal): Promise<void> {
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

export function createArxivClient(dependencies: ArxivClientDependencies = {}): ArxivClient {
  const loadConfig = dependencies.loadConfig ?? getArxivConfig;
  const transport = dependencies.transport ?? fetchWithRetry;
  const now = dependencies.now ?? Date.now;
  const delay = dependencies.delay ?? defaultDelay;
  let nextRequestAt = 0;
  let requestQueue = Promise.resolve();

  async function waitForRequestSlot(signal?: AbortSignal): Promise<void> {
    const waitTurn = requestQueue.then(async () => {
      const waitMs = Math.max(0, nextRequestAt - now());
      if (waitMs > 0) {
        await delay(waitMs, signal);
      }

      nextRequestAt = now() + ARXIV.REQUEST_INTERVAL_MS;
    });

    requestQueue = waitTurn.catch(() => undefined);
    await waitTurn;
  }

  async function fetchSearch(
    options: ArxivSearchOptions,
    mode: ArxivSearchMode,
  ): Promise<ArxivPaper[]> {
    const url = buildArxivUrl(options, mode, loadConfig());
    const response = await transport(
      url,
      {
        signal: options.signal,
        headers: {
          accept: HTTP.XML_ACCEPT,
          [HTTP.USER_AGENT_HEADER]: HTTP.USER_AGENT,
        },
      },
      {
        retries: ARXIV.MAX_ATTEMPTS - 1,
        minTimeoutMs: ARXIV.RETRY_DELAY_MS,
        retryStatusCodes: ARXIV.RETRYABLE_STATUSES,
        beforeAttempt: () => waitForRequestSlot(options.signal),
      },
    );

    if (response.ok) {
      return parseArxivAtomFeed(
        await readResponseText(response, undefined, { signal: options.signal }),
      );
    }

    throw await buildHttpStatusError(ARXIV.ERRORS.HTTP_FAILED_PREFIX, response, {
      signal: options.signal,
    });
  }

  return {
    async searchArxiv(options) {
      const phraseResults = await fetchSearch(options, ARXIV.SEARCH_MODES.PHRASE);
      if (phraseResults.length > 0) {
        return phraseResults;
      }

      return fetchSearch(options, ARXIV.SEARCH_MODES.ALL_TERMS);
    },
  };
}
