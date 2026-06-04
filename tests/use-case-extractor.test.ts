// Purpose: Tests use case extractor behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CONTENT_FETCH_STATUSES } from "../src/constants/candidates.js";
import { SOURCE_REGISTRY } from "../src/constants/source-registry.js";
import { SOURCES } from "../src/constants/sources.js";
import type { CandidateItem } from "../src/daily/types.js";
import { extractEnterpriseUseCases } from "../src/pipelines/useCases/extractor.js";

function candidate(overrides: Partial<CandidateItem> = {}): CandidateItem {
  return {
    id: "candidate:acme-ai-support",
    sourceId: SOURCES.HACKER_NEWS,
    sourceName: "Example Source",
    sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
    title: "Acme deploys an AI support assistant",
    url: "https://example.com/acme-ai-support",
    summary: "Acme deployed an AI assistant for support triage.",
    publishedAt: "2026-05-25",
    discoveredAt: "2026-05-25T08:00:00.000Z",
    contentFetchStatus: CONTENT_FETCH_STATUSES.FETCHED,
    raw: {},
    ...overrides,
  };
}

function extractedUseCase(overrides: Record<string, unknown> = {}) {
  return {
    id: "acme-support-triage",
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
    sourceUrl: "https://example.com/acme-ai-support",
    sourceName: "Example Source",
    publishDate: "2026-05-25",
    evidenceSummary: "Named production deployment with measurable support outcome.",
    confidenceScore: 4,
    ...overrides,
  };
}

