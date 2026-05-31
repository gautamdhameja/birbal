// Purpose: Tests use case verification behavior.
// Scope: Covers source-grounded verification regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractVerificationLinks,
  isAcceptedEnterpriseUseCaseVerification,
  verifyEnterpriseUseCase,
  verifySelectedEnterpriseUseCases,
  type VerificationEvidence,
} from "../src/pipelines/useCases/verification.js";
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

function evidence(): VerificationEvidence {
  return {
    source: {
      url: "https://example.com/acme-support",
      title: "Acme deploys AI support assistant",
      plainText:
        "Acme deployed a customer support AI assistant in production. It triages support tickets, drafts responses, and reduced response time by 20%.",
    },
    linkedEvidence: [
      {
        url: "https://example.com/customers/acme",
        title: "Acme customer story",
        plainText: "The customer story confirms Acme uses AI in support workflows.",
      },
    ],
  };
}

describe("enterprise use case verification", () => {
  it("extracts relevant bounded verification links from the source page", () => {
    const links = extractVerificationLinks(
      `
        <a href="/privacy">Privacy</a>
        <a href="/customers/acme-ai-support">Acme AI support customer story</a>
        <a href="/case-studies/acme-workflow">Workflow case study</a>
        <a href="https://social.example/acme">Social</a>
      `,
      "https://example.com/acme-support",
      useCase(),
      2,
    );

    assert.deepEqual(links, [
      "https://example.com/customers/acme-ai-support",
      "https://example.com/case-studies/acme-workflow",
    ]);
  });

  it("verifies a use case against source-grounded evidence", async () => {
    const verification = await verifyEnterpriseUseCase(useCase(), evidence(), {
      completeFn: async () =>
        JSON.stringify({
          verified: true,
          confidenceScore: 4,
          unsupportedFields: [],
          evidenceLinks: ["https://example.com/customers/acme"],
          notes: "The source evidence supports the company, workflow, AI capability, and outcome.",
        }),
    });

    assert.equal(verification.verified, true);
    assert.equal(verification.confidenceScore, 4);
  });

  it("returns an unverified result when model verification cannot be parsed", async () => {
    const verification = await verifyEnterpriseUseCase(useCase(), evidence(), {
      completeFn: async () => "not json",
    });

    assert.equal(verification.verified, false);
    assert.equal(verification.confidenceScore, 1);
    assert.match(verification.notes, /Model output failed JSON parsing/);
  });

  it("filters selected use cases that fail verification", async () => {
    const selected = await verifySelectedEnterpriseUseCases(
      [
        useCase({ id: "verified", companyName: "Acme" }),
        useCase({ id: "unverified", companyName: "GenericCo" }),
      ],
      {
        fetchEvidence: async () => evidence(),
        completeFn: async (messages) => {
          const prompt = messages.map((message) => message.content).join("\n");
          const verified = prompt.includes('"companyName":"Acme"');
          return JSON.stringify({
            verified,
            confidenceScore: verified ? 4 : 1,
            unsupportedFields: verified ? [] : ["workflowAffected"],
            evidenceLinks: [],
            notes: verified ? "Supported by evidence." : "Not supported by evidence.",
          });
        },
      },
    );

    assert.deepEqual(
      selected.map((item) => item.id),
      ["verified"],
    );
    assert.equal(selected[0]?.verification.verified, true);
  });

  it("rejects true verification flags when confidence is too low", () => {
    assert.equal(
      isAcceptedEnterpriseUseCaseVerification({
        verified: true,
        confidenceScore: 1,
        unsupportedFields: [],
        evidenceLinks: [],
        notes: "The source is weak.",
      }),
      false,
    );
  });

  it("rejects verification with unsupported critical fields", () => {
    assert.equal(
      isAcceptedEnterpriseUseCaseVerification({
        verified: true,
        confidenceScore: 5,
        unsupportedFields: ["workflowAffected"],
        evidenceLinks: [],
        notes: "Workflow was not supported.",
      }),
      false,
    );
  });
});
