import { URL_TEXT } from "../constants/url-text.js";

export type ExtractedUrlText = {
  title: string;
  plainText: string;
  canonicalUrl?: string;
  detectedPaywall: boolean;
  contentLength: number;
};

function decodeCodePoint(value: number, fallback: string): string {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) {
    return fallback;
  }

  try {
    return String.fromCodePoint(value);
  } catch {
    return fallback;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replace(/&#(\d+);/g, (match, codepoint: string) => decodeCodePoint(Number(codepoint), match))
    .replace(/&#x([\da-f]+);/gi, (match, codepoint: string) =>
      decodeCodePoint(Number.parseInt(codepoint, 16), match),
    );
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripTags(html: string): string {
  let stripped = html.replace(/<!--[\s\S]*?-->/g, " ");

  for (const tagName of URL_TEXT.TAGS_TO_DROP) {
    stripped = stripped.replace(
      new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "gi"),
      " ",
    );
    stripped = stripped.replace(new RegExp(`<${tagName}\\b[^>]*\\/?>`, "gi"), " ");
  }

  for (const tagName of URL_TEXT.BLOCK_TAGS) {
    stripped = stripped.replace(new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi"), "\n");
  }

  return decodeHtmlEntities(stripped.replace(/<[^>]+>/g, " "));
}

function extractAttribute(tag: string, attribute: string): string | undefined {
  const match = tag.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1];
}

function extractTitle(html: string): string {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    return normalizeWhitespace(decodeHtmlEntities(stripTags(titleMatch[1])));
  }

  const ogTitle = html.match(/<meta\b[^>]*(?:property|name)=["']og:title["'][^>]*>/i);
  const content = ogTitle ? extractAttribute(ogTitle[0], "content") : undefined;
  return content ? normalizeWhitespace(decodeHtmlEntities(content)) : URL_TEXT.EMPTY_TITLE;
}

function extractCanonicalUrl(html: string): string | undefined {
  const canonicalLink = html.match(/<link\b[^>]*rel=["'][^"']*\bcanonical\b[^"']*["'][^>]*>/i);
  const canonicalHref = canonicalLink ? extractAttribute(canonicalLink[0], "href") : undefined;
  if (canonicalHref) {
    return decodeHtmlEntities(canonicalHref).trim();
  }

  const ogUrl = html.match(/<meta\b[^>]*(?:property|name)=["']og:url["'][^>]*>/i);
  const content = ogUrl ? extractAttribute(ogUrl[0], "content") : undefined;
  return content ? decodeHtmlEntities(content).trim() : undefined;
}

function detectPaywall(html: string, plainText: string): boolean {
  const haystack = `${html} ${plainText}`.toLowerCase();
  return URL_TEXT.PAYWALL_PATTERNS.some((pattern) => haystack.includes(pattern));
}

export function extractUrlText(html: string, maxChars: number): ExtractedUrlText {
  const plainText = normalizeWhitespace(stripTags(html)).slice(0, maxChars).trim();

  return {
    title: extractTitle(html),
    plainText,
    canonicalUrl: extractCanonicalUrl(html),
    detectedPaywall: detectPaywall(html, plainText),
    contentLength: plainText.length,
  };
}
