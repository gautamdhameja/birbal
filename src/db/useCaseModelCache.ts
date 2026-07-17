// Purpose: Persists versioned enterprise use-case model outputs.
// Scope: Caches extraction and verification results so snapshot reprocessing avoids repeat LLM calls.

import { createHash } from "node:crypto";

import { z } from "zod";

import { DATABASE } from "../constants/database.js";
import { EnterpriseUseCaseSchema, type EnterpriseUseCase } from "../pipelines/useCases/schema.js";
import {
  EnterpriseUseCaseVerificationSchema,
  type EnterpriseUseCaseVerification,
} from "../pipelines/useCases/verification.js";
import { normalizeUrl } from "../utils/url.js";
import { getDb } from "./items.js";
import { decodePersistedJson } from "./json.js";

const EnterpriseUseCaseArraySchema = z.array(EnterpriseUseCaseSchema);

type ExtractionCacheRow = {
  use_cases_json: string;
};

type VerificationCacheRow = {
  verification_json: string;
};

export function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function cacheKey(parts: readonly string[]): string {
  return stableHash(parts.join("\0"));
}

export function contentHash(contentText: string): string {
  return stableHash(contentText);
}

export function useCaseHash(useCase: EnterpriseUseCase): string {
  return stableHash(
    JSON.stringify({
      companyName: useCase.companyName,
      aiSystemOrCapability: useCase.aiSystemOrCapability,
      businessOutcome: useCase.businessOutcome,
      sourceUrl: normalizeUrl(useCase.sourceUrl),
    }),
  );
}

export function evidenceHash(value: unknown): string {
  return stableHash(JSON.stringify(value));
}

export function getCachedUseCaseExtraction({
  contentHash: hashedContent,
  extractorVersion,
  sourceUrl,
}: {
  contentHash: string;
  extractorVersion: string;
  sourceUrl: string;
}): EnterpriseUseCase[] | null {
  const row = getDb()
    .prepare(DATABASE.SQL.GET_USE_CASE_EXTRACTION_CACHE)
    .get(normalizeUrl(sourceUrl), hashedContent, extractorVersion) as
    | ExtractionCacheRow
    | undefined;

  if (!row) {
    return null;
  }

  const parsed = EnterpriseUseCaseArraySchema.safeParse(
    decodePersistedJson(row.use_cases_json, undefined),
  );
  return parsed.success ? parsed.data : null;
}

export function upsertUseCaseExtractionCache({
  contentHash: hashedContent,
  extractorVersion,
  sourceUrl,
  useCases,
}: {
  contentHash: string;
  extractorVersion: string;
  sourceUrl: string;
  useCases: EnterpriseUseCase[];
}): void {
  const normalizedUrl = normalizeUrl(sourceUrl);
  getDb()
    .prepare(DATABASE.SQL.UPSERT_USE_CASE_EXTRACTION_CACHE)
    .run({
      cacheKey: cacheKey([normalizedUrl, hashedContent, extractorVersion]),
      sourceUrl: normalizedUrl,
      contentHash: hashedContent,
      extractorVersion,
      useCasesJson: JSON.stringify(EnterpriseUseCaseArraySchema.parse(useCases)),
    });
}

export function getCachedUseCaseVerification({
  evidenceHash: hashedEvidence,
  useCaseHash: hashedUseCase,
  verifierVersion,
}: {
  evidenceHash: string;
  useCaseHash: string;
  verifierVersion: string;
}): EnterpriseUseCaseVerification | null {
  const row = getDb()
    .prepare(DATABASE.SQL.GET_USE_CASE_VERIFICATION_CACHE)
    .get(hashedUseCase, hashedEvidence, verifierVersion) as VerificationCacheRow | undefined;

  if (!row) {
    return null;
  }

  const parsed = EnterpriseUseCaseVerificationSchema.safeParse(
    decodePersistedJson(row.verification_json, undefined),
  );
  return parsed.success ? parsed.data : null;
}

export function upsertUseCaseVerificationCache({
  evidenceHash: hashedEvidence,
  useCaseHash: hashedUseCase,
  verification,
  verifierVersion,
}: {
  evidenceHash: string;
  useCaseHash: string;
  verification: EnterpriseUseCaseVerification;
  verifierVersion: string;
}): void {
  getDb()
    .prepare(DATABASE.SQL.UPSERT_USE_CASE_VERIFICATION_CACHE)
    .run({
      cacheKey: cacheKey([hashedUseCase, hashedEvidence, verifierVersion]),
      useCaseHash: hashedUseCase,
      evidenceHash: hashedEvidence,
      verifierVersion,
      verificationJson: JSON.stringify(EnterpriseUseCaseVerificationSchema.parse(verification)),
    });
}
