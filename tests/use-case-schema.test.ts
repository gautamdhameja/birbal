// Purpose: Tests use case schema behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EnterpriseUseCaseSchema,
  isEligibleEnterpriseUseCase,
} from "../src/app/pipelines/useCases/schema.js";

function useCase(overrides: Record<string, unknown> = {}) {
  return {
    id: "use-case:acme-support",
    companyName: "Acme",
    industry: "Manufacturing",
    businessFunction: "Customer support",
    aiSystemOrCapability: "Customer support AI assistant",
    humanRoleChange: "Agents review drafts and handle escalations.",
    systemIntegrations: "CRM and support desk",
    deploymentStage: "production",
    roiMetric: "20% faster response time",
    businessOutcome: "Reduced support backlog.",
    governanceOrRiskNotes: "Human review remains in the loop.",
    implementationDetails: "Integrated with existing ticket queue.",
    sourceTitle: "Acme deploys AI support assistant",
    sourceUrl: "https://example.com/acme-support",
    sourceName: "Example",
    publishDate: "2026-05-25",
    evidenceSummary: "Named production deployment with measurable support outcome.",
    confidenceScore: 4,
    ...overrides,
  };
}

describe("enterprise use case schema", () => {
  it("accepts a practical enterprise use-case record", () => {
    assert.equal(EnterpriseUseCaseSchema.safeParse(useCase()).success, true);
  });

  it('allows "unknown" for unavailable fields', () => {
    assert.equal(
      EnterpriseUseCaseSchema.safeParse(
        useCase({
          industry: "unknown",
          sourceUrl: "unknown",
          publishDate: "unknown",
        }),
      ).success,
      true,
    );
  });

  it("rejects confidence scores outside 1 to 5", () => {
    assert.equal(EnterpriseUseCaseSchema.safeParse(useCase({ confidenceScore: 0 })).success, false);
    assert.equal(EnterpriseUseCaseSchema.safeParse(useCase({ confidenceScore: 6 })).success, false);
  });

  it("normalizes practical model formatting differences", () => {
    const parsed = EnterpriseUseCaseSchema.parse(
      useCase({
        systemIntegrations: ["CRM", "support desk"],
        confidenceScore: "4",
        extraModelNote: "ignored",
      }),
    );

    assert.equal(parsed.systemIntegrations, "CRM, support desk");
    assert.equal(parsed.confidenceScore, 4);
    assert.equal("extraModelNote" in parsed, false);
  });

  it("accepts common confidence score aliases from model output", () => {
    assert.equal(
      EnterpriseUseCaseSchema.parse(useCase({ confidenceScore: undefined, confidence_score: 5 }))
        .confidenceScore,
      5,
    );
    assert.equal(
      EnterpriseUseCaseSchema.parse(useCase({ confidenceScore: undefined, confidence: "3" }))
        .confidenceScore,
      3,
    );
  });

  it("rejects missing confidence scores", () => {
    assert.equal(
      EnterpriseUseCaseSchema.safeParse(useCase({ confidenceScore: undefined })).success,
      false,
    );
  });

  it("preserves unavailable text fields as blanks", () => {
    const parsed = EnterpriseUseCaseSchema.parse(
      useCase({
        roiMetric: null,
        governanceOrRiskNotes: "",
      }),
    );

    assert.equal(parsed.roiMetric, "");
    assert.equal(parsed.governanceOrRiskNotes, "");
  });

  it("does not treat filler missing values as concrete required evidence", () => {
    assert.equal(
      isEligibleEnterpriseUseCase(useCase({ aiSystemOrCapability: "not available" })),
      false,
    );
  });

  it("strips legacy workflow fields from model output", () => {
    const parsed = EnterpriseUseCaseSchema.parse(
      useCase({
        workflowAffected: "Support ticket triage",
        workflowBefore: "Agents manually read and route incoming tickets.",
        workflowAfter: "AI drafts responses and routes escalations.",
      }),
    );

    assert.equal("workflowAffected" in parsed, false);
    assert.equal("workflowBefore" in parsed, false);
    assert.equal("workflowAfter" in parsed, false);
    assert.equal(isEligibleEnterpriseUseCase(parsed), true);
  });
});
