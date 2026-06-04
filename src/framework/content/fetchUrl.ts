// Purpose: Implements framework URL content fetching and HTML extraction.
// Scope: Stays generic so applications can plug in their own components.

import { HTTP } from "../../constants/runtime.js";
import { URL_TEXT } from "../../constants/url-text.js";
import { fetchPublicHttpWithRetry } from "../network/fetch.js";
import type { PublicHttpFetchOptions } from "../network/fetch.js";
import { buildHttpStatusError, isHttpStatusError, readResponseText } from "../../http/client.js";
import {
  assertSafePublicHttpUrl,
  type HostResolver,
  httpUrlErrorMessage,
  unsafeHttpUrlErrorMessage,
} from "../../http/url.js";
import { extractUrlText } from "../../url-text/extract.js";
import { normalizeUrl } from "../../utils/url.js";
import { CONTENT_FETCH_STATUSES } from "./status.js";
import type { ContentFetchStatus } from "./status.js";

export { CONTENT_FETCH_STATUSES, CONTENT_FETCH_STATUSES as URL_CONTENT_FETCH_STATUSES };
export type UrlContentFetchStatus = ContentFetchStatus;

export type UrlContentFetchError = {
  message: string;
  code: string;
  status?: number;
  statusText?: string;
};

export type UrlContentFetchPolicy = {
  signal?: AbortSignal;
  hostResolver?: HostResolver;
  transport?(
    input: string | URL,
    init?: RequestInit,
    options?: PublicHttpFetchOptions,
  ): Promise<Response>;
  maxRedirects?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
  retries?: number;
  minTimeoutMs?: number;
  maxTimeoutMs?: number;
  jitter?: boolean;
};

export type FetchUrlContentInput = {
  url: string;
  maxChars?: number;
  fetchPolicy?: UrlContentFetchPolicy;
};

export type FetchUrlContentResult = {
  url: string;
  canonicalUrl?: string;
  contentType: string;
  title: string;
  plainText: string;
  contentLength: number;
  fetchStatus: UrlContentFetchStatus;
  error?: UrlContentFetchError;
};

type FetchedUrlResponse = {
  response: Response;
  finalUrl: string;
};

const DEFAULT_MAX_REDIRECTS = 5;
const HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml", "text/plain"] as const;

function emptyResult(
  url: string,
  fetchStatus: UrlContentFetchStatus,
  error?: UrlContentFetchError,
  contentType = "",
): FetchUrlContentResult {
  return {
    url: normalizeUrl(url),
    contentType,
    title: URL_TEXT.EMPTY_TITLE,
    plainText: "",
    contentLength: 0,
    fetchStatus,
    ...(error ? { error } : {}),
  };
}

function assertValidMaxChars(maxChars: number): void {
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > URL_TEXT.MAX_CHARS_LIMIT) {
    throw new Error(URL_TEXT.ERRORS.INVALID_MAX_CHARS);
  }
}

function assertValidMaxResponseBytes(maxResponseBytes: number): void {
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1) {
    throw new Error("maxResponseBytes must be a positive integer.");
  }
}

function resolveCanonicalUrl(
  canonicalUrl: string | undefined,
  baseUrl: string,
): string | undefined {
  if (!canonicalUrl) {
    return undefined;
  }

  try {
    return normalizeUrl(new URL(canonicalUrl, baseUrl).toString());
  } catch {
    return normalizeUrl(canonicalUrl);
  }
}

