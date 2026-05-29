// Purpose: Tests use case renderer behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  renderEnterpriseUseCaseDigest,
  saveEnterpriseUseCaseDigest,
} from "../src/pipelines/useCases/renderer.js";
import type { EnterpriseUseCase } from "../src/pipelines/useCases/schema.js";

function useCase(overrides: Partial<EnterpriseUseCase> = {}): EnterpriseUseCase {
  return {
    id: "use-case:acme-support",
    companyName: "Acme",
    industry: "Manufacturing",
    businessFunction: "Customer support",
    workflowAffected: "Support ticket triage",
    workflowBefore: "Agents manually read and route incoming tickets.",
    workflowAfter: "AI drafts responses and routes escalations.",
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
  it("renders a Markdown digest with summary and detail sections", () => {
    const markdown = renderEnterpriseUseCaseDigest([useCase()], "2026-05-25");

    assert.match(markdown, /^# Enterprise AI Use Cases - 2026-05-25/);
    assert.match(markdown, /## Summary Table/);
    assert.match(
      markdown,
      /\| Company \| Industry \| Business Function \| Workflow \| AI Capability \| Outcome \| Source \|/,
    );
    assert.match(markdown, /## Detailed Use Cases/);
    assert.match(markdown, /- Company: Acme/);
    assert.match(markdown, /- Workflow affected: Support ticket triage/);
    assert.match(
      markdown,
      /- ROI metric \/ business outcome: 20% faster response time; Reduced support backlog\./,
    );
    assert.match(markdown, /- Why this matters for my positioning:/);
  });

  it("escapes Markdown control characters from source content", () => {
    const markdown = renderEnterpriseUseCaseDigest(
      [
        useCase({
          companyName: "Acme [spoof](https://evil.example)",
          industry: "Finance|Banking",
          workflowAffected: "Support #1",
          businessOutcome: "Reduced *manual* work.",
          sourceName: "Example | Source",
        }),
      ],
      new Date("2026-05-25T10:00:00Z"),
    );

    assert.ok(markdown.includes("Acme \\[spoof\\]\\(https://evil.example\\)"));
    assert.ok(markdown.includes("Finance\\|Banking"));
    assert.ok(markdown.includes("Support \\#1"));
    assert.ok(markdown.includes("Reduced \\*manual\\* work."));
    assert.ok(markdown.includes("Example \\| Source"));
  });

  it("saves use-case digests under digests/use-cases", () => {
    const rootDirectory = mkdtempSync(join(tmpdir(), "birbal-use-case-digest-"));
    const path = saveEnterpriseUseCaseDigest("# Test\n", "2026-05-25", rootDirectory);

    assert.equal(path, join(rootDirectory, "digests", "use-cases", "2026-05-25.md"));
    assert.equal(existsSync(path), true);
    assert.equal(readFileSync(path, "utf8"), "# Test\n");
  });

  it("rejects invalid digest dates", () => {
    assert.throws(
      () => renderEnterpriseUseCaseDigest([], "not a date"),
      /Digest date must be formatted as YYYY-MM-DD/,
    );
  });
});
