// Purpose: Tests use case selector behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  selectEnterpriseUseCaseItems,
  selectEnterpriseUseCases,
} from "../src/pipelines/useCases/selector.js";
import { enterpriseUseCaseFingerprint } from "../src/pipelines/useCases/dedupe.js";
import type { EnterpriseUseCase } from "../src/pipelines/useCases/schema.js";

function useCase(overrides: Partial<EnterpriseUseCase> = {}): EnterpriseUseCase {
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
    sourceUrl: "https://microsoft.com/customers/acme-support",
    sourceName: "Microsoft",
    publishDate: "2026-05-25",
    evidenceSummary: "Named production deployment with measurable support outcome.",
    confidenceScore: 4,
    ...overrides,
  };
}

describe("enterprise use case selector", () => {
  it("filters use cases below the configured confidence threshold", () => {
    const selected = selectEnterpriseUseCases([
      useCase({ id: "low-confidence", confidenceScore: 2 }),
      useCase({ id: "high-confidence", confidenceScore: 3 }),
    ]);

    assert.deepEqual(
      selected.map((item) => item.id),
      ["high-confidence"],
    );
  });

  it("filters generic audience pseudo-use cases even with high confidence", () => {
    const selected = selectEnterpriseUseCases([
      useCase({
        id: "generic-measurement-framework",
        companyName: "Any organization using contact centers",
        aiSystemOrCapability: "AI agent performance measurement framework",
        evidenceSummary: "The article describes a framework, not a named deployment.",
        confidenceScore: 5,
      }),
      useCase({ id: "real-deployment", confidenceScore: 4 }),
    ]);

    assert.deepEqual(
      selected.map((item) => item.id),
      ["real-deployment"],
    );
  });

  it("prefers the model-owned confidence score when ranking candidates", () => {
    const selected = selectEnterpriseUseCases(
      [
        useCase({
          id: "lower-confidence-production",
          deploymentStage: "pilot",
          roiMetric: "unknown",
          businessOutcome: "unknown",
          sourceName: "Unknown Blog",
          sourceUrl: "https://example.com/pilot",
          confidenceScore: 4,
        }),
        useCase({
          id: "higher-confidence-production",
          deploymentStage: "rolled out in production",
          confidenceScore: 5,
        }),
      ],
      { maxUseCasesPerRun: 1 },
    );

    assert.deepEqual(
      selected.map((item) => item.id),
      ["higher-confidence-production"],
    );
  });

  it("pushes anonymous use cases behind named-company use cases", () => {
    const selected = selectEnterpriseUseCases(
      [
        useCase({
          id: "anonymous-high-confidence",
          companyName: "",
          confidenceScore: 5,
          evidenceSummary: "A midsize sales org deployed AI agents for lead handling.",
        }),
        useCase({
          id: "named-lower-confidence",
          companyName: "Beta",
          confidenceScore: 4,
          sourceUrl: "https://example.com/beta",
        }),
      ],
      { maxUseCasesPerRun: 2 },
    );

    assert.deepEqual(
      selected.map((item) => item.id),
      ["named-lower-confidence", "anonymous-high-confidence"],
    );
  });

  it("respects industry and source diversity caps", () => {
    const selected = selectEnterpriseUseCases(
      [
        useCase({ id: "manufacturing-1", sourceName: "Microsoft" }),
        useCase({
          id: "manufacturing-2",
          companyName: "Beta",
          sourceName: "Microsoft",
        }),
        useCase({
          id: "financial-1",
          companyName: "Gamma",
          industry: "Financial services",
          businessFunction: "Finance",
          aiSystemOrCapability: "Finance AI assistant",
          sourceName: "Microsoft",
        }),
        useCase({
          id: "healthcare-1",
          companyName: "Delta",
          industry: "Healthcare",
          businessFunction: "Clinical operations",
          aiSystemOrCapability: "Clinical documentation assistant",
          sourceName: "AWS",
          sourceUrl: "https://aws.amazon.com/case-studies/delta",
        }),
      ],
      {
        maxUseCasesPerRun: 4,
        maxPerIndustry: 1,
        maxPerSource: 2,
      },
    );

    assert.deepEqual(
      selected.map((item) => item.id),
      ["manufacturing-1", "healthcare-1", "financial-1"],
    );
  });

  it("limits selected use cases to one per named company by default", () => {
    const selected = selectEnterpriseUseCases([
      useCase({ id: "first", companyName: "Acme" }),
      useCase({
        id: "same-company",
        companyName: "Acme",
        sourceUrl: "https://aws.amazon.com/case-studies/acme",
        sourceName: "AWS",
      }),
      useCase({
        id: "different-company",
        companyName: "Gamma",
        businessFunction: "Procurement",
        aiSystemOrCapability: "Procurement agent",
        sourceUrl: "https://openai.com/index/gamma",
        sourceName: "OpenAI",
        confidenceScore: 5,
      }),
    ]);

    assert.deepEqual(
      selected.map((item) => item.id),
      ["different-company", "first"],
    );
  });

  it("can allow multiple use cases from the same company when configured", () => {
    const selected = selectEnterpriseUseCases(
      [
        useCase({ id: "first", companyName: "Acme" }),
        useCase({
          id: "same-company",
          companyName: "Acme",
          businessFunction: "Finance",
          aiSystemOrCapability: "Finance AI assistant",
          sourceUrl: "https://aws.amazon.com/case-studies/acme",
          sourceName: "AWS",
        }),
      ],
      { maxPerCompany: 2 },
    );

    assert.deepEqual(
      selected.map((item) => item.id),
      ["first", "same-company"],
    );
  });

  it("skips previously published source-independent use case fingerprints", () => {
    const previouslyPublished = useCase({
      id: "old-trellix",
      companyName: "Trellix",
      businessFunction: "Security operations",
      aiSystemOrCapability: "AI agent security alert analysis",
      sourceUrl: "https://aws.amazon.com/ai/generative-ai/customers/",
    });
    const fingerprint = enterpriseUseCaseFingerprint(previouslyPublished);
    assert.ok(fingerprint);

    const selected = selectEnterpriseUseCases(
      [
        useCase({
          id: "repeat-trellix",
          companyName: "Trellix",
          businessFunction: "Security operations",
          aiSystemOrCapability: "AI agent security alert analysis",
          sourceUrl: "https://example.com/another-trellix-story",
          confidenceScore: 5,
        }),
        useCase({
          id: "new-company",
          companyName: "Beta",
          sourceUrl: "https://example.com/beta",
        }),
      ],
      {
        previouslyPublishedFingerprints: new Set([fingerprint]),
      },
    );

    assert.deepEqual(
      selected.map((item) => item.id),
      ["new-company"],
    );
  });

  it("honors the max use cases per run setting", () => {
    const selected = selectEnterpriseUseCases(
      [
        useCase({ id: "first" }),
        useCase({
          id: "second",
          companyName: "Beta",
          businessFunction: "Finance",
          aiSystemOrCapability: "Finance AI assistant",
          sourceUrl: "https://aws.amazon.com/case-studies/beta",
          sourceName: "AWS",
        }),
      ],
      { maxUseCasesPerRun: 1 },
    );

    assert.equal(selected.length, 1);
  });

  it("filters use cases older than the configured age window", () => {
    const selected = selectEnterpriseUseCases(
      [
        useCase({
          id: "old-use-case",
          publishDate: "2025-06-03",
        }),
        useCase({
          id: "fresh-use-case",
          companyName: "Beta",
          aiSystemOrCapability: "Claims assistant",
          publishDate: "2025-06-04",
          sourceUrl: "https://aws.amazon.com/case-studies/beta",
          sourceName: "AWS",
        }),
      ],
      {
        maxUseCaseAgeDays: 365,
        referenceDate: new Date("2026-06-04T12:00:00Z"),
      },
    );

    assert.deepEqual(
      selected.map((item) => item.id),
      ["fresh-use-case"],
    );
  });

  it("preserves enriched item metadata while applying selection rules", () => {
    const enriched = {
      ...useCase({ id: "verified" }),
      verification: {
        verified: true,
        confidenceScore: 4,
        evidenceLinks: [],
        notes: "Verified against source evidence.",
      },
    };

    const selected = selectEnterpriseUseCaseItems([enriched]);

    assert.equal(selected[0]?.verification.notes, "Verified against source evidence.");
  });
});
