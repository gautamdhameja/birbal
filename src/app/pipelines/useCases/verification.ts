// Purpose: Verifies extracted enterprise use cases against source-grounded evidence.
// Scope: Uses the original source URL and linked source-page evidence without web search.

import { z } from "zod";

import { AGENT } from "../../constants/agent.js";
import { MODEL_PROVIDERS } from "../../constants/model-providers.js";
import { completeStructuredWithRepair } from "../../../framework/llm/repair.js";
import type {
  ChatMessage,
  ModelClient,
  ModelCompleteOptions,
} from "../../../framework/llm/types.js";
import { logger } from "../../logging/logger.js";
import { getDefaultModelClient } from "../../model-providers/default.js";
import { normalizeUrl } from "../../utils/url.js";
import type { EnterpriseUseCase } from "./schema.js";
import {
  extractSourceEvidenceLinks,
  fetchSourceEvidence,
  type SourceEvidence,
  type SourceEvidenceDocument,
  type SourceEvidenceFetchPolicy,
} from "./sourceEvidence.js";

type CompleteFn = ModelClient["complete"];

export const EnterpriseUseCaseVerificationSchema = z
  .object({
    verified: z.boolean(),
    confidenceScore: z.number().min(1).max(5),
    evidenceLinks: z.array(z.string()),
    notes: z.string(),
  })
  .strip();

export type EnterpriseUseCaseVerification = z.infer<typeof EnterpriseUseCaseVerificationSchema>;

export type VerifiedEnterpriseUseCase = EnterpriseUseCase & {
  verification: EnterpriseUseCaseVerification;
};

export type VerificationEvidenceDocument = SourceEvidenceDocument;

export type VerificationEvidence = SourceEvidence;

export type FetchVerificationEvidenceOptions = {
  maxLinks?: number;
  maxChars?: number;
  promptSourceMaxChars?: number;
  promptLinkedMaxChars?: number;
  sourceTextByUrl?: ReadonlyMap<string, string>;
  fetchPolicy?: SourceEvidenceFetchPolicy;
};

export type VerifyEnterpriseUseCaseOptions = Pick<
  ModelCompleteOptions,
  "traceId" | "traceLabel"
> & {
  completeFn?: CompleteFn;
};

export type VerifySelectedEnterpriseUseCasesOptions = VerifyEnterpriseUseCaseOptions &
  FetchVerificationEvidenceOptions & {
    fetchEvidence?(
      useCase: EnterpriseUseCase,
      options: FetchVerificationEvidenceOptions,
    ): Promise<VerificationEvidence>;
    getCachedVerification?(
      useCase: EnterpriseUseCase,
      evidence: VerificationEvidence,
    ): EnterpriseUseCaseVerification | null;
    minVerificationConfidenceScore?: number;
    upsertVerificationCache?(
      useCase: EnterpriseUseCase,
      evidence: VerificationEvidence,
      verification: EnterpriseUseCaseVerification,
    ): void;
  };

