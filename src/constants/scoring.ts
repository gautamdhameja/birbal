export const SCORING = {
  MODEL_TEMPERATURE: 0,
  MAX_TOKENS: 700,
  TOP_RESULTS: 10,
  WEIGHTS: {
    RELEVANCE: 0.4,
    TECHNICAL_DEPTH: 0.25,
    PRACTICALITY: 0.2,
    NOVELTY: 0.15,
  },
  DEFAULT_PREFERENCES: [
    "Prefer technical work that is useful for building and evaluating LLM agents.",
    "Prefer practical implementation detail over high-level product announcements.",
    "Prefer novel research, rigorous evaluations, and engineering lessons.",
    "Prefer local inference, retrieval systems, tool use, and production agent infrastructure.",
  ],
  SYSTEM_PROMPT: [
    "You score reading candidates for a technical AI engineering reading list.",
    "Return exactly one valid JSON object and no prose outside JSON.",
    "Score each numeric field as an integer or number from 0 to 10.",
    "Use the provided preferences as the scoring rubric.",
  ].join("\n"),
  USER_PROMPT_LABELS: {
    PREFERENCES: "Preferences",
    CANDIDATE: "Candidate",
    RESPONSE_SHAPE: "Return JSON with exactly these fields",
  },
  RESPONSE_FIELDS: {
    RELEVANCE: "relevance",
    TECHNICAL_DEPTH: "technical_depth",
    NOVELTY: "novelty",
    PRACTICALITY: "practicality",
    REASON: "reason",
  },
  ERRORS: {
    INVALID_SCORE: "Model returned an invalid item score.",
  },
} as const;
