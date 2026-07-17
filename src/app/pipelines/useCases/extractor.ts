import { z } from "zod";

import { FRAMEWORK_AGENT as AGENT } from "../../../framework/agent/constants.js";
import { MODEL_PROVIDERS } from "../../constants/model-providers.js";
import type { CandidateItem } from "../../daily/types.js";
import { completeStructuredWithRepair, ModelParseError } from "../../../framework/llm/repair.js";
import type {
  ChatMessage,
  ModelClient,
  ModelCompleteOptions,
} from "../../../framework/llm/types.js";
import { logger } from "../../logging/logger.js";
import { getDefaultModelClient } from "../../model-providers/default.js";
import { normalizeUrl } from "../../../framework/network/normalizeUrl.js";
import {
  EnterpriseUseCaseSchema,
  isEligibleEnterpriseUseCase,
  type EnterpriseUseCase,
} from "./schema.js";
import type { SourceEvidence } from "./sourceEvidence.js";

type CompleteFn = ModelClient["complete"];

export type ExtractEnterpriseUseCasesOptions = Pick<
  ModelCompleteOptions,
  "traceId" | "traceLabel"
> & {
  completeFn?: CompleteFn;
  maxContentChars?: number;
  sourceEvidence?: SourceEvidence;
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
    "aiSystemOrCapability" in record
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

export const ENTERPRISE_USE_CASE_EXTRACTOR_VERSION = "enterprise-use-case-extractor:v4";
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

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n[truncated]`;
}

function renderEvidenceText(
  fetchedContentText: string,
  sourceEvidence: SourceEvidence | undefined,
): string {
  if (!sourceEvidence) {
    return fetchedContentText;
  }

  const linkedEvidence = sourceEvidence.linkedEvidence.map((document, index) =>
    [
      `Supporting evidence ${index + 1}:`,
      `URL: ${document.url}`,
      `Title: ${document.title}`,
      "Text:",
      truncate(document.plainText, 1_500),
    ].join("\n"),
  );

  return [
    "Primary source page:",
    `URL: ${sourceEvidence.source.url}`,
    `Title: ${sourceEvidence.source.title}`,
    "Text:",
    sourceEvidence.source.plainText || fetchedContentText,
    "",
    linkedEvidence.length > 0
      ? [
          "Same-site supporting pages fetched from links on the primary source page:",
          linkedEvidence.join("\n\n"),
        ].join("\n")
      : "No supporting pages were fetched.",
  ].join("\n");
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
        sourceUrl: "best source URL from the provided evidence URLs",
        sourceName: "source name",
        publishDate: "publish date; empty string if not stated",
        evidenceSummary:
          "3-5 concise, self-contained newsletter sentences focused on the concrete problem, workflow, AI action, operational change, and business impact; empty string if unsupported",
      },
    ],
  });
}

function buildMessages(
  candidate: CandidateItem,
  fetchedContentText: string,
  maxContentChars: number,
  sourceEvidence?: SourceEvidence,
): ChatMessage[] {
  const evidenceText = renderEvidenceText(fetchedContentText, sourceEvidence);
  const trustedUrls = [
    candidate.url,
    ...(sourceEvidence?.linkedEvidence.map((item) => item.url) ?? []),
  ];

  return [
    {
      role: AGENT.ROLES.SYSTEM,
      content: [
        "You are an enterprise AI research analyst extracting real deployed use cases from source articles.",
        "Return exactly one valid JSON object with a useCases array and nothing else.",
        `Extract at most ${MAX_USE_CASES_PER_ARTICLE} use cases from one article. Choose the strongest evidence only.`,
        "Use judgment. Accept vendor or consulting PR material when it names a real organization and gives a concrete AI use case with source-grounded deployment or outcome evidence.",
        "Reject advice, measurement/evaluation frameworks, best practices, trend pieces, product launches, hypothetical examples, and generic vendor claims when they do not contain a real organization using AI in a concrete activity.",
        "Never use generic audience labels as companyName, such as companies, enterprises, customers, users, teams, or contact center organizations.",
        "Leave unsupported fields as empty strings. Do not invent missing company names, metrics, integrations, deployment evidence, or business impact.",
        "All fields are strings except confidenceScore, which is 1-5 and must appear inside every use case.",
        "The confidenceScore is the extraction score: 5 means named organization, live deployment or rollout, clear AI role, concrete enterprise activity, and measurable business outcome; 4 means strong real deployment with one missing detail; 3 means real but incomplete evidence; 1-2 means weak evidence and should usually be omitted.",
        "Write businessOutcome and evidenceSummary as clear sentences, not keyword fragments.",
        "Keep most fields concise. evidenceSummary is the newsletter summary, so it must contain the useful context instead of relying on other fields.",
        "Write evidenceSummary like an analyst explaining the use case, not like vendor marketing copy.",
        "Do not lead evidenceSummary with partnership, vendor, or platform framing such as 'Company partnered with Google Cloud/AWS/OpenAI'. Lead with the business problem and workflow being changed.",
        "Mention cloud providers, products, or partners only when they explain a concrete implementation detail that matters to the workflow.",
        "The primary source page may be a summary or landing page. When a same-site supporting page has more specific evidence, use that supporting page for extraction.",
        "Use comma-separated strings instead of arrays.",
      ].join(" "),
    },
    {
      role: AGENT.ROLES.USER,
      content: [
        "Decision process:",
        "1. Read the candidate metadata and fetched article text as the only evidence.",
        "2. Identify whether the article contains one or more real enterprise AI use cases.",
        "3. Extract only use cases where a real company, public-sector organization, or clearly identified internal enterprise team is using AI for a concrete business activity.",
        "4. Treat marketing language as neutral. Do not reject a case merely because the source is a vendor blog, PR page, or consulting article. Reject it only when the concrete use-case evidence is missing.",
        "5. Reject the article by returning an empty useCases array when it is mainly a framework, measurement guide, best-practices article, benchmark, trend piece, product announcement, future roadmap, or hypothetical example without a real deployed use case.",
        "6. Reject generic audience labels as companies. Examples to reject: Any organization using contact centers, contact center organizations, companies, enterprises, customers, users, teams.",
        "",
        "Evidence requirements for an accepted use case:",
        "- There must be a real organization or clearly deployed internal enterprise team.",
        "- There must be a specific AI system, agent, assistant, copilot, model, automation capability, or AI-enabled product capability.",
        "- The AI capability must be doing something concrete, such as triaging requests, drafting responses, summarizing records, automating support, analyzing contracts, generating content, improving search, assisting employees, or changing a business process.",
        "- Prefer production, rollout, customer-story, live usage, or measurable outcome evidence. A pilot can score at most 3 unless the article gives unusually strong operational evidence.",
        "- If the source gives no metric, leave roiMetric empty and describe only the stated qualitative businessOutcome.",
        "- If the source gives no integrations, governance, implementation, or human-role detail, leave those fields empty.",
        "",
        "Scoring guidance:",
        "- confidenceScore 5: named organization, live deployment or rollout, clear AI activity, concrete business function, measurable result, and useful implementation or operating detail.",
        "- confidenceScore 4: named organization and real deployment with clear AI activity, but either the metric or implementation detail is thin.",
        "- confidenceScore 3: real organization and plausible live use case, but evidence is incomplete or mostly qualitative.",
        "- confidenceScore 2: vague, pilot-only, or mostly vendor claim. Usually omit unless it is the only concrete example in a multi-example article.",
        "- confidenceScore 1: hypothetical, generic, framework-only, or unsupported. Do not include.",
        "",
        "Field rules:",
        "- For every extracted field, use only article-supported facts. If unsupported, use an empty string.",
        "- Do not paraphrase missing details into plausible language. Blank is better than generic.",
        "- Use specific, source-grounded wording. Avoid hype words unless they are part of a stated product or metric.",
        "- businessOutcome should be a clear sentence about operational or business impact when the article states one.",
        "- evidenceSummary is the final newsletter summary. It must be self-contained and useful even if the reader sees no other fields.",
        "- evidenceSummary must focus on: the enterprise problem, the workflow or decision being changed, what the AI does inside that workflow, what humans do differently, evidence of deployment or usage when stated, and the business impact or operational change when stated.",
        "- evidenceSummary should be 3-5 concise sentences. It may mention missing metrics only by omission; do not write that details were not stated.",
        "- evidenceSummary should not read like an announcement. Do not write 'partnered with', 'collaborated with', 'leveraged the power of', 'transformed with', or similar promotional framing unless that exact relationship is the use case itself.",
        "- Do not make platform names the point of the summary. If the source says AWS, Google Cloud, Azure, Bedrock, Vertex AI, OpenAI, Claude, or a vendor product was used, include it only after explaining the workflow problem and AI action.",
        "- Bad summary pattern: 'Blue Origin partnered with AWS to transform engineering with generative AI.'",
        "- Better summary pattern: 'Blue Origin is using generative AI to help engineers find and reuse technical knowledge during design work. The system reduces time spent searching across engineering material and supports faster decisions in aerospace workflows. AWS is implementation context, not the main point.'",
        "",
        "For each accepted use case, extract:",
        "- real company or organization when stated",
        "- industry",
        "- business function",
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
        "Trusted source URLs you may cite in sourceUrl:",
        trustedUrls.join("\n"),
        "",
        "Fetched content text:",
        truncateContent(evidenceText, maxContentChars),
        "",
        "Set sourceUrl to the single trusted URL that best supports the extracted use case. Prefer a detailed supporting page over a broad landing page when the supporting page contains the actual evidence.",
        "Keep evidenceSummary analytical and specific. It should explain the actual use case, the workflow problem, what AI changes, and why it deserves its confidenceScore using only article evidence.",
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
    "Keep string fields concise so the JSON can complete without truncation, but keep evidenceSummary as 3-5 concise, self-contained newsletter sentences when evidence exists.",
    "Use comma-separated strings instead of arrays for list-like fields.",
    "Use empty strings for unavailable fields.",
    "Do not replace missing details with vague filler such as unknown, not stated, not available, unclear, generic, or N/A.",
    "Do not add use cases or details that are not supported by the article.",
  ].join(" ");
}

function trustedSourceUrl(
  useCase: EnterpriseUseCase,
  candidate: CandidateItem,
  sourceEvidence?: SourceEvidence,
) {
  const trustedUrls = new Set(
    [candidate.url, ...(sourceEvidence?.linkedEvidence.map((item) => item.url) ?? [])].map((url) =>
      normalizeUrl(url),
    ),
  );
  const normalizedSourceUrl = normalizeUrl(useCase.sourceUrl);

  return trustedUrls.has(normalizedSourceUrl) ? normalizedSourceUrl : normalizeUrl(candidate.url);
}

function useCasesWithTrustedSourceUrls(
  useCases: EnterpriseUseCase[],
  candidate: CandidateItem,
  sourceEvidence?: SourceEvidence,
): EnterpriseUseCase[] {
  return useCases.slice(0, MAX_USE_CASES_PER_ARTICLE).map((useCase) => ({
    ...useCase,
    sourceUrl: trustedSourceUrl(useCase, candidate, sourceEvidence),
  }));
}

export async function extractEnterpriseUseCases(
  candidate: CandidateItem,
  fetchedContentText: string,
  options: ExtractEnterpriseUseCasesOptions = {},
): Promise<EnterpriseUseCase[]> {
  const maxContentChars = options.maxContentChars ?? DEFAULT_MAX_CONTENT_CHARS;
  const result = await completeStructuredWithRepair({
    messages: buildMessages(candidate, fetchedContentText, maxContentChars, options.sourceEvidence),
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

  return useCasesWithTrustedSourceUrls(
    result.value.useCases,
    candidate,
    options.sourceEvidence,
  ).filter(isEligibleEnterpriseUseCase);
}
