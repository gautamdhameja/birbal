// Purpose: Fetches source-page and same-site linked evidence for enterprise use-case extraction.
// Scope: Uses structural page links only; model judgment decides whether the evidence is useful.

import { load } from "cheerio";

import { HTTP } from "../../constants/runtime.js";
import { URL_TEXT } from "../../constants/url-text.js";
import { fetchPublicHttpWithRetry } from "../../../framework/network/fetch.js";
import type { PublicHttpFetchOptions } from "../../../framework/network/fetch.js";
import { buildHttpStatusError, readResponseText } from "../../http/client.js";
import {
  assertSafePublicHttpUrl,
  type HostResolver,
  unsafeHttpUrlErrorMessage,
} from "../../http/url.js";
import { extractUrlText } from "../../url-text/extract.js";
import { normalizeUrl } from "../../utils/url.js";

export type SourceEvidenceDocument = {
  url: string;
  title: string;
  plainText: string;
};

export type SourceEvidence = {
  source: SourceEvidenceDocument;
  linkedEvidence: SourceEvidenceDocument[];
};

export type SourceEvidenceFetchPolicy = {
  hostResolver?: HostResolver;
  transport?(
    input: string | URL,
    init?: RequestInit,
    options?: PublicHttpFetchOptions,
  ): Promise<Response>;
  timeoutMs?: number;
  retries?: number;
  minTimeoutMs?: number;
  maxTimeoutMs?: number;
  jitter?: boolean;
  maxResponseBytes?: number;
};

export type FetchSourceEvidenceOptions = {
  maxLinks?: number;
  maxChars?: number;
  fallbackSourceText?: string;
  fallbackSourceTitle?: string;
  fetchPolicy?: SourceEvidenceFetchPolicy;
};

type FetchedSourcePage = SourceEvidenceDocument & {
  html: string;
  links: string[];
};

const DEFAULT_MAX_LINKS = 2;
const DEFAULT_MAX_CHARS = 8_000;
const HTML_CONTENT_TYPES = ["", "text/html", "application/xhtml+xml", "text/plain"] as const;
const MAX_REDIRECTS = 5;

function contentType(response: Response): string {
  return response.headers.get(HTTP.CONTENT_TYPE_HEADER)?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isSupportedContentType(value: string): boolean {
  return HTML_CONTENT_TYPES.some((supported) => supported === value);
}

function contentAnchors(html: string) {
  const $ = load(html);
  const scopedAnchors = $("main a[href], article a[href], [role='main'] a[href]");

  return {
    $,
    anchors: scopedAnchors.length > 0 ? scopedAnchors : $("a[href]"),
  };
}

export function extractSourceEvidenceLinks(
  html: string,
  baseUrl: string,
  maxLinks = DEFAULT_MAX_LINKS,
): string[] {
  if (maxLinks <= 0) {
    return [];
  }

  const { $, anchors } = contentAnchors(html);
  const sourceHost = new URL(baseUrl).hostname;
  const seen = new Set<string>();
  const links: string[] = [];

  anchors.each((_, element) => {
    if (links.length >= maxLinks) {
      return false;
    }

    const anchor = $(element);
    if (
      anchor.closest("nav, header, footer, aside, form, dialog, [aria-hidden='true']").length > 0
    ) {
      return;
    }

    const rawHref = anchor.attr("href")?.trim();
    if (!rawHref || rawHref.startsWith("#")) {
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawHref, baseUrl);
    } catch {
      return;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return;
    }

    if (parsed.hostname !== sourceHost) {
      return;
    }

    parsed.hash = "";
    const normalized = normalizeUrl(parsed.toString());
    if (normalized === normalizeUrl(baseUrl) || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    links.push(normalized);
  });

  return links;
}

async function fetchSourceResponse(
  url: string,
  options: FetchSourceEvidenceOptions,
  redirectCount = 0,
): Promise<{ response: Response; finalUrl: string }> {
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error(URL_TEXT.ERRORS.TOO_MANY_REDIRECTS);
  }

  await assertSafePublicHttpUrl(url, options.fetchPolicy?.hostResolver);
  const transport = options.fetchPolicy?.transport ?? fetchPublicHttpWithRetry;
  const response = await transport(
    url,
    {
      redirect: "manual",
      headers: {
        accept: "text/html, application/xhtml+xml, text/plain;q=0.9, */*;q=0.8",
        [HTTP.USER_AGENT_HEADER]: HTTP.USER_AGENT,
      },
    },
    {
      timeoutMs: options.fetchPolicy?.timeoutMs,
      retries: options.fetchPolicy?.retries,
      minTimeoutMs: options.fetchPolicy?.minTimeoutMs,
      maxTimeoutMs: options.fetchPolicy?.maxTimeoutMs,
      jitter: options.fetchPolicy?.jitter,
      hostResolver: options.fetchPolicy?.hostResolver,
    },
  );

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) {
      return { response, finalUrl: url };
    }

    const nextUrl = new URL(location, url).toString();
    try {
      await assertSafePublicHttpUrl(nextUrl, options.fetchPolicy?.hostResolver);
    } catch {
      throw new Error(unsafeHttpUrlErrorMessage());
    }

    return fetchSourceResponse(nextUrl, options, redirectCount + 1);
  }

  return { response, finalUrl: url };
}

