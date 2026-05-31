// Purpose: Verifies extracted enterprise use cases against source-grounded evidence.
// Scope: Uses the original source URL and linked source-page evidence without web search.

import { load } from "cheerio";
import { z } from "zod";

import { AGENT } from "../../constants/agent.js";
import { LLAMA } from "../../constants/llama.js";
import { HTTP } from "../../constants/runtime.js";
import { URL_TEXT } from "../../constants/url-text.js";
import { fetchPublicHttpWithRetry } from "../../framework/network/fetch.js";
import type { PublicHttpFetchOptions } from "../../framework/network/fetch.js";
import { completeStructuredWithRepair } from "../../framework/llm/repair.js";
import { buildHttpStatusError, readResponseText } from "../../http/client.js";
import {
  assertSafePublicHttpUrl,
  type HostResolver,
  unsafeHttpUrlErrorMessage,
} from "../../http/url.js";
import { llamaCppModelAdapter } from "../../llama/adapter.js";
import type { ChatMessage, CompleteOptions } from "../../llama/schema.js";
import { logger } from "../../logging/logger.js";
import { extractUrlText } from "../../url-text/extract.js";
import { normalizeUrl } from "../../utils/url.js";
import type { EnterpriseUseCase } from "./schema.js";

type CompleteFn = (messages: ChatMessage[], options?: CompleteOptions) => Promise<string>;

export type UseCaseVerificationField =
  | "companyName"
  | "businessFunction"
  | "workflowAffected"
  | "workflowBefore"
  | "workflowAfter"
  | "aiSystemOrCapability"
  | "humanRoleChange"
  | "systemIntegrations"
  | "deploymentStage"
  | "roiMetric"
  | "businessOutcome"
  | "governanceOrRiskNotes"
  | "implementationDetails"
  | "evidenceSummary";

const UseCaseVerificationFieldSchema = z.enum([
  "companyName",
  "businessFunction",
  "workflowAffected",
  "workflowBefore",
  "workflowAfter",
  "aiSystemOrCapability",
  "humanRoleChange",
  "systemIntegrations",
  "deploymentStage",
  "roiMetric",
  "businessOutcome",
  "governanceOrRiskNotes",
  "implementationDetails",
  "evidenceSummary",
]);

export const EnterpriseUseCaseVerificationSchema = z
  .object({
    verified: z.boolean(),
    confidenceScore: z.number().min(1).max(5),
    unsupportedFields: z.array(UseCaseVerificationFieldSchema),
    evidenceLinks: z.array(z.string()),
    notes: z.string(),
  })
  .strip();

export type EnterpriseUseCaseVerification = z.infer<typeof EnterpriseUseCaseVerificationSchema>;

export type VerifiedEnterpriseUseCase = EnterpriseUseCase & {
  verification: EnterpriseUseCaseVerification;
};

export type VerificationEvidenceDocument = {
  url: string;
  title: string;
  plainText: string;
};

export type VerificationEvidence = {
  source: VerificationEvidenceDocument;
  linkedEvidence: VerificationEvidenceDocument[];
};

export type FetchVerificationEvidenceOptions = {
  maxLinks?: number;
  maxChars?: number;
  sourceTextByUrl?: ReadonlyMap<string, string>;
  fetchPolicy?: {
    hostResolver?: HostResolver;
    transport?(
      input: string | URL,
      init?: RequestInit,
      options?: PublicHttpFetchOptions,
    ): Promise<Response>;
    timeoutMs?: number;
    retries?: number;
    minTimeoutMs?: number;
    maxTimeoutMs?: number;
    jitter?: boolean;
  };
};

export type VerifyEnterpriseUseCaseOptions = Pick<CompleteOptions, "traceId" | "traceLabel"> & {
  completeFn?: CompleteFn;
};

export type VerifySelectedEnterpriseUseCasesOptions = VerifyEnterpriseUseCaseOptions &
  FetchVerificationEvidenceOptions & {
    fetchEvidence?(
      useCase: EnterpriseUseCase,
      options: FetchVerificationEvidenceOptions,
    ): Promise<VerificationEvidence>;
    minVerificationConfidenceScore?: number;
  };

