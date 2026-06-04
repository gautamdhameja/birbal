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
export const ENTERPRISE_USE_CASE_VERIFIER_VERSION = "enterprise-use-case-verifier:v6";
const HTML_CONTENT_TYPES = ["", "text/html", "application/xhtml+xml", "text/plain"] as const;
const MAX_REDIRECTS = 5;

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

export function extractVerificationLinks(
  html: string,
  baseUrl: string,
  maxLinks = DEFAULT_MAX_LINKS,
): string[] {
  const $ = load(html);
  const sourceHost = new URL(baseUrl).hostname;
  const seen = new Set<string>();
  const links: string[] = [];
  const contentAnchors = $("main a[href], article a[href], [role='main'] a[href]");
  const anchors = contentAnchors.length > 0 ? contentAnchors : $("a[href]");

  anchors.each((_, element) => {
    if (links.length >= maxLinks) {
      return false;
    }

    const anchor = $(element);
    if (
      anchor.closest("nav, header, footer, aside, form, dialog, [aria-hidden='true']").length > 0
    ) {
      return;
    }

    const rawHref = anchor.attr("href")?.trim();
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

    if (parsed.hostname !== sourceHost) {
      return;
    }

    parsed.hash = "";
    const normalized = normalizeUrl(parsed.toString());
    if (normalized === normalizeUrl(baseUrl) || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    links.push(normalized);
  });

  return links;
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
    links: extractVerificationLinks(html, finalUrl, options.maxLinks ?? DEFAULT_MAX_LINKS),
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
