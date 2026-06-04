// Purpose: Implements the Birbal pipeline component: renderer.
// Scope: Keeps app-specific pipeline behavior outside the generic framework.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DIGEST } from "../../constants/digest.js";
import { formatDateOnly } from "../../utils/date.js";
import type { EnterpriseUseCase } from "./schema.js";

type UseCaseDigestDate = Date | string;

const USE_CASE_DIGEST_DIRECTORY = join(DIGEST.DIRECTORY, "use-cases");

function formatUseCaseDigestDate(date: UseCaseDigestDate): string {
  const digestDate = formatDateOnly(date, "");
  if (!DIGEST.DATE_PATTERN.test(digestDate)) {
    throw new Error(DIGEST.ERRORS.INVALID_DATE);
  }

  return digestDate;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isMissingValue(value: string): boolean {
  const normalizedValue = normalizeWhitespace(value).toLowerCase();
  return (
    normalizedValue === "" ||
    normalizedValue === "unknown" ||
    normalizedValue === "not stated" ||
    normalizedValue === "not available" ||
    normalizedValue === "n/a" ||
    normalizedValue === "none" ||
    normalizedValue === "unclear"
  );
}

function blankIfMissing(value: string): string {
  return isMissingValue(value) ? "" : value;
}

function stripTrailingPunctuation(value: string): string {
  return normalizeWhitespace(value).replace(/[.;:]+$/g, "");
}

function escapeMarkdownText(value: string): string {
  return normalizeWhitespace(value).replace(/[\\`*_{}[\]()#+!|>]/g, "\\$&");
}

function sourceLabel(useCase: EnterpriseUseCase): string {
  if (useCase.sourceName.trim().toLowerCase() !== "unknown") {
    return useCase.sourceName;
  }

  return useCase.sourceTitle;
}

function renderSourceLink(useCase: EnterpriseUseCase): string {
  const label = escapeMarkdownText(sourceLabel(useCase));
  try {
    const parsed = new URL(normalizeWhitespace(useCase.sourceUrl));
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return `[${label}](${parsed.toString()})`;
    }
  } catch {
    return label;
  }

  return label;
}

function renderEnterpriseLesson(useCase: EnterpriseUseCase): string {
  const workflow = blankIfMissing(useCase.workflowAffected);
  const impact = renderBusinessImpact(useCase);

  if (!workflow) {
    return "";
  }

  if (impact) {
    return `The reusable pattern is a specific workflow change measured through ${stripTrailingPunctuation(
      impact,
    )}.`;
  }

  return "";
}

function renderDetailLine(label: string, value: string): string {
  return `- ${label}: ${escapeMarkdownText(value)}`;
}

function renderUseCaseSummary(useCase: EnterpriseUseCase): string {
  const businessFunction = blankIfMissing(useCase.businessFunction);
  const aiCapability = blankIfMissing(useCase.aiSystemOrCapability);
  const functionPrefix = businessFunction ? `${businessFunction}: ` : "";

  return `${functionPrefix}${aiCapability}`;
}

function renderWorkflowChanged(useCase: EnterpriseUseCase): string {
  const workflow = blankIfMissing(useCase.workflowAffected);
  const before = blankIfMissing(useCase.workflowBefore);
  const after = blankIfMissing(useCase.workflowAfter);
  if (!before && !after) {
    return workflow;
  }

  if (!before) {
    return [workflow, `after AI: ${after}`].filter(Boolean).join("; ");
  }

  if (!after) {
    return [workflow, `before AI: ${before}`].filter(Boolean).join("; ");
  }

  return [workflow, `before: ${before}`, `after: ${after}`].filter(Boolean).join("; ");
}

function renderBusinessImpact(useCase: EnterpriseUseCase): string {
  const roiMetric = normalizeWhitespace(useCase.roiMetric);
  if (!isMissingValue(roiMetric)) {
    return roiMetric;
  }

  const businessOutcome = normalizeWhitespace(useCase.businessOutcome);

  return isMissingValue(businessOutcome) ? "" : businessOutcome;
}

function renderUseCase(useCase: EnterpriseUseCase, index: number): string {
  return [
    `### ${index + 1}. ${escapeMarkdownText(useCase.companyName)}`,
    "",
    renderDetailLine("Use case", renderUseCaseSummary(useCase)),
    renderDetailLine("Workflow changed", renderWorkflowChanged(useCase)),
    renderDetailLine("Business impact", renderBusinessImpact(useCase)),
    renderDetailLine("Enterprise lesson", renderEnterpriseLesson(useCase)),
    `- Source: ${renderSourceLink(useCase)}`,
  ].join("\n");
}

export function renderEnterpriseUseCaseDigest(
  useCases: readonly EnterpriseUseCase[],
  date: UseCaseDigestDate,
): string {
  const digestDate = formatUseCaseDigestDate(date);

  return [
    `# Enterprise AI Use Cases - ${digestDate}`,
    "",
    useCases.map(renderUseCase).join("\n\n"),
    "",
  ].join("\n");
}

export function saveEnterpriseUseCaseDigest(
  markdown: string,
  date: UseCaseDigestDate,
  rootDirectory = process.cwd(),
): string {
  const formattedDate = formatUseCaseDigestDate(date);
  const digestDirectory = join(rootDirectory, USE_CASE_DIGEST_DIRECTORY);
  const digestPath = join(digestDirectory, `${formattedDate}${DIGEST.FILE_EXTENSION}`);

  mkdirSync(digestDirectory, { recursive: true });
  writeFileSync(digestPath, markdown);

  return digestPath;
}
