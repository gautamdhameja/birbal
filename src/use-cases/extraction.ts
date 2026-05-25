import { z } from "zod";

import { AGENT } from "../constants/agent.js";
import { LLAMA } from "../constants/llama.js";
import { USE_CASES } from "../constants/use-cases.js";
import { completeStructuredWithRepair } from "../framework/llm/repair.js";
import type { ChatMessage, CompleteOptions } from "../llama/schema.js";
import { logger } from "../logging/logger.js";
import type { FetchUrlTextResult } from "../url-text/client.js";
import { parseJson } from "../utils/json.js";
import { normalizeUrl } from "../utils/url.js";
import type { ProductionUseCase, UseCaseSearchCandidate } from "./types.js";

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const AcceptedExtractionSchema = z.strictObject({
  [USE_CASES.RESPONSE_FIELDS.ACCEPTED]: z.literal(true),
  [USE_CASES.RESPONSE_FIELDS.COMPANY]: z.string().trim().min(1),
  [USE_CASES.RESPONSE_FIELDS.WORKFLOW]: z.string().trim().min(1),
  [USE_CASES.RESPONSE_FIELDS.WHAT_AI_DOES]: z.string().trim().min(1),
  [USE_CASES.RESPONSE_FIELDS.PRODUCTION_EVIDENCE]: z.string().trim().min(1),
  [USE_CASES.RESPONSE_FIELDS.BUSINESS_METRIC]: z.string().trim().min(1),
  [USE_CASES.RESPONSE_FIELDS.SOURCE_LINK]: z.url().refine(isHttpUrl, {
    message: "sourceLink must use http or https.",
  }),
  [USE_CASES.RESPONSE_FIELDS.PUBLISH_DATE]: z.string().trim().min(1),
  [USE_CASES.RESPONSE_FIELDS.WHY_THIS_MATTERS]: z.string().trim().min(1),
});

const RejectedExtractionSchema = z.strictObject({
  [USE_CASES.RESPONSE_FIELDS.ACCEPTED]: z.literal(false),
  [USE_CASES.RESPONSE_FIELDS.REJECTION_REASON]: z.string().trim().min(1),
});

const ExtractionResponseSchema = z.discriminatedUnion(USE_CASES.RESPONSE_FIELDS.ACCEPTED, [
  AcceptedExtractionSchema,
  RejectedExtractionSchema,
]);

export type ProductionUseCaseExtraction =
  | (ProductionUseCase & { accepted: true })
  | {
      accepted: false;
      rejectionReason: string;
    };
type ModelTraceOptions = Pick<CompleteOptions, "traceId" | "traceLabel">;

function sameNormalizedUrl(left: string, right: string | undefined): boolean {
  return right !== undefined && normalizeUrl(left) === normalizeUrl(right);
}

function sourceLinkMatchesCandidate(
  extraction: ProductionUseCaseExtraction,
  candidate: UseCaseSearchCandidate,
  fetched: FetchUrlTextResult,
): boolean {
  return (
    !extraction.accepted ||
    sameNormalizedUrl(extraction.sourceLink, candidate.url) ||
    sameNormalizedUrl(extraction.sourceLink, fetched.canonicalUrl)
  );
}

function publishDateIsUsable(extraction: ProductionUseCaseExtraction): boolean {
  return !extraction.accepted || !Number.isNaN(Date.parse(extraction.publishDate));
}

function validateAcceptedExtractionSource(
  extraction: ProductionUseCaseExtraction,
  candidate: UseCaseSearchCandidate,
  fetched: FetchUrlTextResult,
): ProductionUseCaseExtraction {
  if (!extraction.accepted) {
    return extraction;
  }

  if (!sourceLinkMatchesCandidate(extraction, candidate, fetched)) {
    return {
      accepted: false,
      rejectionReason: "Extracted source link did not match the fetched source.",
    };
  }

  if (!publishDateIsUsable(extraction)) {
    return {
      accepted: false,
      rejectionReason: "Extracted publish date was not parseable.",
    };
  }

  return extraction;
}

