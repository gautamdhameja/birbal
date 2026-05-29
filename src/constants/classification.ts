// Purpose: Collects shared classification constants.
// Scope: Avoids scattering repeated literals across runtime modules.

export const CLASSIFICATION = {
  MODEL_TEMPERATURE: 0,
  MAX_TOKENS: 200,
  HARD_REJECT_SCORE_THRESHOLD: 0,
  KEYWORD_HINTS: {
    enterprise_use_case: [
      "case study",
      "use case",
      "customer",
      "customer story",
      "production deployment",
      "enterprise deployment",
      "rolled out",
    ],
    workflow_redesign: [
      "workflow",
      "process redesign",
      "operating model",
      "business process",
      "change management",
      "human in the loop",
    ],
    agentic_implementation: [
      "agent architecture",
      "tool calling",
      "multi-agent",
      "agentic",
      "orchestration",
      "eval harness",
      "implementation",
    ],
    fde_customer_deployment: [
      "field deployment",
      "forward deployed",
      "fde",
      "customer deployment",
      "implementation partner",
      "onsite",
    ],
    governance_roi: [
      "roi",
      "governance",
      "compliance",
      "risk",
      "cost savings",
      "business outcome",
      "productivity gain",
    ],
  },
  SYSTEM_PROMPT: [
    "You classify enterprise AI scout candidates into one digest category.",
    "Return exactly one valid JSON object and no prose outside JSON.",
    "Do not use Markdown, bullets, code fences, comments, or explanations outside the JSON object.",
    "Choose exactly one category from the provided list.",
  ].join("\n"),
  USER_PROMPT_LABELS: {
    CATEGORIES: "Allowed categories",
    CANDIDATE: "Candidate",
    SCORE: "Score",
    RESPONSE_SHAPE: "Return JSON with exactly these fields",
  },
  RESPONSE_FIELDS: {
    CATEGORY: "category",
  },
  REPAIR_PROMPT:
    "Your previous response was not valid JSON. Return only one valid JSON object with a valid category.",
  ERRORS: {
    INVALID_CLASSIFICATION: "Model returned an invalid category classification.",
  },
  LOG_EVENTS: {
    FALLBACK_CATEGORY: "classification_fallback_category",
  },
  LOG_MESSAGES: {
    FALLBACK_CATEGORY: "Using deterministic category fallback after classifier failure.",
  },
} as const;
