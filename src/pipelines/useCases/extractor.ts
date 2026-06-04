// Purpose: Implements the Birbal pipeline component: extractor.
// Scope: Keeps app-specific pipeline behavior outside the generic framework.

import { z } from "zod";

import { AGENT } from "../../constants/agent.js";
import { MODEL_PROVIDERS } from "../../constants/model-providers.js";
import type { CandidateItem } from "../../daily/types.js";
import { completeStructuredWithRepair, ModelParseError } from "../../framework/llm/repair.js";
import type { ChatMessage, ModelClient, ModelCompleteOptions } from "../../framework/llm/types.js";
import { logger } from "../../logging/logger.js";
import { getDefaultModelClient } from "../../model-providers/default.js";
import {
  EnterpriseUseCaseSchema,
  isEligibleEnterpriseUseCase,
  type EnterpriseUseCase,
} from "./schema.js";

type CompleteFn = ModelClient["complete"];

export type ExtractEnterpriseUseCasesOptions = Pick<
  ModelCompleteOptions,
  "traceId" | "traceLabel"
> & {
  completeFn?: CompleteFn;
  maxContentChars?: number;
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

export const ENTERPRISE_USE_CASE_EXTRACTOR_VERSION = "enterprise-use-case-extractor:v2";
const DEFAULT_MAX_CONTENT_CHARS = 6_000;
const MAX_USE_CASES_PER_ARTICLE = 5;
const MODEL_TEMPERATURE = 0;
const MODEL_MAX_TOKENS = 3_000;

function truncateContent(content: string, maxContentChars: number): string {
  if (content.length <= maxContentChars) {
    return content;
  }

  return `${content.slice(0, maxContentChars)}\n\n[truncated ${
    content.length - maxContentChars
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
        companyName: "real company or organization name; empty string if not stated",
        industry: "industry; empty string if not stated",
        businessFunction: "business function; empty string if not stated",
        workflowAffected: "specific workflow changed; empty string if not stated",
        workflowBefore:
          "1 complete sentence describing how the workflow worked before AI; empty string if not stated",
        workflowAfter:
          "1 complete sentence describing how the workflow works after AI; empty string if not stated",
        aiSystemOrCapability:
          "AI system or capability used in the workflow; empty string if not stated",
        humanRoleChange: "human role change from the article; empty string if not stated",
        systemIntegrations: "systems integrated; empty string if not stated",
        deploymentStage: "deployment maturity or stage; empty string if not stated",
        roiMetric: "specific ROI metric; empty string if not stated",
        businessOutcome: "business outcome; empty string if not stated",
        governanceOrRiskNotes: "governance or risk notes; empty string if not stated",
        implementationDetails: "implementation details; empty string if not stated",
        sourceTitle: "source title",
        sourceUrl: "source URL",
        sourceName: "source name",
        publishDate: "publish date; empty string if not stated",
        evidenceSummary:
          "2-3 complete sentences explaining the company, workflow, AI role, deployment evidence, and improvement; empty string if unsupported",
      },
    ],
  });
}

function buildMessages(
  candidate: CandidateItem,
  fetchedContentText: string,
  maxContentChars: number,
): ChatMessage[] {
  return [
    {
      role: AGENT.ROLES.SYSTEM,
      content: [
        "You extract concrete, real enterprise AI deployments from source articles.",
        "Return exactly one valid JSON object with a useCases array and nothing else.",
        `Extract at most ${MAX_USE_CASES_PER_ARTICLE} use cases from one article. Choose the strongest evidence only.`,
        "Accept only real deployed or live operational enterprise workflows using AI.",
        "Reject advice, measurement/evaluation frameworks, best practices, trend pieces, product launches, hypothetical examples, and generic vendor claims.",
        "Never use generic audience labels as companyName, such as companies, enterprises, customers, users, teams, or contact center organizations.",
        "Leave unsupported fields as empty strings. Do not invent missing company names, metrics, integrations, workflow details, or deployment evidence.",
        "All fields are strings except confidenceScore, which is 1-5 and must appear inside every use case.",
        "Score 5 for named production deployments with workflow detail and measurable outcomes; 4 for strong deployments with one thin detail; 3 for concrete but incomplete deployments; 1-2 for weak evidence.",
        "Write workflowBefore, workflowAfter, businessOutcome, and evidenceSummary as clear sentences, not keyword fragments.",
        "Keep most fields concise. evidenceSummary may be 2-3 short sentences because it is used directly in the newsletter.",
        "Use comma-separated strings instead of arrays.",
      ].join(" "),
    },
    {
      role: AGENT.ROLES.USER,
      content: [
        "Eligibility checklist:",
        "- Extract a use case only when the article describes a real enterprise AI deployment, rollout, production system, customer story, or live operational usage.",
        "- The use case must have a concrete workflow, not just a general capability or management concept.",
        "- The workflow must be specific enough that a reader can understand what changed before and after AI.",
        "- The AI system or capability must be tied to that workflow.",
        "- The evidence must come from the article text, not from your assumptions.",
        "- If the article is a measurement framework, evaluation framework, best-practices guide, thought-leadership piece, or generic methodology article, return an empty useCases array.",
        "- If the article mentions deployment only as something readers should do in the future, return an empty useCases array.",
        "- If there is no real company, organization, or clearly deployed internal team, return an empty useCases array unless the article still provides unmistakable live-production evidence for a specific enterprise workflow.",
        "- Never use a target audience as companyName. Examples to reject: Any organization using contact centers, contact center organizations, companies, enterprises, customers, users.",
        "- For every extracted field, copy only what the article supports. If the article does not support the field, use an empty string.",
        "- Do not paraphrase missing details into plausible language. Blank is better than generic.",
        "- workflowBefore must explain the old human, team, or process behavior in a complete sentence when the article states it.",
        "- workflowAfter must explain what changed after AI was deployed or rolled out in a complete sentence when the article states it.",
        "- evidenceSummary must give enough context for a newsletter reader to understand the actual use case without opening the link.",
        "- evidenceSummary should mention the company, the workflow, what the AI system does, and the improvement or evidence of deployment when stated.",
        "",
        "For each accepted use case, extract:",
        "- real company or organization when stated",
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
        `- no more than ${MAX_USE_CASES_PER_ARTICLE} strongest use cases from this article`,
        "",
        "Candidate:",
        renderCandidate(candidate),
        "",
        "Fetched content text:",
        truncateContent(fetchedContentText, maxContentChars),
        "",
        "Set sourceUrl exactly to the candidate URL.",
        "Keep evidenceSummary analytical and specific. Explain why the use case deserves its confidenceScore using only article evidence.",
        "Keep the full response compact enough to finish. If the article has many examples, pick the best few rather than listing all of them.",
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
    "Keep only concrete real enterprise AI deployments or live operational use cases.",
    "Return an empty useCases array for best-practices, measurement, evaluation, benchmarking, methodology, trend, or framework articles that do not contain a concrete deployed use case.",
    "Do not use generic audience labels such as Any organization, companies, enterprises, customers, users, teams, or contact center organizations as companyName.",
    "Every item in useCases must match the EnterpriseUseCase schema.",
    "All fields must be strings except confidenceScore, which must be a number from 1 to 5.",
    "Do not omit confidenceScore.",
    `Keep at most ${MAX_USE_CASES_PER_ARTICLE} use cases.`,
    "Keep string fields concise so the JSON can complete without truncation, but keep evidenceSummary as 2-3 short complete sentences when evidence exists.",
    "Keep workflowBefore and workflowAfter as complete sentences, not fragments, when the source states those details.",
    "Use comma-separated strings instead of arrays for list-like fields.",
    "Use empty strings for unavailable fields.",
    "Do not replace missing details with vague filler such as unknown, not stated, not available, unclear, generic, or N/A.",
    "Do not add use cases or details that are not supported by the article.",
  ].join(" ");
}

function useCasesWithTrustedSourceUrl(
  useCases: EnterpriseUseCase[],
  candidate: CandidateItem,
): EnterpriseUseCase[] {
  return useCases.slice(0, MAX_USE_CASES_PER_ARTICLE).map((useCase) => ({
    ...useCase,
    sourceUrl: candidate.url,
  }));
}

export async function extractEnterpriseUseCases(
  candidate: CandidateItem,
  fetchedContentText: string,
  options: ExtractEnterpriseUseCasesOptions = {},
): Promise<EnterpriseUseCase[]> {
  const maxContentChars = options.maxContentChars ?? DEFAULT_MAX_CONTENT_CHARS;
  const result = await completeStructuredWithRepair({
    messages: buildMessages(candidate, fetchedContentText, maxContentChars),
    schema: ExtractedEnterpriseUseCasesSchema,
    completeFn: options.completeFn ?? getDefaultModelClient().complete,
    logger,
    repairInstructions: buildRepairInstructions(),
    completeOptions: {
      temperature: MODEL_TEMPERATURE,
      maxOutputTokens: MODEL_MAX_TOKENS,
      traceId: options.traceId,
      traceLabel: options.traceLabel ?? "use_cases.extract_enterprise_use_cases",
      response_format: {
        type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT,
      },
    },
  });

  if (!result.ok) {
    throw new ModelParseError(result.error);
  }

  return useCasesWithTrustedSourceUrl(result.value.useCases, candidate).filter(
    isEligibleEnterpriseUseCase,
  );
}
