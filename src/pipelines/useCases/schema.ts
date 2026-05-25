import { z } from "zod";

function normalizeTextField(value: unknown): string {
  if (Array.isArray(value)) {
    const normalizedItems = value
      .map((item) => normalizeTextField(item))
      .filter((item) => item !== "unknown");

    return normalizedItems.length > 0 ? normalizedItems.join(", ") : "unknown";
  }

  if (value === null || value === undefined) {
    return "unknown";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  const text = String(value).trim();
  return text.length > 0 ? text : "unknown";
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