function truncatePromptText(value: string | undefined, maxChars: number): string | undefined {
  if (!value || value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n\n[truncated ${value.length - maxChars} characters]`;
}

function renderSearchCandidate(candidate: UseCaseSearchCandidate): string {
  return JSON.stringify({
    title: candidate.title,
    url: candidate.url,
    description: truncatePromptText(
      candidate.description,
      USE_CASES.MAX_SEARCH_RESULT_DESCRIPTION_PROMPT_CHARS,
    ),
    publishedAt: candidate.publishedAt,
    sourceName: candidate.sourceName,
    query: candidate.query,
  });
}

function renderFetchedContent(fetched: FetchUrlTextResult): string {
  return JSON.stringify({
    title: fetched.title,
    canonicalUrl: fetched.canonicalUrl,
    detectedPaywall: fetched.detectedPaywall,
    contentLength: fetched.contentLength,
    plainText: truncatePromptText(fetched.plainText, USE_CASES.MAX_FETCHED_CONTENT_PROMPT_CHARS),
  });
}

function acceptedResponseShape(sourceLink: string): Record<string, unknown> {
  return {
    [USE_CASES.RESPONSE_FIELDS.ACCEPTED]: true,
    [USE_CASES.RESPONSE_FIELDS.COMPANY]: "named company",
    [USE_CASES.RESPONSE_FIELDS.WORKFLOW]: "real enterprise workflow",
    [USE_CASES.RESPONSE_FIELDS.WHAT_AI_DOES]: "what the AI system does in the workflow",
    [USE_CASES.RESPONSE_FIELDS.PRODUCTION_EVIDENCE]:
      "evidence of live deployment, rollout, or production usage",
    [USE_CASES.RESPONSE_FIELDS.BUSINESS_METRIC]: "concrete business or operational outcome",
    [USE_CASES.RESPONSE_FIELDS.SOURCE_LINK]: sourceLink,
    [USE_CASES.RESPONSE_FIELDS.PUBLISH_DATE]:
      "publish date from the source or search result, not today's date",
    [USE_CASES.RESPONSE_FIELDS.WHY_THIS_MATTERS]:
      "why this matters for enterprise AI workflow redesign",
  };
}

function rejectedResponseShape(): Record<string, unknown> {
  return {
    [USE_CASES.RESPONSE_FIELDS.ACCEPTED]: false,
    [USE_CASES.RESPONSE_FIELDS.REJECTION_REASON]: "specific missing requirement",
  };
}

function renderResponseShape(candidate: UseCaseSearchCandidate): string {
  return [
    JSON.stringify(acceptedResponseShape(candidate.url)),
    "",
    "If any required evidence is missing, return:",
    JSON.stringify(rejectedResponseShape()),
  ].join("\n");
}

function buildExtractionPrompt(
  candidate: UseCaseSearchCandidate,
  fetched: FetchUrlTextResult,
): string {
  return [
    `${USE_CASES.USER_PROMPT_LABELS.SEARCH_RESULT}:`,
    renderSearchCandidate(candidate),
    "",
    `${USE_CASES.USER_PROMPT_LABELS.FETCHED_CONTENT}:`,
    renderFetchedContent(fetched),
    "",
    `${USE_CASES.USER_PROMPT_LABELS.RESPONSE_SHAPE}:`,
    renderResponseShape(candidate),
  ].join("\n");
}

export function parseProductionUseCaseExtraction(raw: string): ProductionUseCaseExtraction {
  const parsed = ExtractionResponseSchema.safeParse(parseJson(raw));
  if (!parsed.success) {
    throw new Error(`${USE_CASES.ERRORS.INVALID_EXTRACTION} ${parsed.error.message}`);
  }

  return parsed.data;
}

function buildRepairPrompt(candidate: UseCaseSearchCandidate): string {
  return [
    USE_CASES.REPAIR_PROMPT_INTRO,
    "",
    `${USE_CASES.USER_PROMPT_LABELS.RESPONSE_SHAPE}:`,
    renderResponseShape(candidate),
  ].join("\n");
}

export async function extractProductionUseCase(
  candidate: UseCaseSearchCandidate,
  fetched: FetchUrlTextResult,
  traceOptions: ModelTraceOptions = {},
): Promise<ProductionUseCaseExtraction> {
  const messages: ChatMessage[] = [
    {
      role: AGENT.ROLES.SYSTEM,
      content: USE_CASES.SYSTEM_PROMPT,
    },
    {
      role: AGENT.ROLES.USER,
      content: buildExtractionPrompt(candidate, fetched),
    },
  ];
  const result = await completeStructuredWithRepair({
    messages,
    schema: ExtractionResponseSchema,
    repairInstructions: buildRepairPrompt(candidate),
    completeOptions: {
      temperature: USE_CASES.MODEL_TEMPERATURE,
      max_tokens: USE_CASES.MAX_TOKENS,
      ...traceOptions,
      traceLabel: traceOptions.traceLabel ?? "use_cases.extract_production_use_case",
      response_format: {
        type: LLAMA.RESPONSE_FORMATS.JSON_OBJECT,
      },
    },
  });
  if (result.ok) {
    return validateAcceptedExtractionSource(result.value, candidate, fetched);
  }

  logger.warn(
    {
      event: "use_cases.extraction.rejected_after_parse_failures",
      traceId: traceOptions.traceId,
      traceLabel: traceOptions.traceLabel,
      candidateUrl: candidate.url,
      candidateTitle: candidate.title,
      error: result.error.message,
      modelParseError: result.error,
    },
    "rejecting production use case after repeated invalid model JSON",
  );

  return {
    accepted: false,
    rejectionReason: USE_CASES.EXTRACTION_PARSE_FAILURE_REJECTION_REASON,
  };
}
