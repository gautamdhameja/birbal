import { load } from "cheerio";

import { URL_TEXT } from "./constants.js";

export type ExtractedUrlText = {
  title: string;
  plainText: string;
  canonicalUrl?: string;
  detectedPaywall: boolean;
  contentLength: number;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function dropNoisyElements($: ReturnType<typeof load>): void {
  for (const tagName of URL_TEXT.TAGS_TO_DROP) {
    $(tagName).remove();
  }
}

function addBlockSpacing($: ReturnType<typeof load>): void {
  for (const tagName of URL_TEXT.BLOCK_TAGS) {
    $(tagName).append("\n");
  }
}

function extractTitle($: ReturnType<typeof load>): string {
  return (
    normalizeWhitespace($("title").first().text()) ||
    normalizeWhitespace(
      $('meta[property="og:title"], meta[name="og:title"]').attr("content") ?? "",
    ) ||
    URL_TEXT.EMPTY_TITLE
  );
}

function extractCanonicalUrl($: ReturnType<typeof load>): string | undefined {
  const canonicalHref = $('link[rel~="canonical"]').attr("href")?.trim();
  return canonicalHref || $('meta[property="og:url"], meta[name="og:url"]').attr("content")?.trim();
}

function detectPaywall(html: string, plainText: string): boolean {
  const haystack = `${html} ${plainText}`.toLowerCase();
  return URL_TEXT.PAYWALL_PATTERNS.some((pattern) => haystack.includes(pattern));
}

export function extractUrlText(html: string, maxChars: number): ExtractedUrlText {
  const $ = load(html);
  const title = extractTitle($);
  const canonicalUrl = extractCanonicalUrl($);

  dropNoisyElements($);
  addBlockSpacing($);
  const plainText = normalizeWhitespace($("body").text() || $.root().text())
    .slice(0, maxChars)
    .trim();

  return {
    title,
    plainText,
    canonicalUrl,
    detectedPaywall: detectPaywall(html, plainText),
    contentLength: plainText.length,
  };
}
