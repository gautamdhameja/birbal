import { z } from "zod";

import type { Rubric } from "../../framework/scoring/rubric.js";

export const ENTERPRISE_USE_CASE_RUBRIC_ID = "enterprise_use_case_rubric";

export const EnterpriseUseCaseScoreSchema = z
  .strictObject({
    realCompanySpecificity: z.number().min(1).max(5),
    workflowSpecificity: z.number().min(1).max(5),
    aiSystemSpecificity: z.number().min(1).max(5),
    humanRoleClarity: z.number().min(1).max(5),
    integrationDetail: z.number().min(1).max(5),
    businessOutcomeClarity: z.number().min(1).max(5),
    deploymentMaturity: z.number().min(1).max(5),
    evidenceQuality: z.number().min(1).max(5),
    rejected: z.boolean(),
    rejectionReason: z.string().min(1).optional(),
    reason: z.string().min(1),
  })
  .refine((score) => !score.rejected || Boolean(score.rejectionReason), {
    message: "rejectionReason is required when rejected is true.",
    path: ["rejectionReason"],
  });

export type EnterpriseUseCaseScore = z.infer<typeof EnterpriseUseCaseScoreSchema>;

export const enterpriseUseCaseRubric: Rubric<EnterpriseUseCaseScore> = {
  id: ENTERPRISE_USE_CASE_RUBRIC_ID,
  description:
    "Score extracted enterprise AI use cases for specificity, production evidence, workflow clarity, and business usefulness.",
  scale: {
    min: 1,
    max: 5,
    label:
      "1 is vague, generic, or weakly evidenced; 5 is specific, production-backed, operationally useful, and well sourced.",
  },
  criteria: [
    {
      id: "realCompanySpecificity",
      description: "Specificity of the named real company or customer involved.",
    },
    {
      id: "workflowSpecificity",
      description: "Specificity of the enterprise workflow being changed or automated.",
    },
    {
      id: "aiSystemSpecificity",
      description: "Clarity about what the AI system does and how it behaves in the workflow.",
    },
    {
      id: "humanRoleClarity",
      description: "Clarity about how human roles, responsibilities, or handoffs change.",
    },
    {
      id: "integrationDetail",
      description: "Detail about systems, data, tools, channels, or process integration.",
    },
    {
      id: "businessOutcomeClarity",
      description: "Clarity of measurable business, operational, cost, quality, or risk outcomes.",
    },
    {
      id: "deploymentMaturity",
      description: "Evidence that the use case is live, rolled out, productionized, or mature.",
    },
    {
      id: "evidenceQuality",
      description: "Quality of source evidence, reference link, publish date, and factual support.",
    },
  ],
  weights: {
    realCompanySpecificity: 0.15,
    workflowSpecificity: 0.15,
    aiSystemSpecificity: 0.15,
    humanRoleClarity: 0.1,
    integrationDetail: 0.1,
    businessOutcomeClarity: 0.15,
    deploymentMaturity: 0.1,
    evidenceQuality: 0.1,
  },
  hardRejectionRules: [
    "vague examples",
    "hypothetical use cases",
    "vendor marketing with no real customer or workflow",
    "examples with no enterprise deployment evidence",
    "examples with no source URL",
  ],
  outputSchema: EnterpriseUseCaseScoreSchema,
};
