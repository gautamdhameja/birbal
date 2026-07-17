// Purpose: Tests use case renderer behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderEnterpriseUseCaseDigest } from "../src/app/pipelines/useCases/renderer.js";
import type { EnterpriseUseCase } from "../src/app/pipelines/useCases/schema.js";

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
    sourceUrl: "https://example.com/acme-support",
    sourceName: "Example",
    publishDate: "2026-05-25",
    evidenceSummary: "Named production deployment with measurable support outcome.",
    confidenceScore: 4,
    ...overrides,
  };
}

describe("enterprise use case renderer", () => {
  it("renders a compact newsletter-style Markdown digest", () => {
    const markdown = renderEnterpriseUseCaseDigest([useCase()], "2026-05-25");

    assert.match(markdown, /^# Enterprise AI Use Cases - 2026-05-25/);
    assert.match(
      markdown,
      /- Summary: Named production deployment with measurable support outcome\./,
    );
    assert.match(markdown, /- Business impact: 20% faster response time/);
    assert.match(markdown, /- Source: \[Example\]\(<https:\/\/example\.com\/acme-support>\)/);
    assert.doesNotMatch(markdown, /## Summary Table/);
    assert.doesNotMatch(markdown, /- Human role change:/);
    assert.doesNotMatch(markdown, /- Enterprise lesson:/);
    assert.doesNotMatch(markdown, /- Workflow changed:/);
  });

  it("escapes Markdown control characters from source content", () => {
    const markdown = renderEnterpriseUseCaseDigest(
      [
        useCase({
          companyName: "Acme [spoof](https://evil.example)",
          roiMetric: "unknown",
          businessOutcome: "Reduced *manual* work.",
          sourceName: "Example | Source",
        }),
      ],
      new Date("2026-05-25T10:00:00Z"),
    );

    assert.ok(markdown.includes("Acme \\[spoof\\]\\(https://evil.example\\)"));
    assert.ok(markdown.includes("Reduced \\*manual\\* work."));
    assert.ok(markdown.includes("Example \\| Source"));
  });

  it("wraps source URLs so punctuation cannot break Markdown links", () => {
    const markdown = renderEnterpriseUseCaseDigest(
      [useCase({ sourceUrl: "https://example.com/report)final?x=1)" })],
      "2026-05-25",
    );

    assert.match(
      markdown,
      /- Source: \[Example\]\(<https:\/\/example\.com\/report\)final\?x=1\)>\)/,
    );
  });

  it("renders unsupported newsletter fields as blank instead of filler", () => {
    const markdown = renderEnterpriseUseCaseDigest(
      [
        useCase({
          businessFunction: "unknown",
          roiMetric: "unknown",
          businessOutcome: "N/A",
          systemIntegrations: "unknown",
          governanceOrRiskNotes: "unknown",
          evidenceSummary: "unknown",
        }),
      ],
      "2026-05-25",
    );

    assert.match(markdown, /- Summary: Acme is using Customer support AI assistant\./);
    assert.match(markdown, /- Business impact: $/m);
    assert.doesNotMatch(markdown, /unknown/);
    assert.doesNotMatch(markdown, /N\/A/);
    assert.doesNotMatch(markdown, /- Enterprise lesson:/);
    assert.doesNotMatch(markdown, /- Workflow changed:/);
  });

  it("renders a useful placeholder when company name is missing", () => {
    const markdown = renderEnterpriseUseCaseDigest(
      [
        useCase({
          companyName: "",
          businessFunction: "Sales",
          evidenceSummary:
            "A mid-market B2B SaaS company deployed AI agents across its sales organization to reduce administrative work and improve lead handling.",
        }),
        useCase({
          companyName: "",
          businessFunction: "Operations",
          evidenceSummary:
            "E-commerce order processing requires teams to navigate retailer websites without native API access.",
        }),
      ],
      "2026-05-25",
    );

    assert.match(markdown, /### 1\. Midsize sales org/);
    assert.match(markdown, /### 2\. E-commerce operations team/);
    assert.doesNotMatch(markdown, /### 1\. $/m);
  });

  it("rejects invalid digest dates", () => {
    assert.throws(
      () => renderEnterpriseUseCaseDigest([], "not a date"),
      /Digest date must be formatted as YYYY-MM-DD/,
    );
  });
});
