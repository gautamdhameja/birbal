// Purpose: Renders selected enterprise use cases into newsletter Markdown.
// Scope: Keeps use-case-specific presentation logic out of the generic pipeline framework.

import { DIGEST } from "../../constants/digest.js";
import { formatDateOnly } from "../../utils/date.js";
import type { EnterpriseUseCase } from "./schema.js";

type UseCaseDigestDate = Date | string;

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

function sentence(value: string): string {
  const normalizedValue = normalizeWhitespace(value);
  if (!normalizedValue) {
    return "";
  }

  return /[.!?]$/u.test(normalizedValue) ? normalizedValue : `${normalizedValue}.`;
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
      return `[${label}](<${parsed.toString()}>)`;
    }
  } catch {
    return label;
  }

  return label;
}

function renderDetailLine(label: string, value: string): string {
  return `- ${label}: ${escapeMarkdownText(value)}`;
}

function renderUseCaseSummary(useCase: EnterpriseUseCase): string {
  const evidenceSummary = blankIfMissing(useCase.evidenceSummary);
  if (evidenceSummary) {
    return sentence(evidenceSummary);
  }

  const company = blankIfMissing(useCase.companyName);
  const businessFunction = blankIfMissing(useCase.businessFunction);
  const aiCapability = blankIfMissing(useCase.aiSystemOrCapability);
  const context = [
    company ? `${company} is using` : "Using",
    aiCapability || "AI",
    businessFunction ? `in ${businessFunction}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return sentence(context);
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
    renderDetailLine("Summary", renderUseCaseSummary(useCase)),
    renderDetailLine("Business impact", renderBusinessImpact(useCase)),
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
