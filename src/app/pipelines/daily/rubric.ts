// Purpose: Implements the Birbal pipeline component: rubric.
// Scope: Keeps app-specific pipeline behavior outside the generic framework.

import { z } from "zod";

import { SCORING } from "../../constants/scoring.js";
import type { Rubric } from "../../../framework/scoring/rubric.js";

export const ENTERPRISE_DAILY_READING_RUBRIC_ID = "enterprise_daily_reading_rubric";

export const EnterpriseDailyScoreSchema = z
  .strictObject({
    [SCORING.RESPONSE_FIELDS.ENTERPRISE_RELEVANCE]: z.number().min(1).max(5),
    [SCORING.RESPONSE_FIELDS.WORKFLOW_REDESIGN_DEPTH]: z.number().min(1).max(5),
    [SCORING.RESPONSE_FIELDS.REAL_USE_CASE_SPECIFICITY]: z.number().min(1).max(5),
    [SCORING.RESPONSE_FIELDS.DEPLOYMENT_FDE_RELEVANCE]: z.number().min(1).max(5),
    [SCORING.RESPONSE_FIELDS.BUSINESS_OUTCOME_CLARITY]: z.number().min(1).max(5),
    [SCORING.RESPONSE_FIELDS.TECHNICAL_IMPLEMENTATION_USEFULNESS]: z.number().min(1).max(5),
    [SCORING.RESPONSE_FIELDS.RECENCY]: z.number().min(1).max(5),
    [SCORING.RESPONSE_FIELDS.NON_GENERIC_INSIGHT]: z.number().min(1).max(5),
    [SCORING.RESPONSE_FIELDS.REJECTED]: z.boolean(),
    [SCORING.RESPONSE_FIELDS.REJECTION_REASON]: z.string().min(1).optional(),
    [SCORING.RESPONSE_FIELDS.REASON]: z.string().min(1),
  })
  .refine((score) => !score.rejected || Boolean(score.rejectionReason), {
    message: "rejectionReason is required when rejected is true.",
    path: [SCORING.RESPONSE_FIELDS.REJECTION_REASON],
  });

export type EnterpriseDailyScore = z.infer<typeof EnterpriseDailyScoreSchema>;

export const enterpriseDailyReadingRubric: Rubric<EnterpriseDailyScore> = {
  id: ENTERPRISE_DAILY_READING_RUBRIC_ID,
  description:
    "Score reading candidates for concrete enterprise AI deployment, workflow redesign, implementation depth, and business relevance.",
  scale: {
    min: 1,
    max: 5,
    label:
      "1 is weak, generic, or shallow; 5 is concrete, deployed, practical, and enterprise-relevant.",
  },
  criteria: [
    {
      id: SCORING.RESPONSE_FIELDS.ENTERPRISE_RELEVANCE,
      description: "Relevance to enterprise AI deployment and operating model decisions.",
    },
    {
      id: SCORING.RESPONSE_FIELDS.WORKFLOW_REDESIGN_DEPTH,
      description: "Depth of workflow, process, or role redesign detail.",
    },
    {
      id: SCORING.RESPONSE_FIELDS.REAL_USE_CASE_SPECIFICITY,
      description: "Specificity of named use cases, customers, teams, or production scenarios.",
    },
    {
      id: SCORING.RESPONSE_FIELDS.DEPLOYMENT_FDE_RELEVANCE,
      description: "Relevance to field deployment, implementation support, or FDE-style delivery.",
    },
    {
      id: SCORING.RESPONSE_FIELDS.BUSINESS_OUTCOME_CLARITY,
      description:
        "Clarity of ROI, operating metrics, cost, productivity, quality, or risk outcomes.",
    },
    {
      id: SCORING.RESPONSE_FIELDS.TECHNICAL_IMPLEMENTATION_USEFULNESS,
      description:
        "Usefulness of technical architecture, integration, governance, or rollout detail.",
    },
    {
      id: SCORING.RESPONSE_FIELDS.RECENCY,
      description: "Recency and current usefulness for daily enterprise AI scouting.",
    },
    {
      id: SCORING.RESPONSE_FIELDS.NON_GENERIC_INSIGHT,
      description: "Presence of non-obvious, practical insight instead of generic AI commentary.",
    },
  ],
  weights: {
    [SCORING.RESPONSE_FIELDS.ENTERPRISE_RELEVANCE]: SCORING.WEIGHTS.ENTERPRISE_RELEVANCE,
    [SCORING.RESPONSE_FIELDS.WORKFLOW_REDESIGN_DEPTH]: SCORING.WEIGHTS.WORKFLOW_REDESIGN_DEPTH,
    [SCORING.RESPONSE_FIELDS.REAL_USE_CASE_SPECIFICITY]: SCORING.WEIGHTS.REAL_USE_CASE_SPECIFICITY,
    [SCORING.RESPONSE_FIELDS.DEPLOYMENT_FDE_RELEVANCE]: SCORING.WEIGHTS.DEPLOYMENT_FDE_RELEVANCE,
    [SCORING.RESPONSE_FIELDS.BUSINESS_OUTCOME_CLARITY]: SCORING.WEIGHTS.BUSINESS_OUTCOME_CLARITY,
    [SCORING.RESPONSE_FIELDS.TECHNICAL_IMPLEMENTATION_USEFULNESS]:
      SCORING.WEIGHTS.TECHNICAL_IMPLEMENTATION_USEFULNESS,
    [SCORING.RESPONSE_FIELDS.RECENCY]: SCORING.WEIGHTS.RECENCY,
    [SCORING.RESPONSE_FIELDS.NON_GENERIC_INSIGHT]: SCORING.WEIGHTS.NON_GENERIC_INSIGHT,
  },
  hardRejectionRules: [
    "generic AI news",
    "tool launch hype",
    "prompting tips",
    "top 10 AI tools posts",
    "shallow opinion pieces",
    "pure research without enterprise deployment relevance",
    "content with no workflow, operating model, ROI, or implementation angle",
  ],
  outputSchema: EnterpriseDailyScoreSchema,
};
