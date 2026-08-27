export const ARCHITECTURE_LAB = {
  RESEARCH_MAX_STEPS: 8,
  RECENT_SOURCE_MONTHS: 24,
  MAX_SOURCES: 12,
  MAX_EVIDENCE_CLAIMS: 12,
  MAX_LIST_ITEMS: 12,
  TRACE_LABELS: {
    CASE_RESEARCH: "architecture_lab.case_research",
    CASE_BRIEF: "architecture_lab.case_brief",
    OPENING_SAFETY: "architecture_lab.opening_safety",
    CHALLENGE: "architecture_lab.challenge",
    ARCHITECTURE_EVIDENCE: "architecture_lab.architecture_evidence",
    REVIEW: "architecture_lab.review",
  },
  DATA_BOUNDARIES: {
    CASE_NAME: ["BEGIN_UNTRUSTED_CASE_NAME_DATA", "END_UNTRUSTED_CASE_NAME_DATA"],
    DOSSIER: ["BEGIN_UNTRUSTED_DOSSIER_DATA", "END_UNTRUSTED_DOSSIER_DATA"],
    OPENING: ["BEGIN_UNTRUSTED_OPENING_DATA", "END_UNTRUSTED_OPENING_DATA"],
    CASE_BRIEF: ["BEGIN_UNTRUSTED_CASE_BRIEF_DATA", "END_UNTRUSTED_CASE_BRIEF_DATA"],
    TRANSCRIPT: ["BEGIN_UNTRUSTED_TRANSCRIPT_DATA", "END_UNTRUSTED_TRANSCRIPT_DATA"],
    EVIDENCE: ["BEGIN_UNTRUSTED_EVIDENCE_DATA", "END_UNTRUSTED_EVIDENCE_DATA"],
  },
  DESIGN_DIMENSIONS: [
    "control_flow",
    "tool_boundaries",
    "state",
    "safety",
    "evaluation",
    "reliability",
    "human_oversight",
  ],
  LEAKAGE_CATEGORIES: ["reference_design", "vendor_implementation", "complete_solution"],
} as const;

export const ARCHITECTURE_LAB_SESSION_LIMITS = {
  caseNameCharacters: 500,
  turnCharacters: 8_000,
  transcriptCharacters: 32_000,
  challengeRounds: 3,
} as const;
