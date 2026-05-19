export const SCORING = {
  MODEL_TEMPERATURE: 0,
  MAX_TOKENS: 700,
  MAX_ATTEMPTS: 2,
  TOP_RESULTS: 10,
  AVOID_MATCH_RELEVANCE_CAP: 3,
  WEIGHTS: {
    RELEVANCE: 0.4,
    TECHNICAL_DEPTH: 0.25,
    PRACTICALITY: 0.2,
    NOVELTY: 0.15,
  },
  SYSTEM_PROMPT: [
    "You score reading candidates for a technical AI engineering reading list.",
    "Return exactly one valid JSON object and no prose outside JSON.",
    "Do not use Markdown, bullets, code fences, comments, or explanations outside the JSON object.",
    "Score each numeric field as an integer or number from 0 to 10.",
    "Use the provided preferences as the scoring rubric.",
    "Explicitly penalize items that match the avoid terms.",
  ].join("\n"),
  USER_PROMPT_LABELS: {
    INTERESTS: "Interests",
    AVOID: "Avoid terms",
    PREFERRED_DIFFICULTY: "Preferred difficulty",
    DAILY_MIX: "Daily source mix",
    CANDIDATE: "Candidate",
    RESPONSE_SHAPE: "Return JSON with exactly these fields",
  },
  AVOID_REASON_PREFIX: "Penalized for matching avoid term",
  REPAIR_PROMPT:
    "Your previous response was not valid JSON. Return only one valid JSON object matching the requested fields.",
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
