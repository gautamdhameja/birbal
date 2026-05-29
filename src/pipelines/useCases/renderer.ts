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

function escapeMarkdownText(value: string): string {
  return normalizeWhitespace(value).replace(/[\\`*_{}[\]()#+!|>]/g, "\\$&");
}

function escapeTableCell(value: string): string {
  return escapeMarkdownText(value).replace(/\n/g, " ");
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

function renderSummaryTable(items: readonly EnterpriseUseCase[]): string {
  const rows = items.map((useCase) =>
    [
      escapeTableCell(useCase.companyName),
      escapeTableCell(useCase.industry),
      escapeTableCell(useCase.businessFunction),
      escapeTableCell(useCase.workflowAffected),
      escapeTableCell(useCase.aiSystemOrCapability),
      escapeTableCell(useCase.businessOutcome),
      renderSourceLink(useCase),
    ].join(" | "),
  );

  return [
    "## Summary Table",
    "",
    "| Company | Industry | Business Function | Workflow | AI Capability | Outcome | Source |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row} |`),
  ].join("\n");
}

function renderPositioningRelevance(useCase: EnterpriseUseCase): string {
  const details = [
    useCase.workflowAffected,
    useCase.workflowBefore,
    useCase.workflowAfter,
    useCase.roiMetric,
    useCase.businessOutcome,
    useCase.systemIntegrations,
    useCase.governanceOrRiskNotes,
  ]
    .map(normalizeWhitespace)
    .filter((value) => value && value.toLowerCase() !== "unknown");

  if (details.length === 0) {
    return "Useful only if follow-up research confirms workflow, implementation, and outcome detail.";
  }

  return "Useful for positioning around practical enterprise AI workflow redesign, deployment evidence, and measurable business change.";
}

function renderDetailLine(label: string, value: string): string {
  return `- ${label}: ${escapeMarkdownText(value)}`;
}

function renderUseCase(useCase: EnterpriseUseCase, index: number): string {
  const roiAndOutcome = [useCase.roiMetric, useCase.businessOutcome]
    .filter((value) => normalizeWhitespace(value).toLowerCase() !== "unknown")
    .join("; ");

  return [
    `### ${index + 1}. ${escapeMarkdownText(useCase.companyName)}`,
    "",
    renderDetailLine("Company", useCase.companyName),
    renderDetailLine("Industry", useCase.industry),
    renderDetailLine("Business function", useCase.businessFunction),
    renderDetailLine("Workflow affected", useCase.workflowAffected),
    renderDetailLine("Before", useCase.workflowBefore),
    renderDetailLine("After", useCase.workflowAfter),
    renderDetailLine("AI system or capability", useCase.aiSystemOrCapability),
    renderDetailLine("Human role change", useCase.humanRoleChange),
    renderDetailLine("System integrations", useCase.systemIntegrations),
    renderDetailLine("Deployment stage", useCase.deploymentStage),
    renderDetailLine(
      "ROI metric / business outcome",
      roiAndOutcome || `${useCase.roiMetric}; ${useCase.businessOutcome}`,
    ),
    renderDetailLine("Governance or risk notes", useCase.governanceOrRiskNotes),
    renderDetailLine("Implementation details", useCase.implementationDetails),
    renderDetailLine("Evidence summary", useCase.evidenceSummary),
    `- Source: ${renderSourceLink(useCase)}`,
    renderDetailLine("Why this matters for my positioning", renderPositioningRelevance(useCase)),
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
    renderSummaryTable(useCases),
    "",
    "## Detailed Use Cases",
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
