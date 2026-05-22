export const CONTENT_FETCH_STATUSES = {
  NOT_FETCHED: "not_fetched",
  FETCHED: "fetched",
  FAILED: "failed",
  PAYWALLED: "paywalled",
} as const;

export const CANDIDATE_CATEGORIES = {
  ENTERPRISE_USE_CASE: "enterprise_use_case",
  WORKFLOW_REDESIGN: "workflow_redesign",
  AGENTIC_IMPLEMENTATION: "agentic_implementation",
  FDE_CUSTOMER_DEPLOYMENT: "fde_customer_deployment",
  GOVERNANCE_ROI: "governance_roi",
  REJECTED: "rejected",
} as const;
