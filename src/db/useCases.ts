// Purpose: Implements the SQLite persistence module: use Cases.
// Scope: Owns storage access for one persisted data shape.

import { createHash } from "node:crypto";

import { DATABASE } from "../constants/database.js";
import { EnterpriseUseCaseSchema, type EnterpriseUseCase } from "../pipelines/useCases/schema.js";
import { normalizeUrl } from "../utils/url.js";
import { assertValidLimit, getDb } from "./items.js";

export type StoredEnterpriseUseCase = EnterpriseUseCase & {
  runId?: string;
  createdAt: string;
  rawJson: unknown;
};

export type EnterpriseUseCaseStorageInput = EnterpriseUseCase & {
  runId?: string;
  rawJson?: unknown;
};

type UseCaseRow = {
  id: string;
  run_id: string | null;
  company_name: string;
  industry: string;
  business_function: string;
  ai_system_or_capability: string;
  human_role_change: string;
  system_integrations: string;
  deployment_stage: string;
  roi_metric: string;
  business_outcome: string;
  governance_or_risk_notes: string;
  implementation_details: string;
  source_title: string;
  source_url: string;
  source_name: string;
  publish_date: string;
  evidence_summary: string;
  confidence_score: number;
  created_at: string;
  raw_json: string;
};

function parseRawJson(rawJson: string): unknown {
  try {
    return JSON.parse(rawJson);
  } catch {
    return rawJson;
  }
}

function useCaseFromRow(row: UseCaseRow): StoredEnterpriseUseCase {
  return {
    id: row.id,
    ...(row.run_id ? { runId: row.run_id } : {}),
    companyName: row.company_name,
    industry: row.industry,
    businessFunction: row.business_function,
    aiSystemOrCapability: row.ai_system_or_capability,
    humanRoleChange: row.human_role_change,
    systemIntegrations: row.system_integrations,
    deploymentStage: row.deployment_stage,
    roiMetric: row.roi_metric,
    businessOutcome: row.business_outcome,
    governanceOrRiskNotes: row.governance_or_risk_notes,
    implementationDetails: row.implementation_details,
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
    sourceName: row.source_name,
    publishDate: row.publish_date,
    evidenceSummary: row.evidence_summary,
    confidenceScore: row.confidence_score,
    createdAt: row.created_at,
    rawJson: parseRawJson(row.raw_json),
  };
}

function persistentUseCaseId(useCase: EnterpriseUseCase): string {
  const dedupeKey = [
    normalizeUrl(useCase.sourceUrl),
    useCase.companyName.trim(),
    useCase.aiSystemOrCapability.trim(),
  ].join("|");
  const hash = createHash("sha256").update(dedupeKey).digest("hex").slice(0, 16);

  return `use-case:${hash}`;
}

export function upsertUseCase(useCase: EnterpriseUseCaseStorageInput): void {
  const { rawJson, runId, ...enterpriseUseCase } = useCase;
  const parsedUseCase = EnterpriseUseCaseSchema.parse(enterpriseUseCase);
  const normalizedUseCase = {
    ...parsedUseCase,
    sourceUrl: normalizeUrl(parsedUseCase.sourceUrl),
  };

  getDb()
    .prepare(DATABASE.SQL.UPSERT_USE_CASE)
    .run({
      id: persistentUseCaseId(normalizedUseCase),
      runId: runId ?? null,
      companyName: normalizedUseCase.companyName,
      industry: normalizedUseCase.industry,
      businessFunction: normalizedUseCase.businessFunction,
      aiSystemOrCapability: normalizedUseCase.aiSystemOrCapability,
      humanRoleChange: normalizedUseCase.humanRoleChange,
      systemIntegrations: normalizedUseCase.systemIntegrations,
      deploymentStage: normalizedUseCase.deploymentStage,
      roiMetric: normalizedUseCase.roiMetric,
      businessOutcome: normalizedUseCase.businessOutcome,
      governanceOrRiskNotes: normalizedUseCase.governanceOrRiskNotes,
      implementationDetails: normalizedUseCase.implementationDetails,
      sourceTitle: normalizedUseCase.sourceTitle,
      sourceUrl: normalizedUseCase.sourceUrl,
      sourceName: normalizedUseCase.sourceName,
      publishDate: normalizedUseCase.publishDate,
      evidenceSummary: normalizedUseCase.evidenceSummary,
      confidenceScore: normalizedUseCase.confidenceScore,
      rawJson: JSON.stringify(rawJson ?? normalizedUseCase),
    });
}

export function listRecentUseCases(limit: number): StoredEnterpriseUseCase[] {
  assertValidLimit(limit);

  const rows = getDb().prepare(DATABASE.SQL.LIST_RECENT_USE_CASES).all(limit) as UseCaseRow[];

  return rows.map(useCaseFromRow);
}

export function listUseCasesByRun(runId: string): StoredEnterpriseUseCase[] {
  const rows = getDb().prepare(DATABASE.SQL.LIST_USE_CASES_BY_RUN).all(runId) as UseCaseRow[];

  return rows.map(useCaseFromRow);
}
