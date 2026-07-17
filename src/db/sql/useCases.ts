// Purpose: Defines SQLite statements for the useCases database domain.
// Scope: Owns persisted enterprise use-case statements.

const USE_CASE_PROJECTION = `
        id,
        run_id,
        company_name,
        industry,
        business_function,
        ai_system_or_capability,
        human_role_change,
        system_integrations,
        deployment_stage,
        roi_metric,
        business_outcome,
        governance_or_risk_notes,
        implementation_details,
        source_title,
        source_url,
        source_name,
        publish_date,
        evidence_summary,
        confidence_score,
        created_at,
        raw_json`;

export const USE_CASE_SQL = {
  UPSERT_USE_CASE: `
      INSERT INTO use_cases (
        id,
        run_id,
        company_name,
        industry,
        business_function,
        ai_system_or_capability,
        human_role_change,
        system_integrations,
        deployment_stage,
        roi_metric,
        business_outcome,
        governance_or_risk_notes,
        implementation_details,
        source_title,
        source_url,
        source_name,
        publish_date,
        evidence_summary,
        confidence_score,
        raw_json
      )
      VALUES (
        @id,
        @runId,
        @companyName,
        @industry,
        @businessFunction,
        @aiSystemOrCapability,
        @humanRoleChange,
        @systemIntegrations,
        @deploymentStage,
        @roiMetric,
        @businessOutcome,
        @governanceOrRiskNotes,
        @implementationDetails,
        @sourceTitle,
        @sourceUrl,
        @sourceName,
        @publishDate,
        @evidenceSummary,
        @confidenceScore,
        @rawJson
      )
      ON CONFLICT(source_url, company_name, ai_system_or_capability) DO UPDATE SET
        id = excluded.id,
        run_id = excluded.run_id,
        industry = excluded.industry,
        business_function = excluded.business_function,
        ai_system_or_capability = excluded.ai_system_or_capability,
        human_role_change = excluded.human_role_change,
        system_integrations = excluded.system_integrations,
        deployment_stage = excluded.deployment_stage,
        roi_metric = excluded.roi_metric,
        business_outcome = excluded.business_outcome,
        governance_or_risk_notes = excluded.governance_or_risk_notes,
        implementation_details = excluded.implementation_details,
        source_title = excluded.source_title,
        source_name = excluded.source_name,
        publish_date = excluded.publish_date,
        evidence_summary = excluded.evidence_summary,
        confidence_score = excluded.confidence_score,
        raw_json = excluded.raw_json,
        updated_at = CURRENT_TIMESTAMP
    `,
  LIST_RECENT_USE_CASES: `
      SELECT
${USE_CASE_PROJECTION}
      FROM use_cases
      ORDER BY created_at DESC, company_name ASC, ai_system_or_capability ASC
      LIMIT ?
    `,
  LIST_USE_CASES_BY_RUN: `
      SELECT
${USE_CASE_PROJECTION}
      FROM use_cases
      WHERE run_id = ?
      ORDER BY created_at ASC, rowid ASC
    `,
} as const;