const DEFAULT_MAX_LINKS = 2;
const DEFAULT_PROMPT_SOURCE_MAX_CHARS = 5_000;
const DEFAULT_PROMPT_LINKED_MAX_CHARS = 1_500;
const MODEL_TEMPERATURE = 0;
const MODEL_MAX_TOKENS = 1_200;
const DEFAULT_MIN_VERIFICATION_CONFIDENCE_SCORE = 3;
export const ENTERPRISE_USE_CASE_VERIFIER_VERSION = "enterprise-use-case-verifier:v6";

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}\n[truncated]`;
}

function sourceTextForUrl(
  url: string,
  sourceTextByUrl: ReadonlyMap<string, string> | undefined,
): string | undefined {
  return sourceTextByUrl?.get(normalizeUrl(url));
}

export function extractVerificationLinks(
  html: string,
  baseUrl: string,
  maxLinks = DEFAULT_MAX_LINKS,
): string[] {
  return extractSourceEvidenceLinks(html, baseUrl, maxLinks);
}

export async function fetchEnterpriseUseCaseEvidence(
  useCase: EnterpriseUseCase,
  options: FetchVerificationEvidenceOptions = {},
): Promise<VerificationEvidence> {
  const fallbackSourceText = sourceTextForUrl(useCase.sourceUrl, options.sourceTextByUrl);
  return fetchSourceEvidence(useCase.sourceUrl, {
    ...options,
    fallbackSourceText,
    fallbackSourceTitle: useCase.sourceTitle,
  });
}

function renderUseCaseForVerification(useCase: EnterpriseUseCase): string {
  return JSON.stringify({
    companyName: useCase.companyName,
    businessFunction: useCase.businessFunction,
    aiSystemOrCapability: useCase.aiSystemOrCapability,
    humanRoleChange: useCase.humanRoleChange,
    systemIntegrations: useCase.systemIntegrations,
    deploymentStage: useCase.deploymentStage,
    roiMetric: useCase.roiMetric,
    businessOutcome: useCase.businessOutcome,
    governanceOrRiskNotes: useCase.governanceOrRiskNotes,
    implementationDetails: useCase.implementationDetails,
    sourceUrl: useCase.sourceUrl,
    evidenceSummary: useCase.evidenceSummary,
  });
}

function renderEvidence(
  evidence: VerificationEvidence,
  promptSourceMaxChars = DEFAULT_PROMPT_SOURCE_MAX_CHARS,
  promptLinkedMaxChars = DEFAULT_PROMPT_LINKED_MAX_CHARS,
): string {
  const linked = evidence.linkedEvidence.map((document, index) => ({
    index: index + 1,
    url: document.url,
    title: document.title,
    plainText: truncate(document.plainText, promptLinkedMaxChars),
  }));

  return JSON.stringify({
    source: {
      url: evidence.source.url,
      title: evidence.source.title,
      plainText: truncate(evidence.source.plainText, promptSourceMaxChars),
    },
    linkedEvidence: linked,
  });
}

function buildVerificationMessages(
  useCase: EnterpriseUseCase,
  evidence: VerificationEvidence,
  options: Pick<FetchVerificationEvidenceOptions, "promptLinkedMaxChars" | "promptSourceMaxChars">,
): ChatMessage[] {
  return [
    {
      role: AGENT.ROLES.SYSTEM,
      content: [
        "You verify extracted enterprise AI use cases against source-grounded evidence.",
        "Use only the provided source and linked evidence. Do not use outside knowledge.",
        "Return exactly one valid JSON object and nothing else.",
        "Make a semantic judgment about whether this is a real, source-grounded enterprise AI use case worth publishing.",
        "Do not compare exact wording. Do not reject because extracted wording is broader, shorter, or phrased differently than the source.",
        "verified=true means the evidence supports the core story: an organization or enterprise team is using an AI capability in a concrete business or operational context.",
        "verified=false means the article does not actually support a real use case, is only generic advice/framework content, is hypothetical, or the extracted core story is materially contradicted.",
        "confidenceScore measures how strong the source grounding is: 5 strong and specific, 4 solid with minor gaps, 3 real but thin, 1-2 not publishable.",
        "Use notes to explain your judgment in plain language.",
      ].join(" "),
    },
    {
      role: AGENT.ROLES.USER,
      content: [
        "Extracted use case:",
        renderUseCaseForVerification(useCase),
        "",
        "Evidence:",
        renderEvidence(evidence, options.promptSourceMaxChars, options.promptLinkedMaxChars),
        "",
        "Return JSON with this exact shape:",
        JSON.stringify({
          verified: true,
          confidenceScore: 3,
          evidenceLinks: ["https://example.com/supporting-link"],
          notes:
            "The article supports the core enterprise AI use case, though some details are thin.",
        }),
      ].join("\n"),
    },
  ];
}

function buildVerificationRepairInstructions(): string {
  return [
    "Repair the enterprise use-case verification response.",
    "Return exactly one valid JSON object.",
    "The object must include verified, confidenceScore, evidenceLinks, and notes.",
    "verified must be boolean.",
    "confidenceScore must be a number from 1 to 5.",
    "evidenceLinks must be an array of source-grounded URLs from the provided evidence.",
    "notes must be a concise string.",
  ].join(" ");
}

export async function verifyEnterpriseUseCase(
  useCase: EnterpriseUseCase,
  evidence: VerificationEvidence,
  options: VerifyEnterpriseUseCaseOptions &
    Pick<FetchVerificationEvidenceOptions, "promptLinkedMaxChars" | "promptSourceMaxChars"> = {},
): Promise<EnterpriseUseCaseVerification> {
  const result = await completeStructuredWithRepair({
    messages: buildVerificationMessages(useCase, evidence, options),
    schema: EnterpriseUseCaseVerificationSchema,
    completeFn: options.completeFn ?? getDefaultModelClient().complete,
    logger,
    repairInstructions: buildVerificationRepairInstructions(),
    completeOptions: {
      temperature: MODEL_TEMPERATURE,
      maxOutputTokens: MODEL_MAX_TOKENS,
      traceId: options.traceId,
      traceLabel: options.traceLabel ?? "use_cases.verify_enterprise_use_case",
      response_format: {
        type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT,
      },
    },
  });

  if (!result.ok) {
    return {
      verified: false,
      confidenceScore: 1,
      evidenceLinks: [],
      notes: result.error.message,
    };
  }

  return result.value;
}

export function isAcceptedEnterpriseUseCaseVerification(
  verification: EnterpriseUseCaseVerification,
  minVerificationConfidenceScore = DEFAULT_MIN_VERIFICATION_CONFIDENCE_SCORE,
): boolean {
  return verification.verified && verification.confidenceScore >= minVerificationConfidenceScore;
}

function logVerificationDecision({
  accepted,
  minVerificationConfidenceScore,
  originalVerification,
  sourceUrl,
  useCase,
  verification,
}: {
  accepted: boolean;
  minVerificationConfidenceScore: number;
  originalVerification?: EnterpriseUseCaseVerification;
  sourceUrl: string;
  useCase: EnterpriseUseCase;
  verification: EnterpriseUseCaseVerification;
}): void {
  logger.info(
    {
      event: "pipeline.use_cases.verification_decision",
      accepted,
      companyName: useCase.companyName,
      sourceUrl,
      verified: verification.verified,
      confidenceScore: verification.confidenceScore,
      minVerificationConfidenceScore,
      evidenceLinkCount: verification.evidenceLinks.length,
      notes: verification.notes,
      policyAdjusted:
        originalVerification !== undefined &&
        (originalVerification.verified !== verification.verified ||
          originalVerification.confidenceScore !== verification.confidenceScore ||
          originalVerification.notes !== verification.notes),
      ...(originalVerification
        ? {
            originalVerified: originalVerification.verified,
            originalConfidenceScore: originalVerification.confidenceScore,
          }
        : {}),
    },
    "use-case verification decision",
  );
}

export async function verifySelectedEnterpriseUseCases(
  useCases: readonly EnterpriseUseCase[],
  options: VerifySelectedEnterpriseUseCasesOptions = {},
): Promise<VerifiedEnterpriseUseCase[]> {
  const fetchEvidence = options.fetchEvidence ?? fetchEnterpriseUseCaseEvidence;
  const verifiedUseCases: VerifiedEnterpriseUseCase[] = [];
  const minVerificationConfidenceScore =
    options.minVerificationConfidenceScore ?? DEFAULT_MIN_VERIFICATION_CONFIDENCE_SCORE;

  for (const useCase of useCases) {
    try {
      const evidence = await fetchEvidence(useCase, options);
      const cachedVerification = options.getCachedVerification?.(useCase, evidence) ?? null;
      if (cachedVerification) {
        logger.debug(
          {
            event: "pipeline.use_cases.verification_cache_hit",
            companyName: useCase.companyName,
            sourceUrl: useCase.sourceUrl,
          },
          "use-case verification cache hit",
        );
      }
      const originalVerification =
        cachedVerification ?? (await verifyEnterpriseUseCase(useCase, evidence, options));
      if (!cachedVerification) {
        options.upsertVerificationCache?.(useCase, evidence, originalVerification);
      }
      const verification = originalVerification;
      const accepted = isAcceptedEnterpriseUseCaseVerification(
        verification,
        minVerificationConfidenceScore,
      );
      logVerificationDecision({
        accepted,
        minVerificationConfidenceScore,
        originalVerification,
        sourceUrl: useCase.sourceUrl,
        useCase,
        verification,
      });

      if (accepted) {
        verifiedUseCases.push({
          ...useCase,
          verification,
        });
      }
    } catch (error) {
      logger.warn(
        {
          event: "pipeline.use_cases.verification_failed",
          sourceUrl: useCase.sourceUrl,
          error: error instanceof Error ? error.message : String(error),
        },
        "use-case verification failed",
      );
    }
  }

  return verifiedUseCases;
}