describe("enterprise use case extractor", () => {
  it("extracts real enterprise use cases from valid model JSON", async () => {
    const useCases = await extractEnterpriseUseCases(
      candidate(),
      "Acme deployed an AI assistant for support ticket triage.",
      {
        completeFn: async () =>
          JSON.stringify({
            useCases: [extractedUseCase()],
          }),
      },
    );

    assert.deepEqual(useCases, [extractedUseCase()]);
  });

  it("returns an empty array when the article has no real enterprise use case", async () => {
    const useCases = await extractEnterpriseUseCases(candidate(), "Generic trend commentary.", {
      completeFn: async () => JSON.stringify({ useCases: [] }),
    });

    assert.deepEqual(useCases, []);
  });

  it("instructs the model to leave unsupported fields blank", async () => {
    let prompt = "";
    await extractEnterpriseUseCases(candidate(), "Acme deployed an AI assistant.", {
      completeFn: async (messages) => {
        prompt = messages.map((message) => message.content).join("\n");
        return JSON.stringify({ useCases: [extractedUseCase()] });
      },
    });

    assert.match(prompt, /leave unsupported fields as empty strings/i);
    assert.match(prompt, /Blank is better than generic/i);
    assert.match(prompt, /evidenceSummary is the final newsletter summary/i);
    assert.match(prompt, /Treat marketing language as neutral/i);
    assert.match(prompt, /confidenceScore 5: named organization/i);
    assert.match(prompt, /real organization or clearly deployed internal enterprise team/i);
    assert.doesNotMatch(prompt, /workflowBefore/i);
    assert.doesNotMatch(prompt, /workflowAfter/i);
    assert.doesNotMatch(prompt, /Use "unknown" for unavailable fields/);
  });

  it("drops generic methodology pseudo-use cases even when the model scores them highly", async () => {
    const useCases = await extractEnterpriseUseCases(
      candidate({
        title: "AI agent performance measurement",
        url: "https://www.microsoft.com/en-us/dynamics-365/blog/it-professional/2026/02/04/ai-agent-performance-measurement/",
        summary: "Best practices for measuring AI agent performance.",
      }),
      "This article explains a framework for measuring AI agent performance in contact centers.",
      {
        completeFn: async () =>
          JSON.stringify({
            useCases: [
              extractedUseCase({
                id: "generic-agent-measurement",
                companyName: "Any organization using contact centers",
                industry: "Customer service",
                businessFunction: "Contact center operations",
                aiSystemOrCapability: "AI agent performance measurement framework",
                deploymentStage: "Building, deploying, and scaling AI agents in production",
                roiMetric: "Improved customer satisfaction",
                businessOutcome: "Ability to demonstrate ROI.",
                evidenceSummary:
                  "The article describes a measurement framework, not a named deployment.",
                confidenceScore: 5,
              }),
            ],
          }),
      },
    );

    assert.deepEqual(useCases, []);
  });

  it("overwrites model-supplied source URLs with the trusted candidate URL", async () => {
    const useCases = await extractEnterpriseUseCases(
      candidate({ url: "https://trusted.example.com/acme-ai-support" }),
      "Acme deployed an AI assistant for support ticket triage.",
      {
        completeFn: async () =>
          JSON.stringify({
            useCases: [extractedUseCase({ sourceUrl: "https://attacker.example/phishing" })],
          }),
      },
    );

    assert.equal(useCases[0]?.sourceUrl, "https://trusted.example.com/acme-ai-support");
  });

  it("accepts common model envelope variants without repair", async () => {
    let calls = 0;
    const useCases = await extractEnterpriseUseCases(
      candidate(),
      "Acme deployed an AI assistant for support ticket triage.",
      {
        completeFn: async () => {
          calls += 1;
          return JSON.stringify({ use_cases: [extractedUseCase()] });
        },
      },
    );

    assert.equal(calls, 1);
    assert.deepEqual(useCases, [extractedUseCase()]);
  });

  it("accepts a top-level use-case array without repair", async () => {
    let calls = 0;
    const useCases = await extractEnterpriseUseCases(
      candidate(),
      "Acme deployed an AI assistant for support ticket triage.",
      {
        completeFn: async () => {
          calls += 1;
          return JSON.stringify([extractedUseCase()]);
        },
      },
    );

    assert.equal(calls, 1);
    assert.deepEqual(useCases, [extractedUseCase()]);
  });

  it("accepts a single top-level use-case object without repair", async () => {
    let calls = 0;
    const useCases = await extractEnterpriseUseCases(
      candidate(),
      "Acme deployed an AI assistant for support ticket triage.",
      {
        completeFn: async () => {
          calls += 1;
          return JSON.stringify(extractedUseCase());
        },
      },
    );

    assert.equal(calls, 1);
    assert.deepEqual(useCases, [extractedUseCase()]);
  });

  it("accepts a top-level confidence score and applies it to extracted items", async () => {
    let calls = 0;
    const { confidenceScore: _confidenceScore, ...useCaseWithoutConfidence } = extractedUseCase();
    const useCases = await extractEnterpriseUseCases(
      candidate(),
      "Acme deployed an AI assistant for support ticket triage.",
      {
        completeFn: async () => {
          calls += 1;
          return JSON.stringify({
            useCases: [useCaseWithoutConfidence],
            confidenceScore: 4,
          });
        },
      },
    );

    assert.equal(calls, 1);
    assert.deepEqual(useCases, [extractedUseCase()]);
  });

  it("repairs extracted use cases that omit the model-owned score", async () => {
    let calls = 0;
    const { confidenceScore: _confidenceScore, ...useCaseWithoutConfidence } = extractedUseCase();
    const useCases = await extractEnterpriseUseCases(
      candidate(),
      "Acme deployed an AI assistant for support ticket triage.",
      {
        completeFn: async () => {
          calls += 1;
          if (calls === 1) {
            return JSON.stringify({ useCases: [useCaseWithoutConfidence] });
          }

          return JSON.stringify({ useCases: [extractedUseCase()] });
        },
      },
    );

    assert.equal(calls, 2);
    assert.deepEqual(useCases, [extractedUseCase()]);
  });

  it("repairs invalid model output once using the shared repair helper", async () => {
    let calls = 0;
    const useCases = await extractEnterpriseUseCases(
      candidate(),
      "Acme deployed an AI assistant for support ticket triage.",
      {
        completeFn: async () => {
          calls += 1;
          if (calls === 1) {
            return "not json";
          }

          return JSON.stringify({
            useCases: [extractedUseCase({ roiMetric: "unknown" })],
          });
        },
      },
    );

    assert.equal(calls, 2);
    assert.deepEqual(useCases, [extractedUseCase({ roiMetric: "unknown" })]);
  });

  it("rejects extracted use cases that fail schema validation after repair", async () => {
    await assert.rejects(
      () =>
        extractEnterpriseUseCases(candidate(), "Acme deployed an AI assistant.", {
          completeFn: async () =>
            JSON.stringify({
              useCases: [extractedUseCase({ confidenceScore: 6 })],
            }),
        }),
      /Model output failed JSON parsing or schema validation after repair/,
    );
  });
});
