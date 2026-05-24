import { URL_TEXT } from "../constants/url-text.js";
import { HTTP } from "../constants/runtime.js";
import { fetchWithRetry } from "../framework/network/fetch.js";
import { buildHttpStatusError, readResponseText } from "../http/client.js";
import {
  assertSafePublicHttpUrl,
  type HostResolver,
  httpUrlErrorMessage,
  unsafeHttpUrlErrorMessage,
} from "../http/url.js";
import { normalizeUrl } from "../utils/url.js";
import { extractUrlText } from "./extract.js";
import type { ExtractedUrlText } from "./extract.js";

export type FetchUrlTextOptions = {
  url: string;
  maxChars?: number;
  signal?: AbortSignal;
  hostResolver?: HostResolver;
};

export type FetchUrlTextResult = ExtractedUrlText & {
  url: string;
};

type FetchedSafeUrl = {
  response: Response;
  finalUrl: string;
};

const MAX_REDIRECTS = 5;

function assertValidMaxChars(maxChars: number): void {
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > URL_TEXT.MAX_CHARS_LIMIT) {
    throw new Error(URL_TEXT.ERRORS.INVALID_MAX_CHARS);
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

export async function fetchUrlText({
  url,
  maxChars = URL_TEXT.DEFAULT_MAX_CHARS,
  signal,
  hostResolver,
}: FetchUrlTextOptions): Promise<FetchUrlTextResult> {
  if (!URL.canParse(url)) {
    throw new Error(httpUrlErrorMessage());
  }
  await assertSafePublicHttpUrl(url, hostResolver);
  assertValidMaxChars(maxChars);
  const { response, finalUrl } = await fetchSafeUrl(url, signal, hostResolver);

  if (!response.ok) {
    throw await buildHttpStatusError(URL_TEXT.ERRORS.HTTP_FAILED_PREFIX, response);
  }

  const { canonicalUrl: extractedCanonicalUrl, ...extracted } = extractUrlText(
    await readResponseText(response),
    maxChars,
  );
  const canonicalUrl = resolveCanonicalUrl(extractedCanonicalUrl, finalUrl);

  return {
    ...extracted,
    url: normalizeUrl(finalUrl),
    ...(canonicalUrl ? { canonicalUrl } : {}),
  };
}

async function fetchSafeUrl(
  url: string,
  signal?: AbortSignal,
  hostResolver?: HostResolver,
  redirectCount = 0,
): Promise<FetchedSafeUrl> {
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error(URL_TEXT.ERRORS.TOO_MANY_REDIRECTS);
  }

  const response = await fetchWithRetry(url, {
    signal,
    redirect: "manual",
    headers: {
      accept: "text/html, text/plain;q=0.9, */*;q=0.8",
      [HTTP.USER_AGENT_HEADER]: HTTP.USER_AGENT,
    },
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) {
      return { response, finalUrl: url };
    }

    const nextUrl = new URL(location, url).toString();
    try {
      await assertSafePublicHttpUrl(nextUrl, hostResolver);
    } catch {
      throw new Error(unsafeHttpUrlErrorMessage());
    }

    return fetchSafeUrl(nextUrl, signal, hostResolver, redirectCount + 1);
  }

  return { response, finalUrl: url };
}
