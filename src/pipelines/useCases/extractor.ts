import { z } from "zod";

import { AGENT } from "../../constants/agent.js";
import { LLAMA } from "../../constants/llama.js";
import { completeStructuredWithRepair, ModelParseError } from "../../framework/llm/repair.js";
import type { CandidateItem } from "../../daily/types.js";
import type { ChatMessage, CompleteOptions } from "../../llama/schema.js";
import { EnterpriseUseCaseSchema, type EnterpriseUseCase } from "./schema.js";

type CompleteFn = (messages: ChatMessage[], options?: CompleteOptions) => Promise<string>;

export type ExtractEnterpriseUseCasesOptions = Pick<CompleteOptions, "traceId" | "traceLabel"> & {
  completeFn?: CompleteFn;
};

function normalizeExtractionEnvelope(value: unknown): unknown {
  if (Array.isArray(value)) {
    return { useCases: value };
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const record = value as Record<string, unknown>;
  if (
    !Array.isArray(record.useCases) &&
    !Array.isArray(record.use_cases) &&
    "id" in record &&
    "companyName" in record &&
    "workflowAffected" in record
  ) {
    return { useCases: [record] };
  }

  const useCases = Array.isArray(record.useCases)
    ? record.useCases
    : Array.isArray(record.use_cases)
      ? record.use_cases
      : undefined;
  if (!useCases) {
    return value;
  }

  const normalizedUseCases =
    record.confidenceScore === undefined
      ? useCases
      : useCases.map((useCase) => {
          if (typeof useCase !== "object" || useCase === null || Array.isArray(useCase)) {
            return useCase;
          }

          const useCaseRecord = useCase as Record<string, unknown>;
          if (
            useCaseRecord.confidenceScore !== undefined ||
            useCaseRecord.confidence_score !== undefined ||
            useCaseRecord.confidence !== undefined
          ) {
            return useCase;
          }

          return {
            ...useCaseRecord,
            confidenceScore: record.confidenceScore,
          };
        });

  if (!Array.isArray(record.useCases) && Array.isArray(record.use_cases)) {
    return {
      ...record,
      useCases: normalizedUseCases,
    };
  }

  return {
    ...record,
    useCases: normalizedUseCases,
  };
}

const ExtractedEnterpriseUseCasesSchema = z.preprocess(
  normalizeExtractionEnvelope,
  z.object({
    useCases: z.array(EnterpriseUseCaseSchema),
  }),
);

const MAX_CONTENT_CHARS = 12_000;
const MODEL_TEMPERATURE = 0;
const MODEL_MAX_TOKENS = 3_000;

function truncateContent(content: string): string {
  if (content.length <= MAX_CONTENT_CHARS) {
    return content;
  }

  return `${content.slice(0, MAX_CONTENT_CHARS)}\n\n[truncated ${
    content.length - MAX_CONTENT_CHARS
  } characters]`;
}

function renderCandidate(candidate: CandidateItem): string {
  return JSON.stringify({
    id: candidate.id,
    sourceId: candidate.sourceId,
    sourceName: candidate.sourceName,
    sourceType: candidate.sourceType,
    title: candidate.title,
    url: candidate.url,
    summary: candidate.summary,
    publishedAt: candidate.publishedAt,
    discoveredAt: candidate.discoveredAt,
  });
}

function responseShape(): string {
  return JSON.stringify({
    useCases: [
      {
        id: "stable id for this extracted use case",
        confidenceScore: 1,
        companyName: "real company or organization name, or unknown",
        industry: "industry, or unknown",
        businessFunction: "business function, or unknown",
        workflowAffected: "workflow affected, or unknown",
        workflowBefore: "before workflow, or unknown",
        workflowAfter: "after workflow, or unknown",
        aiSystemOrCapability: "AI system or capability, or unknown",
        humanRoleChange: "human role change, or unknown",
        systemIntegrations: "systems integrated, or unknown",
        deploymentStage: "deployment maturity or stage, or unknown",
        roiMetric: "specific ROI metric, or unknown",
        businessOutcome: "business outcome, or unknown",
        governanceOrRiskNotes: "governance or risk notes, or unknown",
        implementationDetails: "implementation details, or unknown",
        sourceTitle: "source title",
        sourceUrl: "source URL",
        sourceName: "source name",
        publishDate: "publish date, or unknown",
        evidenceSummary:
          "short analytical summary that explains the confidenceScore using workflow, deployment, outcome, and source quality evidence",
      },
    ],
  });
}

function buildMessages(candidate: CandidateItem, fetchedContentText: string): ChatMessage[] {
  return [
    {
      role: AGENT.ROLES.SYSTEM,
      content: [
        "You extract real enterprise AI use cases from source articles.",
        "Return exactly one valid JSON object and nothing else.",
        "Do not include Markdown, code fences, comments, or prose outside JSON.",
        "The top-level object must contain only a useCases array.",
        "Extract only real enterprise use cases with evidence in the article.",
        "Do not extract hypothetical examples, vague vendor claims, trend commentary, or generic product launches.",
        'Use "unknown" for any field that is not available in the article.',
        "Do not invent missing company names, ROI metrics, integrations, workflow details, or deployment evidence.",
        "Every use case must include every required field.",
        "All use-case fields must be strings except confidenceScore, which must be a number from 1 to 5.",
        "The confidence field name must be exactly confidenceScore and must appear inside every use case object.",
        "Put confidenceScore immediately after id in every use case object.",
        "confidenceScore is your overall score for use-case quality, evidence strength, production relevance, workflow specificity, and business usefulness.",
        "Use confidenceScore 5 only for named real deployments with specific workflow detail and measurable outcomes.",
        "Use confidenceScore 3 for plausible but incomplete evidence.",
        "Use confidenceScore 1 or 2 for weak, vague, pilot-only, or thinly supported evidence.",
        "For systemIntegrations, return a comma-separated string, not an array.",
      ].join(" "),
    },
    {
      role: AGENT.ROLES.USER,
      content: [
        "Prioritize:",
        "- real company or organization",
        "- industry",
        "- business function",
        "- workflow affected",
        "- before/after workflow",
        "- AI system or capability",
        "- human role change",
        "- system integration",
        "- business outcome or ROI",
        "- deployment maturity",
        "- evidence quality",
        "- confidenceScore as the final model-owned use-case score for every extracted use case",
        "",
        "Candidate:",
        renderCandidate(candidate),
        "",
        "Fetched content text:",
        truncateContent(fetchedContentText),
        "",
        "Set sourceUrl exactly to the candidate URL.",
        "Keep evidenceSummary concise and analytical. Explain why the use case deserves its confidenceScore using only article evidence.",
        "",
        "Response shape:",
        responseShape(),
        "",
        'If there are no real enterprise AI use cases, return exactly: {"useCases":[]}',
      ].join("\n"),
    },
  ];
}

function buildRepairInstructions(): string {
  return [
    "Repair the enterprise AI use-case extraction response.",
    "Return exactly one valid JSON object with a useCases array.",
    "Every item in useCases must match the EnterpriseUseCase schema.",
    "All fields must be strings except confidenceScore, which must be a number from 1 to 5.",
    "Do not omit confidenceScore.",
    "Use comma-separated strings instead of arrays for list-like fields.",
    'Use "unknown" for unavailable fields.',
    "Do not add use cases or details that are not supported by the article.",
  ].join(" ");
}

function useCasesWithTrustedSourceUrl(
  useCases: EnterpriseUseCase[],
  candidate: CandidateItem,
): EnterpriseUseCase[] {
  return useCases.map((useCase) => ({
    ...useCase,
    sourceUrl: candidate.url,
  }));
}

export async function extractEnterpriseUseCases(
  candidate: CandidateItem,
  fetchedContentText: string,
  options: ExtractEnterpriseUseCasesOptions = {},
): Promise<EnterpriseUseCase[]> {
  const result = await completeStructuredWithRepair({
    messages: buildMessages(candidate, fetchedContentText),
    schema: ExtractedEnterpriseUseCasesSchema,
    completeFn: options.completeFn,
    repairInstructions: buildRepairInstructions(),
    completeOptions: {
      temperature: MODEL_TEMPERATURE,
      max_tokens: MODEL_MAX_TOKENS,
      traceId: options.traceId,
      traceLabel: options.traceLabel ?? "use_cases.extract_enterprise_use_cases",
      response_format: {
        type: LLAMA.RESPONSE_FORMATS.JSON_OBJECT,
      },
    },
  });

  if (!result.ok) {
    throw new ModelParseError(result.error);
  }

  return useCasesWithTrustedSourceUrl(result.value.useCases, candidate);
}