type FetchedVerificationPage = VerificationEvidenceDocument & {
  html: string;
  links: string[];
};

const DEFAULT_MAX_LINKS = 2;
const DEFAULT_MAX_CHARS = 12_000;
const MODEL_TEMPERATURE = 0;
const MODEL_MAX_TOKENS = 1_200;
const DEFAULT_MIN_VERIFICATION_CONFIDENCE_SCORE = 3;
const CRITICAL_UNSUPPORTED_FIELDS = new Set<UseCaseVerificationField>([
  "companyName",
  "workflowAffected",
  "aiSystemOrCapability",
]);
const VERIFICATION_LINK_TERMS = [
  "ai",
  "agent",
  "automation",
  "case",
  "customer",
  "deployment",
  "genai",
  "generative",
  "story",
  "workflow",
];
const NOISY_LINK_TERMS = [
  "careers",
  "contact",
  "cookie",
  "facebook",
  "instagram",
  "legal",
  "linkedin",
  "login",
  "privacy",
  "subscribe",
  "terms",
  "twitter",
  "youtube",
];
const HTML_CONTENT_TYPES = ["", "text/html", "application/xhtml+xml", "text/plain"] as const;
const MAX_REDIRECTS = 5;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}\n[truncated]`;
}

function sourceTextForUrl(
  url: string,
  sourceTextByUrl: ReadonlyMap<string, string> | undefined,
): string | undefined {
  return sourceTextByUrl?.get(normalizeUrl(url));
}

function contentType(response: Response): string {
  return response.headers.get(HTTP.CONTENT_TYPE_HEADER)?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isSupportedContentType(value: string): boolean {
  return HTML_CONTENT_TYPES.some((supported) => supported === value);
}

function linkScore({
  href,
  sourceHost,
  text,
  useCase,
}: {
  href: string;
  sourceHost: string;
  text: string;
  useCase: EnterpriseUseCase;
}): number {
  const parsed = new URL(href);
  const haystack = `${text} ${href}`.toLowerCase();
  if (NOISY_LINK_TERMS.some((term) => haystack.includes(term))) {
    return -10;
  }

  let score = parsed.hostname === sourceHost ? 5 : 0;
  for (const term of VERIFICATION_LINK_TERMS) {
    if (haystack.includes(term)) {
      score += 2;
    }
  }

  for (const value of [useCase.companyName, useCase.workflowAffected, useCase.businessFunction]) {
    const normalizedValue = normalizeWhitespace(value).toLowerCase();
    if (normalizedValue && normalizedValue !== "unknown" && haystack.includes(normalizedValue)) {
      score += 3;
    }
  }

  return score;
}

export function extractVerificationLinks(
  html: string,
  baseUrl: string,
  useCase: EnterpriseUseCase,
  maxLinks = DEFAULT_MAX_LINKS,
): string[] {
  const $ = load(html);
  const sourceHost = new URL(baseUrl).hostname;
  const seen = new Set<string>();
  const scoredLinks: Array<{ url: string; score: number }> = [];

  $("a[href]").each((_, element) => {
    const rawHref = $(element).attr("href")?.trim();
    if (!rawHref || rawHref.startsWith("#")) {
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawHref, baseUrl);
    } catch {
      return;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return;
    }

    parsed.hash = "";
    const normalized = normalizeUrl(parsed.toString());
    if (normalized === normalizeUrl(baseUrl) || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    const score = linkScore({
      href: normalized,
      sourceHost,
      text: normalizeWhitespace($(element).text()),
      useCase,
    });
    if (score > 0) {
      scoredLinks.push({ url: normalized, score });
    }
  });

  return scoredLinks
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url))
    .slice(0, maxLinks)
    .map((link) => link.url);
}

async function fetchVerificationResponse(
  url: string,
  options: FetchVerificationEvidenceOptions,
  redirectCount = 0,
): Promise<{ response: Response; finalUrl: string }> {
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error(URL_TEXT.ERRORS.TOO_MANY_REDIRECTS);
  }

  await assertSafePublicHttpUrl(url, options.fetchPolicy?.hostResolver);
  const transport = options.fetchPolicy?.transport ?? fetchPublicHttpWithRetry;
  const response = await transport(
    url,
    {
      redirect: "manual",
      headers: {
        accept: "text/html, application/xhtml+xml, text/plain;q=0.9, */*;q=0.8",
        [HTTP.USER_AGENT_HEADER]: HTTP.USER_AGENT,
      },
    },
    {
      timeoutMs: options.fetchPolicy?.timeoutMs,
      retries: options.fetchPolicy?.retries,
      minTimeoutMs: options.fetchPolicy?.minTimeoutMs,
      maxTimeoutMs: options.fetchPolicy?.maxTimeoutMs,
      jitter: options.fetchPolicy?.jitter,
      hostResolver: options.fetchPolicy?.hostResolver,
    },
  );

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) {
      return { response, finalUrl: url };
    }

    const nextUrl = new URL(location, url).toString();
    try {
      await assertSafePublicHttpUrl(nextUrl, options.fetchPolicy?.hostResolver);
    } catch {
      throw new Error(unsafeHttpUrlErrorMessage());
    }

    return fetchVerificationResponse(nextUrl, options, redirectCount + 1);
  }

  return { response, finalUrl: url };
}

async function fetchVerificationPage(
  url: string,
  useCase: EnterpriseUseCase,
  options: FetchVerificationEvidenceOptions,
): Promise<FetchedVerificationPage> {
  const { response, finalUrl } = await fetchVerificationResponse(url, options);
  const type = contentType(response);
  if (!response.ok) {
    throw await buildHttpStatusError("Verification fetch failed with HTTP", response);
  }

  if (!isSupportedContentType(type)) {
    throw new Error(`Unsupported verification content type: ${type || "unknown"}.`);
  }

  const html = await readResponseText(response);
  const extracted = extractUrlText(html, options.maxChars ?? DEFAULT_MAX_CHARS);

  return {
    url: normalizeUrl(finalUrl),
    title: extracted.title,
    plainText: extracted.plainText,
    html,
    links: extractVerificationLinks(html, finalUrl, useCase, options.maxLinks ?? DEFAULT_MAX_LINKS),
  };
}

export async function fetchEnterpriseUseCaseEvidence(
  useCase: EnterpriseUseCase,
  options: FetchVerificationEvidenceOptions = {},
): Promise<VerificationEvidence> {
  const fallbackSourceText = sourceTextForUrl(useCase.sourceUrl, options.sourceTextByUrl);
  let sourcePage: FetchedVerificationPage;
  try {
    sourcePage = await fetchVerificationPage(useCase.sourceUrl, useCase, options);
  } catch (error) {
    if (!fallbackSourceText) {
      throw error;
    }

    return {
      source: {
        url: normalizeUrl(useCase.sourceUrl),
        title: useCase.sourceTitle,
        plainText: fallbackSourceText,
      },
      linkedEvidence: [],
    };
  }

  const linkedEvidence: VerificationEvidenceDocument[] = [];

  for (const link of sourcePage.links) {
    try {
      const linkedPage = await fetchVerificationPage(link, useCase, {
        ...options,
        maxLinks: 0,
      });
      linkedEvidence.push({
        url: linkedPage.url,
        title: linkedPage.title,
        plainText: linkedPage.plainText,
      });
    } catch {
      // Verification links are supporting evidence only. Ignore failed links.
    }
  }

  return {
    source: {
      url: sourcePage.url,
      title: sourcePage.title,
      plainText: sourcePage.plainText || fallbackSourceText || "",
    },
    linkedEvidence,
  };
}

function renderUseCaseForVerification(useCase: EnterpriseUseCase): string {
  return JSON.stringify({
    companyName: useCase.companyName,
    businessFunction: useCase.businessFunction,
    workflowAffected: useCase.workflowAffected,
    workflowBefore: useCase.workflowBefore,
    workflowAfter: useCase.workflowAfter,
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

function renderEvidence(evidence: VerificationEvidence): string {
  const linked = evidence.linkedEvidence.map((document, index) => ({
    index: index + 1,
    url: document.url,
    title: document.title,
    plainText: truncate(document.plainText, 3_000),
  }));

  return JSON.stringify({
    source: {
      url: evidence.source.url,
      title: evidence.source.title,
      plainText: truncate(evidence.source.plainText, 8_000),
    },
    linkedEvidence: linked,
  });
}

function buildVerificationMessages(
  useCase: EnterpriseUseCase,
  evidence: VerificationEvidence,
): ChatMessage[] {
  return [
    {
      role: AGENT.ROLES.SYSTEM,
      content: [
        "You verify extracted enterprise AI use cases against source-grounded evidence.",
        "Use only the provided source page and linked evidence. Do not use web search or outside knowledge.",
        "Return exactly one valid JSON object and nothing else.",
        "Do not include Markdown, code fences, comments, or prose outside JSON.",
        "Mark verified true only when the evidence supports a concrete real enterprise workflow using AI.",
        "A concrete use case must have a supported workflow, supported AI capability, and supported organization or deployment context.",
        "confidenceScore is the strength of this verification, not the attractiveness of the use case.",
        "Use confidenceScore 4 or 5 only when the source evidence clearly supports the company, workflow, AI capability, deployment context, and outcome.",
        "Use confidenceScore 3 when the use case is real but some non-critical details are thin.",
        "Use confidenceScore 1 or 2 only when evidence is weak; if confidenceScore is 1 or 2, verified must be false.",
        "Empty or unknown extracted fields do not count as unsupported. Non-empty fields that are not supported by evidence must be listed in unsupportedFields.",
        "If the evidence is mainly a framework, best-practices guide, methodology article, product launch, or measurement article without a real workflow deployment, mark verified false.",
        "Use semantic support. Exact wording is not required, but plausible inference is not enough.",
      ].join(" "),
    },
    {
      role: AGENT.ROLES.USER,
      content: [
        "Extracted use case:",
        renderUseCaseForVerification(useCase),
        "",
        "Evidence:",
        renderEvidence(evidence),
        "",
        "Return JSON with this exact shape:",
        JSON.stringify({
          verified: false,
          confidenceScore: 1,
          unsupportedFields: ["workflowAffected"],
          evidenceLinks: ["https://example.com/supporting-link"],
          notes: "Short explanation grounded in the provided evidence.",
        }),
      ].join("\n"),
    },
  ];
}

function buildVerificationRepairInstructions(): string {
  return [
    "Repair the enterprise use-case verification response.",
    "Return exactly one valid JSON object.",
    "The object must include verified, confidenceScore, unsupportedFields, evidenceLinks, and notes.",
    "verified must be boolean.",
    "confidenceScore must be a number from 1 to 5.",
    "unsupportedFields must be an array of valid extracted use-case field names.",
    "evidenceLinks must be an array of source-grounded URLs from the provided evidence.",
    "notes must be a concise string.",
  ].join(" ");
}

export async function verifyEnterpriseUseCase(
  useCase: EnterpriseUseCase,
  evidence: VerificationEvidence,
  options: VerifyEnterpriseUseCaseOptions = {},
): Promise<EnterpriseUseCaseVerification> {
  const result = await completeStructuredWithRepair({
    messages: buildVerificationMessages(useCase, evidence),
    schema: EnterpriseUseCaseVerificationSchema,
    completeFn: options.completeFn ?? llamaCppModelAdapter.complete,
    logger,
    repairInstructions: buildVerificationRepairInstructions(),
    completeOptions: {
      temperature: MODEL_TEMPERATURE,
      max_tokens: MODEL_MAX_TOKENS,
      traceId: options.traceId,
      traceLabel: options.traceLabel ?? "use_cases.verify_enterprise_use_case",
      response_format: {
        type: LLAMA.RESPONSE_FORMATS.JSON_OBJECT,
      },
    },
  });

  if (!result.ok) {
    return {
      verified: false,
      confidenceScore: 1,
      unsupportedFields: [],
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
  if (!verification.verified || verification.confidenceScore < minVerificationConfidenceScore) {
    return false;
  }

  return !verification.unsupportedFields.some((field) => CRITICAL_UNSUPPORTED_FIELDS.has(field));
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
      const verification = await verifyEnterpriseUseCase(useCase, evidence, options);
      if (isAcceptedEnterpriseUseCaseVerification(verification, minVerificationConfidenceScore)) {
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
