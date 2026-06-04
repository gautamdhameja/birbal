// Purpose: Renders daily reading items into Markdown.
// Scope: Keeps daily-specific digest presentation helpers out of the generic framework.

import { CANDIDATE_CATEGORIES } from "../constants/candidates.js";
import { DIGEST } from "../constants/digest.js";
import { TIME } from "../constants/time.js";
import { formatDateOnly } from "../utils/date.js";
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
      return `<${parsedUrl.toString()}>`;
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

function sentenceFragments(value: string): string[] {
  return normalizeWhitespace(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function renderFiveLineSummary(item: ScoredCandidateItem): string[] {
  const sourceText = item.contentText || item.summary;
  const sentences = sentenceFragments(sourceText);
  const fallback = shortenSummary(item.summary);
  const lines = sentences.length > 0 ? sentences : [fallback];

  return Array.from({ length: DIGEST.SUMMARY_LINES }, (_value, index) =>
    escapeMarkdownText(
      index === 0
        ? shortenSummary(lines[index] ?? fallback)
        : (lines[index] ?? DIGEST.UNKNOWN_FIELD),
    ),
  );
}

function categoryLabel(category: ScoredCandidateItem["category"]): string {
  return category ? category.replaceAll("_", " ") : DIGEST.UNKNOWN_FIELD;
}

function inferWorkflowAffected(item: ScoredCandidateItem): string {
  switch (item.category) {
    case CANDIDATE_CATEGORIES.WORKFLOW_REDESIGN:
      return "Core workflow and operating model design.";
    case CANDIDATE_CATEGORIES.AGENTIC_IMPLEMENTATION:
      return "AI-assisted task execution and tool orchestration.";
    case CANDIDATE_CATEGORIES.FDE_CUSTOMER_DEPLOYMENT:
      return "Customer deployment, onboarding, and field delivery workflow.";
    case CANDIDATE_CATEGORIES.GOVERNANCE_ROI:
      return "Governance, measurement, risk, and ROI workflow.";
    case CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE:
      return "Enterprise use-case selection and adoption workflow.";
    case CANDIDATE_CATEGORIES.REJECTED:
      return "No actionable enterprise workflow identified.";
    default:
      return DIGEST.UNKNOWN_FIELD;
  }
}

function inferWhyItMatters(item: ScoredCandidateItem): string {
  if (item.score.rejected) {
    return item.score.rejectionReason ?? "Rejected by the enterprise deployment scorer.";
  }

  return item.score.reason;
}

function inferHumanRoleChange(item: ScoredCandidateItem): string {
  const text = normalizeWhitespace(`${item.summary} ${item.contentText ?? ""}`).toLocaleLowerCase();
  if (text.includes("human in the loop") || text.includes("review")) {
    return "Humans move toward review, exception handling, and quality control.";
  }
  if (text.includes("agent") || text.includes("automation")) {
    return "Humans supervise automated steps and handle ambiguous cases.";
  }

  return DIGEST.UNKNOWN_FIELD;
}

function inferSystemIntegration(item: ScoredCandidateItem): string {
  const text = normalizeWhitespace(`${item.summary} ${item.contentText ?? ""}`).toLocaleLowerCase();
  if (text.includes("api") || text.includes("tool calling") || text.includes("integration")) {
    return "Application, data, and tool integrations are likely required.";
  }
  if (text.includes("rag") || text.includes("retrieval") || text.includes("knowledge base")) {
    return "Knowledge retrieval and enterprise data integration are likely required.";
  }

  return DIGEST.UNKNOWN_FIELD;
}

function inferBusinessMetric(item: ScoredCandidateItem): string {
  const text = normalizeWhitespace(`${item.summary} ${item.contentText ?? ""}`).toLocaleLowerCase();
  if (text.includes("roi") || text.includes("cost") || text.includes("savings")) {
    return "Cost, savings, or ROI impact is discussed.";
  }
  if (text.includes("productivity") || text.includes("efficiency") || text.includes("cycle time")) {
    return "Productivity, efficiency, or cycle-time improvement is the likely metric.";
  }

  return DIGEST.UNKNOWN_FIELD;
}

function inferPositioningRelevance(item: ScoredCandidateItem): string {
  if (item.score.rejected) {
    return "Low relevance to Gautam's enterprise AI positioning.";
  }

  if (item.score.workflowRedesignDepth >= 4) {
    return "Useful for positioning around workflow redesign, operating model change, and adoption.";
  }

  if (
    item.score.deploymentFdeRelevance >= 4 ||
    item.category === CANDIDATE_CATEGORIES.FDE_CUSTOMER_DEPLOYMENT
  ) {
    return "Useful for positioning around practical enterprise AI deployment and field execution.";
  }

  return "Useful only if tied back to enterprise deployment decisions.";
}

function renderDigestItem(item: ScoredCandidateItem, index: number): string {
  return [
    `## ${index + 1}. ${escapeMarkdownText(item.title)}`,
    "",
    `- Source: ${escapeMarkdownText(item.sourceName)}`,
    `- Link: ${renderDigestUrl(item.url)}`,
    `- Publish date: ${escapeMarkdownText(formatDateOnly(item.publishedAt, DIGEST.UNKNOWN_FIELD))}`,
    `- Category: ${escapeMarkdownText(categoryLabel(item.category))}`,
    `- Score: ${item.score.finalScore.toFixed(DIGEST.SCORE_DECIMAL_PLACES)}`,
    "- 5-line summary:",
    ...renderFiveLineSummary(item).map((line) => `  - ${line}`),
    `- Enterprise workflow affected: ${escapeMarkdownText(inferWorkflowAffected(item))}`,
    `- Why it matters: ${escapeMarkdownText(inferWhyItMatters(item))}`,
    `- Human role change: ${escapeMarkdownText(inferHumanRoleChange(item))}`,
    `- System integration needed: ${escapeMarkdownText(inferSystemIntegration(item))}`,
    `- ROI or business metric: ${escapeMarkdownText(inferBusinessMetric(item))}`,
    `- Relevance to Gautam's positioning: ${escapeMarkdownText(inferPositioningRelevance(item))}`,
  ].join(DIGEST.LINE_SEPARATOR);
}

export function writeDigest(items: ScoredCandidateItem[], date: DigestDate): string {
  const digestDate = formatDigestDate(date);
  const sections = [`# ${DIGEST.TITLE} - ${digestDate}`, ...items.map(renderDigestItem)];

  return `${sections.join(`${DIGEST.LINE_SEPARATOR}${DIGEST.LINE_SEPARATOR}`)}${DIGEST.LINE_SEPARATOR}`;
}
