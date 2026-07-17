import { z } from "zod";

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
      .filter((item) => item.trim().length > 0);

    return normalizedItems.join(", ");
  }

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  const text = String(value).trim();
  return text;
}

const EnterpriseUseCaseTextFieldSchema = z.preprocess(normalizeTextField, z.string().trim());

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

export function isMissingEnterpriseUseCaseText(value: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  return (
    normalizedValue === "" ||
    normalizedValue === "unknown" ||
    normalizedValue === "n/a" ||
    normalizedValue === "na" ||
    normalizedValue === "not available" ||
    normalizedValue === "not stated" ||
    normalizedValue === "unclear" ||
    normalizedValue === "none"
  );
}

function hasGenericCompanyName(value: string): boolean {
  if (isMissingEnterpriseUseCaseText(value)) {
    return false;
  }

  const normalizedValue = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (EXACT_GENERIC_COMPANY_NAMES.has(normalizedValue)) {
    return true;
  }

  return GENERIC_COMPANY_PATTERNS.some((pattern) => pattern.test(value));
}

function hasConcreteText(value: string): boolean {
  return !isMissingEnterpriseUseCaseText(value);
}

export function hasNamedEnterpriseCompany(useCase: EnterpriseUseCase): boolean {
  return (
    !isMissingEnterpriseUseCaseText(useCase.companyName) &&
    !hasGenericCompanyName(useCase.companyName)
  );
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
