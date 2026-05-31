// Purpose: Implements the Birbal pipeline component: schema.
// Scope: Keeps app-specific pipeline behavior outside the generic framework.

import { z } from "zod";

const UNKNOWN_TEXT = "unknown";

const EXACT_GENERIC_COMPANY_NAMES = new Set([
  "businesses",
  "companies",
  "contact center organizations",
  "customers",
  "enterprise organizations",
  "enterprises",
  "industry leaders",
  "organizations",
  "teams",
  "users",
]);

const GENERIC_COMPANY_PATTERNS = [
  /\bany organization\b/i,
  /\borganizations? using\b/i,
  /\bcompanies using\b/i,
  /\benterprises using\b/i,
  /\bcustomers using\b/i,
  /\bteams using\b/i,
];

function normalizeTextField(value: unknown): string {
  if (Array.isArray(value)) {
    const normalizedItems = value
      .map((item) => normalizeTextField(item))
      .filter((item) => item !== UNKNOWN_TEXT);

    return normalizedItems.length > 0 ? normalizedItems.join(", ") : UNKNOWN_TEXT;
  }

  if (value === null || value === undefined) {
    return UNKNOWN_TEXT;
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  const text = String(value).trim();
  return text.length > 0 ? text : UNKNOWN_TEXT;
}

const EnterpriseUseCaseTextFieldSchema = z.preprocess(normalizeTextField, z.string().trim().min(1));

const EnterpriseUseCaseConfidenceScoreSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    return Number(value);
  }

  return value;
}, z.number().min(1).max(5));

function normalizeUseCaseRecord(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  if (record.confidenceScore !== undefined) {
    return record;
  }

  if (record.confidence_score !== undefined) {
    return {
      ...record,
      confidenceScore: record.confidence_score,
    };
  }

  if (record.confidence !== undefined) {
    return {
      ...record,
      confidenceScore: record.confidence,
    };
  }

  return record;
}

export const EnterpriseUseCaseSchema = z.preprocess(
  normalizeUseCaseRecord,
  z
    .object({
      id: EnterpriseUseCaseTextFieldSchema,
      companyName: EnterpriseUseCaseTextFieldSchema,
      industry: EnterpriseUseCaseTextFieldSchema,
      businessFunction: EnterpriseUseCaseTextFieldSchema,
      workflowAffected: EnterpriseUseCaseTextFieldSchema,
      workflowBefore: EnterpriseUseCaseTextFieldSchema,
      workflowAfter: EnterpriseUseCaseTextFieldSchema,
      aiSystemOrCapability: EnterpriseUseCaseTextFieldSchema,
      humanRoleChange: EnterpriseUseCaseTextFieldSchema,
      systemIntegrations: EnterpriseUseCaseTextFieldSchema,
      deploymentStage: EnterpriseUseCaseTextFieldSchema,
      roiMetric: EnterpriseUseCaseTextFieldSchema,
      businessOutcome: EnterpriseUseCaseTextFieldSchema,
      governanceOrRiskNotes: EnterpriseUseCaseTextFieldSchema,
      implementationDetails: EnterpriseUseCaseTextFieldSchema,
      sourceTitle: EnterpriseUseCaseTextFieldSchema,
      sourceUrl: EnterpriseUseCaseTextFieldSchema,
      sourceName: EnterpriseUseCaseTextFieldSchema,
      publishDate: EnterpriseUseCaseTextFieldSchema,
      evidenceSummary: EnterpriseUseCaseTextFieldSchema,
      confidenceScore: EnterpriseUseCaseConfidenceScoreSchema,
    })
    .strip(),
);

export type EnterpriseUseCase = z.infer<typeof EnterpriseUseCaseSchema>;

function isUnknown(value: string): boolean {
  return value.trim().toLowerCase() === UNKNOWN_TEXT;
}

function hasGenericCompanyName(value: string): boolean {
  if (isUnknown(value)) {
    return false;
  }

  const normalizedValue = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (EXACT_GENERIC_COMPANY_NAMES.has(normalizedValue)) {
    return true;
  }

  return GENERIC_COMPANY_PATTERNS.some((pattern) => pattern.test(value));
}

function hasConcreteText(value: string): boolean {
  return !isUnknown(value) && value.trim().length > 0;
}

export type EnterpriseUseCaseEligibility = {
  eligible: boolean;
  reason?: string;
};

export function assessEnterpriseUseCaseEligibility(
  useCase: EnterpriseUseCase,
): EnterpriseUseCaseEligibility {
  if (hasGenericCompanyName(useCase.companyName)) {
    return {
      eligible: false,
      reason: "companyName is a generic audience label, not a real company or organization",
    };
  }

  if (!hasConcreteText(useCase.workflowAffected)) {
    return {
      eligible: false,
      reason: "workflowAffected is missing",
    };
  }

  if (!hasConcreteText(useCase.aiSystemOrCapability)) {
    return {
      eligible: false,
      reason: "aiSystemOrCapability is missing",
    };
  }

  return { eligible: true };
}

export function isEligibleEnterpriseUseCase(useCase: EnterpriseUseCase): boolean {
  return assessEnterpriseUseCaseEligibility(useCase).eligible;
}
