import { z } from "zod";

import { AGENT } from "../constants/agent.js";
import { LLAMA } from "../constants/llama.js";
import { USE_CASES } from "../constants/use-cases.js";
import { complete } from "../llama/client.js";
import type { ChatMessage } from "../llama/schema.js";
import type { FetchUrlTextResult } from "../url-text/client.js";
import { parseJson } from "../utils/json.js";
import type { ProductionUseCase, UseCaseSearchCandidate } from "./types.js";

const AcceptedExtractionSchema = z.strictObject({
  [USE_CASES.RESPONSE_FIELDS.ACCEPTED]: z.literal(true),
  [USE_CASES.RESPONSE_FIELDS.COMPANY]: z.string().trim().min(1),
  [USE_CASES.RESPONSE_FIELDS.WORKFLOW]: z.string().trim().min(1),
  [USE_CASES.RESPONSE_FIELDS.WHAT_AI_DOES]: z.string().trim().min(1),
  [USE_CASES.RESPONSE_FIELDS.PRODUCTION_EVIDENCE]: z.string().trim().min(1),
  [USE_CASES.RESPONSE_FIELDS.BUSINESS_METRIC]: z.string().trim().min(1),
  [USE_CASES.RESPONSE_FIELDS.SOURCE_LINK]: z.url(),
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

function renderSearchCandidate(candidate: UseCaseSearchCandidate): string {
  return JSON.stringify({
    title: candidate.title,
    url: candidate.url,
    description: candidate.description,
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
    plainText: fetched.plainText,
  });
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
    JSON.stringify({
      [USE_CASES.RESPONSE_FIELDS.ACCEPTED]: true,
      [USE_CASES.RESPONSE_FIELDS.COMPANY]: "named company",
      [USE_CASES.RESPONSE_FIELDS.WORKFLOW]: "real enterprise workflow",
      [USE_CASES.RESPONSE_FIELDS.WHAT_AI_DOES]: "what the AI system does in the workflow",
      [USE_CASES.RESPONSE_FIELDS.PRODUCTION_EVIDENCE]:
        "evidence of live deployment, rollout, or production usage",
      [USE_CASES.RESPONSE_FIELDS.BUSINESS_METRIC]: "concrete business or operational outcome",
      [USE_CASES.RESPONSE_FIELDS.SOURCE_LINK]: candidate.url,
      [USE_CASES.RESPONSE_FIELDS.PUBLISH_DATE]:
        "publish date from the source or search result, not today's date",
      [USE_CASES.RESPONSE_FIELDS.WHY_THIS_MATTERS]:
        "why this matters for enterprise AI workflow redesign",
    }),
    "",
    "If any required evidence is missing, return:",
    JSON.stringify({
      [USE_CASES.RESPONSE_FIELDS.ACCEPTED]: false,
      [USE_CASES.RESPONSE_FIELDS.REJECTION_REASON]: "specific missing requirement",
    }),
  ].join("\n");
}

export function parseProductionUseCaseExtraction(raw: string): ProductionUseCaseExtraction {
  const parsed = ExtractionResponseSchema.safeParse(parseJson(raw));
  if (!parsed.success) {
    throw new Error(`${USE_CASES.ERRORS.INVALID_EXTRACTION} ${parsed.error.message}`);
  }

  return parsed.data;
}

export async function extractProductionUseCase(
  candidate: UseCaseSearchCandidate,
  fetched: FetchUrlTextResult,
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
  let lastError: unknown;

  for (let attempt = 1; attempt <= USE_CASES.MAX_ATTEMPTS; attempt += 1) {
    const raw = await complete(messages, {
      temperature: USE_CASES.MODEL_TEMPERATURE,
      max_tokens: USE_CASES.MAX_TOKENS,
      response_format: {
        type: LLAMA.RESPONSE_FORMATS.JSON_OBJECT,
      },
    });

    try {
      return parseProductionUseCaseExtraction(raw);
    } catch (error) {
      lastError = error;
      messages.push(
        {
          role: AGENT.ROLES.ASSISTANT,
          content: raw,
        },
        {
          role: AGENT.ROLES.USER,
          content: USE_CASES.REPAIR_PROMPT,
        },
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
