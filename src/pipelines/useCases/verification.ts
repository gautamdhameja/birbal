// Purpose: Verifies extracted enterprise use cases against source-grounded evidence.
// Scope: Uses the original source URL and linked source-page evidence without web search.

import { load } from "cheerio";
import { z } from "zod";

import { AGENT } from "../../constants/agent.js";
import { MODEL_PROVIDERS } from "../../constants/model-providers.js";
import { HTTP } from "../../constants/runtime.js";
import { URL_TEXT } from "../../constants/url-text.js";
import { completeStructuredWithRepair } from "../../framework/llm/repair.js";
import type { ChatMessage, ModelClient, ModelCompleteOptions } from "../../framework/llm/types.js";
import { fetchPublicHttpWithRetry } from "../../framework/network/fetch.js";
import type { PublicHttpFetchOptions } from "../../framework/network/fetch.js";
import { buildHttpStatusError, readResponseText } from "../../http/client.js";
import {
  assertSafePublicHttpUrl,
  type HostResolver,
  unsafeHttpUrlErrorMessage,
} from "../../http/url.js";
import { logger } from "../../logging/logger.js";
import { getDefaultModelClient } from "../../model-providers/default.js";
import { extractUrlText } from "../../url-text/extract.js";
import { normalizeUrl } from "../../utils/url.js";
import type { EnterpriseUseCase } from "./schema.js";

type CompleteFn = ModelClient["complete"];

const USE_CASE_VERIFICATION_FIELDS = [
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
] as const;

export type UseCaseVerificationField = (typeof USE_CASE_VERIFICATION_FIELDS)[number];

const UseCaseVerificationFieldSchema = z.enum(USE_CASE_VERIFICATION_FIELDS);
const useCaseVerificationFieldSet = new Set<string>(USE_CASE_VERIFICATION_FIELDS);

function normalizeUnsupportedFields(value: unknown): UseCaseVerificationField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter(
        (field): field is UseCaseVerificationField =>
          typeof field === "string" && useCaseVerificationFieldSet.has(field),
      ),
    ),
  );
}

export const EnterpriseUseCaseVerificationSchema = z
  .object({
    verified: z.boolean(),
    confidenceScore: z.number().min(1).max(5),
    unsupportedFields: z.preprocess(
      normalizeUnsupportedFields,
      z.array(UseCaseVerificationFieldSchema),
    ),
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
  promptSourceMaxChars?: number;
  promptLinkedMaxChars?: number;
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

type FetchedVerificationPage = VerificationEvidenceDocument & {
  html: string;
  links: string[];
};

const DEFAULT_MAX_LINKS = 2;
const DEFAULT_MAX_CHARS = 8_000;
const DEFAULT_PROMPT_SOURCE_MAX_CHARS = 5_000;
const DEFAULT_PROMPT_LINKED_MAX_CHARS = 1_500;
const MODEL_TEMPERATURE = 0;
const MODEL_MAX_TOKENS = 1_200;
const DEFAULT_MIN_VERIFICATION_CONFIDENCE_SCORE = 3;
export const ENTERPRISE_USE_CASE_VERIFIER_VERSION = "enterprise-use-case-verifier:v2";
const CRITICAL_UNSUPPORTED_FIELDS = new Set<UseCaseVerificationField>([
  "companyName",
  "aiSystemOrCapability",
]);
const UNKNOWN_FIELD_VALUES = new Set(["", "unknown", "n/a", "na", "not available"]);
const MATERIAL_VERIFICATION_FAILURE_PATTERNS = [
  /\bcannot be verified from (?:the )?(?:provided|supplied) (?:source|evidence|content|text)\b/i,
  /\bdoes not include any specific mention\b/i,
  /\bdoes not mention\b/i,
  /\bnot supported by (?:the )?(?:provided|supplied) (?:source|evidence|content|text)\b/i,
  /\bno evidence\b/i,
];
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
  const maxLinks = options.maxLinks ?? DEFAULT_MAX_LINKS;
  if (fallbackSourceText && maxLinks === 0) {
    return {
      source: {
        url: normalizeUrl(useCase.sourceUrl),
        title: useCase.sourceTitle,
        plainText: fallbackSourceText,
      },
      linkedEvidence: [],
    };
  }

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
        "verified=true only when evidence supports a named organization, AI capability, real workflow/process area, and deployment evidence or business outcome.",
        "Treat workflowAffected as a semantic summary label; exact wording is not required.",
        "Thin non-critical fields can still verify. Contradictory or material unsupported specifics must be listed in unsupportedFields.",
        "confidenceScore measures verification strength: 4-5 clear evidence, 3 real but thin details, 1-2 weak and verified must be false.",
        "Empty or unknown extracted fields do not count as unsupported.",
        `unsupportedFields may only contain these field names: ${USE_CASE_VERIFICATION_FIELDS.join(", ")}.`,
        "Reject framework, best-practices, methodology, launch, or measurement articles without a real workflow deployment.",
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
    `unsupportedFields must be an array containing only these valid extracted use-case field names: ${USE_CASE_VERIFICATION_FIELDS.join(", ")}.`,
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

function hasKnownValue(value: string): boolean {
  return !UNKNOWN_FIELD_VALUES.has(value.trim().toLowerCase());
}

function hasOnlyNonCriticalWorkflowLabelIssue(
  verification: EnterpriseUseCaseVerification,
): boolean {
  return (
    verification.unsupportedFields.length > 0 &&
    verification.unsupportedFields.every((field) => field === "workflowAffected")
  );
}

function hasMaterialVerificationFailureNotes(notes: string): boolean {
  return MATERIAL_VERIFICATION_FAILURE_PATTERNS.some((pattern) => pattern.test(notes));
}

function acceptedByWorkflowLabelPolicy(
  useCase: EnterpriseUseCase,
  verification: EnterpriseUseCaseVerification,
): boolean {
  return (
    !verification.verified &&
    hasOnlyNonCriticalWorkflowLabelIssue(verification) &&
    !hasMaterialVerificationFailureNotes(verification.notes) &&
    verification.evidenceLinks.length > 0 &&
    hasKnownValue(useCase.companyName) &&
    hasKnownValue(useCase.workflowAffected) &&
    hasKnownValue(useCase.aiSystemOrCapability) &&
    useCase.confidenceScore >= DEFAULT_MIN_VERIFICATION_CONFIDENCE_SCORE
  );
}

function normalizeVerificationForAcceptance(
  useCase: EnterpriseUseCase,
  verification: EnterpriseUseCaseVerification,
  minVerificationConfidenceScore: number,
): EnterpriseUseCaseVerification {
  if (!acceptedByWorkflowLabelPolicy(useCase, verification)) {
    return verification;
  }

  const confidenceScore = Math.max(
    minVerificationConfidenceScore,
    Math.min(useCase.confidenceScore, 3),
  );

  return {
    ...verification,
    verified: true,
    confidenceScore,
    notes: [
      "Accepted by workflow-label policy: the verifier only objected to the summarized workflow label, while the extracted use case has a named company, AI capability, source evidence, and sufficient extraction confidence.",
      `Original verifier notes: ${verification.notes}`,
    ].join(" "),
  };
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
      workflowAffected: useCase.workflowAffected,
      sourceUrl,
      verified: verification.verified,
      confidenceScore: verification.confidenceScore,
      minVerificationConfidenceScore,
      unsupportedFields: verification.unsupportedFields,
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
            workflowAffected: useCase.workflowAffected,
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
      const verification = normalizeVerificationForAcceptance(
        useCase,
        originalVerification,
        minVerificationConfidenceScore,
      );
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
