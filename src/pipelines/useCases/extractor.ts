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

const MAX_CONTENT_CHARS = 9_000;
const MAX_USE_CASES_PER_ARTICLE = 3;
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
        companyName: "real company or organization name; empty string if not stated",
        industry: "industry; empty string if not stated",
        businessFunction: "business function; empty string if not stated",
        workflowAffected: "specific workflow changed; empty string if not stated",
        workflowBefore: "before workflow from the article; empty string if not stated",
        workflowAfter: "after workflow from the article; empty string if not stated",
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
          "short evidence-backed summary; empty string if the source has no concrete support",
      },
    ],
  });
}

function buildMessages(candidate: CandidateItem, fetchedContentText: string): ChatMessage[] {
  return [
    {
      role: AGENT.ROLES.SYSTEM,
      content: [
        "You extract concrete, real enterprise AI deployments from source articles.",
        "Return exactly one valid JSON object and nothing else.",
        "Do not include Markdown, code fences, comments, or prose outside JSON.",
        "The top-level object must contain only a useCases array.",
        `Extract at most ${MAX_USE_CASES_PER_ARTICLE} use cases from one article. Choose the strongest evidence only.`,
        "A valid use case is a real workflow where an enterprise, customer, public-sector organization, or named team is using AI in an actual business process.",
        "The article must provide concrete evidence for the workflow, the AI capability, and the operational or business outcome.",
        "Return an empty useCases array if the article is mainly advice, methodology, best practices, measurement guidance, benchmarking, governance framework, trend commentary, market analysis, or a vendor product launch.",
        "Return an empty useCases array for articles about how to measure AI agents, how to evaluate agents, or how teams should deploy agents unless the article also describes a specific real organization using AI in a specific workflow.",
        "Do not convert an audience segment into a company name. Invalid company names include: Any organization, organizations using AI, contact center organizations, companies, enterprises, customers, users, teams, industry leaders.",
        "If the article only describes a generic audience, a target persona, or a class of organizations, it is not a use case.",
        "Do not extract hypothetical examples, illustrative scenarios, vague vendor claims, generic productivity claims, trend commentary, or generic product launches.",
        "For accepted use cases, leave unsupported fields as empty strings. Do not write unknown, not stated, not available, none, N/A, unclear, or generic filler.",
        "Do not use empty fields to rescue an article that has no concrete use case.",
        "Do not invent missing company names, ROI metrics, integrations, workflow details, or deployment evidence.",
        "Every use case must include every required field.",
        "All use-case fields must be strings except confidenceScore, which must be a number from 1 to 5.",
        "The confidence field name must be exactly confidenceScore and must appear inside every use case object.",
        "Put confidenceScore immediately after id in every use case object.",
        "confidenceScore is your overall score for use-case quality, evidence strength, production relevance, workflow specificity, and business usefulness.",
        "Use confidenceScore 5 only for named real deployments with specific workflow detail, live or production evidence, and measurable outcomes.",
        "Use confidenceScore 4 for strong real deployments where one detail, such as a precise metric or integration, is missing.",
        "Use confidenceScore 3 only for real deployments with incomplete but still concrete evidence.",
        "Use confidenceScore 1 or 2 for weak, vague, pilot-only, or thinly supported evidence.",
        "Keep every string field concise. Prefer one short sentence per field.",
        "Do not include long quotations, long lists, or multi-paragraph values.",
        "For systemIntegrations, return a comma-separated string, not an array.",
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
        truncateContent(fetchedContentText),
        "",
        "Set sourceUrl exactly to the candidate URL.",
        "Keep evidenceSummary concise and analytical. Explain why the use case deserves its confidenceScore using only article evidence.",
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
    "Keep string fields concise so the JSON can complete without truncation.",
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
  const result = await completeStructuredWithRepair({
    messages: buildMessages(candidate, fetchedContentText),
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
