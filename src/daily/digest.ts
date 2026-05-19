import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DIGEST } from "../constants/digest.js";
import { TIME } from "../constants/time.js";
import type { ScoredCandidateItem } from "./types.js";

type DigestDate = Date | string;

function pad(value: number): string {
  return String(value).padStart(TIME.DEFAULT_PAD_LENGTH, "0");
}

export function formatDigestDate(date: DigestDate): string {
  const digestDate =
    typeof date === "string"
      ? date
      : [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");

  if (!DIGEST.DATE_PATTERN.test(digestDate)) {
    throw new Error(DIGEST.ERRORS.INVALID_DATE);
  }

  return digestDate;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeMarkdownText(value: string): string {
  return normalizeWhitespace(value).replace(/[\\`*_{}[\]()#+!|>]/g, "\\$&");
}

function renderDigestUrl(value: string): string {
  const normalizedUrl = normalizeWhitespace(value);
  try {
    const parsedUrl = new URL(normalizedUrl);
    if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
      return parsedUrl.toString();
    }
  } catch {
    return DIGEST.INVALID_URL;
  }

  return DIGEST.INVALID_URL;
}

function shortenSummary(summary: string): string {
  const normalizedSummary = normalizeWhitespace(summary);
  if (!normalizedSummary) {
    return DIGEST.EMPTY_SUMMARY;
  }

  if (normalizedSummary.length <= DIGEST.SUMMARY_MAX_LENGTH) {
    return normalizedSummary;
  }

  return `${normalizedSummary.slice(0, DIGEST.SUMMARY_MAX_LENGTH).trimEnd()}...`;
}

function renderDigestItem(item: ScoredCandidateItem, index: number): string {
  return [
    `## ${index + 1}. ${escapeMarkdownText(item.title)}`,
    "",
    `- Source: ${escapeMarkdownText(item.source)}`,
    `- URL: ${renderDigestUrl(item.url)}`,
    `- Final score: ${item.score.finalScore.toFixed(DIGEST.SCORE_DECIMAL_PLACES)}`,
    `- Score reason: ${escapeMarkdownText(item.score.reason)}`,
    `- Short summary: ${escapeMarkdownText(shortenSummary(item.summary))}`,
  ].join(DIGEST.LINE_SEPARATOR);
}

export function writeDigest(items: ScoredCandidateItem[], date: DigestDate): string {
  const digestDate = formatDigestDate(date);
  const sections = [`# ${DIGEST.TITLE} - ${digestDate}`, ...items.map(renderDigestItem)];

  return `${sections.join(`${DIGEST.LINE_SEPARATOR}${DIGEST.LINE_SEPARATOR}`)}${DIGEST.LINE_SEPARATOR}`;
}

export function saveDigest(
  markdown: string,
  date: DigestDate,
  rootDirectory = process.cwd(),
): string {
  const digestDate = formatDigestDate(date);
  const digestDirectory = join(rootDirectory, DIGEST.DIRECTORY);
  const digestPath = join(digestDirectory, `${digestDate}${DIGEST.FILE_EXTENSION}`);

  mkdirSync(digestDirectory, { recursive: true });
  writeFileSync(digestPath, markdown);

  return digestPath;
}
