// Purpose: Tests use case verification behavior.
// Scope: Covers source-grounded verification regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractVerificationLinks,
  fetchEnterpriseUseCaseEvidence,
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
        <footer><a href="/privacy">Privacy</a></footer>
        <main>
          <a href="/customers/acme-ai-support">Acme AI support customer story</a>
          <a href="/case-studies/acme-workflow">Workflow case study</a>
        </main>
        <footer><a href="https://social.example/acme">Social</a></footer>
      `,
      "https://example.com/acme-support",
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
          evidenceLinks: ["https://example.com/customers/acme"],
          notes: "The source evidence supports the enterprise AI use case.",
        }),
    });

    assert.equal(verification.verified, true);
    assert.equal(verification.confidenceScore, 4);
  });

  it("fetches same-site supporting evidence from content links", async () => {
    const fetchedUrls: string[] = [];
    const evidenceResult = await fetchEnterpriseUseCaseEvidence(useCase(), {
      maxLinks: 1,
      fetchPolicy: {
        transport: async (url) => {
          const requestedUrl = String(url);
          fetchedUrls.push(requestedUrl);

          if (requestedUrl.endsWith("/blue-origin-case-study/")) {
            return new Response(
              `<html><main><h1>Blue Origin case study</h1><p>Blue Origin uses generative AI in engineering workflows with detailed implementation evidence.</p></main></html>`,
              {
                status: 200,
                headers: { "content-type": "text/html" },
              },
            );
          }

          return new Response(
            `<html>
              <footer><a href="/privacy">Privacy</a></footer>
              <main>
                <h1>AWS implementation</h1>
                <p>Blue Origin appears in a high-level implementation overview.</p>
                <a href="/solutions/case-studies/blue-origin-case-study/">Read the Blue Origin case study</a>
              </main>
            </html>`,
            {
              status: 200,
              headers: { "content-type": "text/html" },
            },
          );
        },
      },
    });

    assert.deepEqual(fetchedUrls, [
      "https://example.com/acme-support",
      "https://example.com/solutions/case-studies/blue-origin-case-study/",
    ]);
    assert.equal(evidenceResult.linkedEvidence.length, 1);
    assert.equal(
      evidenceResult.linkedEvidence[0]?.url,
      "https://example.com/solutions/case-studies/blue-origin-case-study/",
    );
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

  it("accepts verified source-grounded use cases", () => {
    assert.equal(
      isAcceptedEnterpriseUseCaseVerification({
        verified: true,
        confidenceScore: 3,
        evidenceLinks: [],
        notes: "The use case is real and source-grounded.",
      }),
      true,
    );
  });

  it("rejects unverified use cases even when the model reports high confidence", async () => {
    const selected = await verifySelectedEnterpriseUseCases([useCase()], {
      fetchEvidence: async () => evidence(),
      completeFn: async () =>
        JSON.stringify({
          verified: false,
          confidenceScore: 4,
          evidenceLinks: ["https://example.com/acme-support"],
          notes:
            "The source is related, but the article does not support this as a publishable use case.",
        }),
    });

    assert.deepEqual(selected, []);
  });

  it("rejects use cases when the verifier judges the core story unsupported", async () => {
    const selected = await verifySelectedEnterpriseUseCases([useCase()], {
      fetchEvidence: async () => evidence(),
      completeFn: async () =>
        JSON.stringify({
          verified: false,
          confidenceScore: 3,
          evidenceLinks: ["https://example.com/acme-support"],
          notes: "The evidence supports the company, but not the extracted AI use case.",
        }),
    });

    assert.deepEqual(selected, []);
  });

  it("rejects true verification flags when confidence is too low", () => {
    assert.equal(
      isAcceptedEnterpriseUseCaseVerification({
        verified: true,
        confidenceScore: 1,
        evidenceLinks: [],
        notes: "The source is weak.",
      }),
      false,
    );
  });

  it("accepts based on semantic verifier judgment rather than hard-coded field checks", () => {
    assert.equal(
      isAcceptedEnterpriseUseCaseVerification({
        verified: true,
        confidenceScore: 5,
        evidenceLinks: [],
        notes: "The source supports the use case.",
      }),
      true,
    );
  });
});