async function fetchSourcePage(
  url: string,
  options: FetchSourceEvidenceOptions,
): Promise<FetchedSourcePage> {
  const { response, finalUrl } = await fetchSourceResponse(url, options);
  const type = contentType(response);
  if (!response.ok) {
    throw await buildHttpStatusError("Source evidence fetch failed with HTTP", response);
  }

  if (!isSupportedContentType(type)) {
    throw new Error(`Unsupported source evidence content type: ${type || "unknown"}.`);
  }

  const html = await readResponseText(response, options.fetchPolicy?.maxResponseBytes);
  const extracted = extractUrlText(html, options.maxChars ?? DEFAULT_MAX_CHARS);

  return {
    url: normalizeUrl(finalUrl),
    title: extracted.title,
    plainText: extracted.plainText,
    html,
    links: extractSourceEvidenceLinks(html, finalUrl, options.maxLinks ?? DEFAULT_MAX_LINKS),
  };
}

function fallbackEvidence(url: string, options: FetchSourceEvidenceOptions): SourceEvidence {
  return {
    source: {
      url: normalizeUrl(url),
      title: options.fallbackSourceTitle ?? "",
      plainText: options.fallbackSourceText ?? "",
    },
    linkedEvidence: [],
  };
}

export async function fetchSourceEvidence(
  url: string,
  options: FetchSourceEvidenceOptions = {},
): Promise<SourceEvidence> {
  const maxLinks = options.maxLinks ?? DEFAULT_MAX_LINKS;
  if (options.fallbackSourceText && maxLinks === 0) {
    return fallbackEvidence(url, options);
  }

  let sourcePage: FetchedSourcePage;
  try {
    sourcePage = await fetchSourcePage(url, options);
  } catch (error) {
    if (!options.fallbackSourceText) {
      throw error;
    }

    return fallbackEvidence(url, options);
  }

  const linkedEvidence: SourceEvidenceDocument[] = [];
  for (const link of sourcePage.links) {
    try {
      const linkedPage = await fetchSourcePage(link, {
        ...options,
        maxLinks: 0,
      });
      linkedEvidence.push({
        url: linkedPage.url,
        title: linkedPage.title,
        plainText: linkedPage.plainText,
      });
    } catch {
      // Linked pages are supporting evidence only. Ignore failed links.
    }
  }

  return {
    source: {
      url: sourcePage.url,
      title: sourcePage.title,
      plainText: sourcePage.plainText || options.fallbackSourceText || "",
    },
    linkedEvidence,
  };
}