function responseContentType(response: Response): string {
  return response.headers.get(HTTP.CONTENT_TYPE_HEADER)?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isHtmlContentType(contentType: string): boolean {
  return contentType === "" || HTML_CONTENT_TYPES.some((supported) => contentType === supported);
}

function errorResult(url: string, error: unknown, contentType = ""): FetchUrlContentResult {
  const message = error instanceof Error ? error.message : String(error);

  if (isHttpStatusError(error)) {
    return emptyResult(
      url,
      CONTENT_FETCH_STATUSES.FAILED,
      {
        message,
        code: "http_status",
        status: error.status,
        statusText: error.statusText,
      },
      contentType,
    );
  }

  return emptyResult(
    url,
    CONTENT_FETCH_STATUSES.FAILED,
    {
      message,
      code: "fetch_failed",
    },
    contentType,
  );
}

export async function fetchUrlContent({
  url,
  maxChars = URL_TEXT.DEFAULT_MAX_CHARS,
  fetchPolicy = {},
}: FetchUrlContentInput): Promise<FetchUrlContentResult> {
  if (!URL.canParse(url)) {
    return emptyResult(url, CONTENT_FETCH_STATUSES.FAILED, {
      message: httpUrlErrorMessage(),
      code: "invalid_url",
    });
  }

  try {
    assertValidMaxChars(maxChars);
    if (fetchPolicy.maxResponseBytes !== undefined) {
      assertValidMaxResponseBytes(fetchPolicy.maxResponseBytes);
    }
    await assertSafePublicHttpUrl(url, fetchPolicy.hostResolver);
    const { response, finalUrl } = await fetchUrlResponse(url, fetchPolicy);
    const contentType = responseContentType(response);

    if (!response.ok) {
      return errorResult(
        finalUrl,
        await buildHttpStatusError(URL_TEXT.ERRORS.HTTP_FAILED_PREFIX, response),
        contentType,
      );
    }

    if (!isHtmlContentType(contentType)) {
      return emptyResult(
        finalUrl,
        CONTENT_FETCH_STATUSES.FAILED,
        {
          message: `Unsupported content type: ${contentType || "unknown"}.`,
          code: "unsupported_content_type",
        },
        contentType,
      );
    }

    const {
      canonicalUrl: extractedCanonicalUrl,
      detectedPaywall,
      ...extracted
    } = extractUrlText(await readResponseText(response, fetchPolicy.maxResponseBytes), maxChars);
    const canonicalUrl = resolveCanonicalUrl(extractedCanonicalUrl, finalUrl);

    return {
      ...extracted,
      url: normalizeUrl(finalUrl),
      contentType,
      fetchStatus: detectedPaywall
        ? CONTENT_FETCH_STATUSES.PAYWALLED
        : CONTENT_FETCH_STATUSES.FETCHED,
      ...(canonicalUrl ? { canonicalUrl } : {}),
    };
  } catch (error) {
    return errorResult(url, error);
  }
}

async function fetchUrlResponse(
  url: string,
  fetchPolicy: UrlContentFetchPolicy,
  redirectCount = 0,
): Promise<FetchedUrlResponse> {
  const maxRedirects = fetchPolicy.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  if (redirectCount > maxRedirects) {
    throw new Error(URL_TEXT.ERRORS.TOO_MANY_REDIRECTS);
  }

  const fetchResponse = fetchPolicy.transport ?? fetchPublicHttpWithRetry;
  const response = await fetchResponse(
    url,
    {
      signal: fetchPolicy.signal,
      redirect: "manual",
      headers: {
        accept: "text/html, application/xhtml+xml, text/plain;q=0.9, */*;q=0.8",
        [HTTP.USER_AGENT_HEADER]: HTTP.USER_AGENT,
      },
    },
    {
      timeoutMs: fetchPolicy.timeoutMs,
      retries: fetchPolicy.retries,
      minTimeoutMs: fetchPolicy.minTimeoutMs,
      maxTimeoutMs: fetchPolicy.maxTimeoutMs,
      jitter: fetchPolicy.jitter,
      hostResolver: fetchPolicy.hostResolver,
    },
  );

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) {
      return { response, finalUrl: url };
    }

    const nextUrl = new URL(location, url).toString();
    try {
      await assertSafePublicHttpUrl(nextUrl, fetchPolicy.hostResolver);
    } catch {
      throw new Error(unsafeHttpUrlErrorMessage());
    }

    return fetchUrlResponse(nextUrl, fetchPolicy, redirectCount + 1);
  }

  return { response, finalUrl: url };
}
