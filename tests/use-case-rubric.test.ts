import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ENTERPRISE_USE_CASE_RUBRIC_ID,
  enterpriseUseCaseRubric,
} from "../src/pipelines/useCases/rubric.js";

describe("enterprise use case rubric", () => {
  it("defines the expected criteria and hard rejection rules", () => {
    assert.equal(enterpriseUseCaseRubric.id, ENTERPRISE_USE_CASE_RUBRIC_ID);
    assert.deepEqual(
      enterpriseUseCaseRubric.criteria.map((criterion) => criterion.id),
      [
        "realCompanySpecificity",
        "workflowSpecificity",
        "aiSystemSpecificity",
        "humanRoleClarity",
        "integrationDetail",
        "businessOutcomeClarity",
        "deploymentMaturity",
        "evidenceQuality",
      ],
    );
    assert.deepEqual(enterpriseUseCaseRubric.hardRejectionRules, [
      "vague examples",
      "hypothetical use cases",
      "vendor marketing with no real customer or workflow",
      "examples with no enterprise deployment evidence",
      "examples with no source URL",
    ]);
  });

  it("validates rejected scores require a rejection reason", () => {
    const parsed = enterpriseUseCaseRubric.outputSchema.safeParse({
      realCompanySpecificity: 1,
      workflowSpecificity: 1,
      aiSystemSpecificity: 1,
      humanRoleClarity: 1,
      integrationDetail: 1,
      businessOutcomeClarity: 1,
      deploymentMaturity: 1,
      evidenceQuality: 1,
      rejected: true,
      reason: "No evidence.",
    });

    assert.equal(parsed.success, false);
  });
});
