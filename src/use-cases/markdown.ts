import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { USE_CASES } from "../constants/use-cases.js";
import { formatDateOnly } from "../utils/date.js";
import type { ProductionUseCase } from "./types.js";

function formatDate(date: Date): string {
  return formatDateOnly(date, "");
}

function assertValidDate(date: string): void {
  if (!USE_CASES.DATE_PATTERN.test(date)) {
    throw new Error(USE_CASES.ERRORS.INVALID_DATE);
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeMarkdownText(value: string): string {
  return normalizeWhitespace(value).replace(/[\\`*_{}[\]()#+!|>]/g, "\\$&");
}

function renderUseCaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return escapeMarkdownText(url);
    }

    return `[${parsed.hostname}](${parsed.toString()})`;
  } catch {
    return escapeMarkdownText(url);
  }
}

function renderUseCase(useCase: ProductionUseCase, index: number): string {
  return [
    `## ${index + 1}. ${escapeMarkdownText(useCase.company)}`,
    "",
    `- Workflow: ${escapeMarkdownText(useCase.workflow)}`,
    `- What AI does: ${escapeMarkdownText(useCase.whatAiDoes)}`,
    `- Production evidence: ${escapeMarkdownText(useCase.productionEvidence)}`,
    `- Business metric: ${escapeMarkdownText(useCase.businessMetric)}`,
    `- Source link: ${renderUseCaseUrl(useCase.sourceLink)}`,
    `- Publish date: ${escapeMarkdownText(formatDateOnly(useCase.publishDate, "Unknown"))}`,
    `- Why this matters: ${escapeMarkdownText(useCase.whyThisMattersForEnterpriseAiWorkflowRedesign)}`,
  ].join("\n");
}

export function writeUseCaseReport(useCases: ProductionUseCase[], date: Date): string {
  return [
    `# ${USE_CASES.TITLE} - ${formatDate(date)}`,
    "",
    `Accepted results: ${useCases.length}`,
    "",
    useCases.map(renderUseCase).join("\n\n"),
    "",
  ].join("\n");
}

export function saveUseCaseReport(markdown: string, date: Date): string {
  const formattedDate = formatDate(date);
  assertValidDate(formattedDate);
  mkdirSync(USE_CASES.REPORT_DIRECTORY, { recursive: true });

  const reportPath = join(
    USE_CASES.REPORT_DIRECTORY,
    `${formattedDate}${USE_CASES.FILE_EXTENSION}`,
  );
  writeFileSync(reportPath, markdown);

  return reportPath;
}
