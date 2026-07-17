import { URL_TEXT } from "../../framework/content/constants.js";
import { CONTENT_FETCH_STATUSES } from "../../framework/content/status.js";
import { fetchUrlContent } from "../../framework/content/fetchUrl.js";
import type { UrlContentFetchPolicy } from "../../framework/content/fetchUrl.js";
import type { HostResolver } from "../../framework/network/url.js";
import type { ExtractedUrlText } from "../../framework/content/extractText.js";

export type FetchUrlTextOptions = {
  url: string;
  maxChars?: number;
  signal?: AbortSignal;
  hostResolver?: HostResolver;
  transport?: UrlContentFetchPolicy["transport"];
};

export type FetchUrlTextResult = ExtractedUrlText & {
  url: string;
};

export async function fetchUrlText({
  url,
  maxChars = URL_TEXT.DEFAULT_MAX_CHARS,
  signal,
  hostResolver,
  transport,
}: FetchUrlTextOptions): Promise<FetchUrlTextResult> {
  const result = await fetchUrlContent({
    url,
    maxChars,
    fetchPolicy: {
      signal,
      hostResolver,
      transport,
    },
  });

  if (result.fetchStatus === CONTENT_FETCH_STATUSES.FAILED) {
    throw new Error(result.error?.message ?? URL_TEXT.ERRORS.HTTP_FAILED_PREFIX);
  }

  return {
    url: result.url,
    title: result.title,
    plainText: result.plainText,
    ...(result.canonicalUrl ? { canonicalUrl: result.canonicalUrl } : {}),
    detectedPaywall: result.fetchStatus === CONTENT_FETCH_STATUSES.PAYWALLED,
    contentLength: result.contentLength,
  };
}
