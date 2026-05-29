// Purpose: Collects shared candidate constants.
// Scope: Re-exports framework fetch statuses and defines Birbal digest categories.

export { CONTENT_FETCH_STATUSES } from "../framework/content/status.js";

export const CANDIDATE_CATEGORIES = {
  ENTERPRISE_USE_CASE: "enterprise_use_case",
  WORKFLOW_REDESIGN: "workflow_redesign",
  AGENTIC_IMPLEMENTATION: "agentic_implementation",
  FDE_CUSTOMER_DEPLOYMENT: "fde_customer_deployment",
  GOVERNANCE_ROI: "governance_roi",
  REJECTED: "rejected",
} as const;
