import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { USE_CASES } from "../src/constants.js";
import {
  extractProductionUseCase,
  parseProductionUseCaseExtraction,
} from "../src/use-cases/extraction.js";
import { loadProductionUseCaseScoutConfig } from "../src/use-cases/config.js";
import { saveUseCaseReport, writeUseCaseReport } from "../src/use-cases/markdown.js";
import { runProductionUseCaseScout } from "../src/use-cases/pipeline.js";
import type { ProductionUseCaseScoutConfig } from "../src/use-cases/types.js";

function config(
  overrides: Partial<ProductionUseCaseScoutConfig> = {},
): ProductionUseCaseScoutConfig {
  return {
    dailyQueries: ["enterprise AI customer story workflow"],
    sourceSpecificQueries: ["site:openai.com/index enterprise AI customer story workflow"],
    prioritizedDomains: ["openai.com", "microsoft.com"],
    maxSearchResultsPerQuery: 2,
    maxCandidatesForExtraction: 3,
    maxResults: 2,
    freshness: "pm",
    ...overrides,
  };
}

function writeConfig(value: unknown): string {
  const configPath = join(
    mkdtempSync(join(tmpdir(), "birbal-use-case-scout-")),
    "production-use-case-scout.json",
  );
  writeFileSync(configPath, JSON.stringify(value));
  return configPath;
}

describe("production use case scout", () => {
  it("loads and validates production use case scout config", () => {
    const configPath = writeConfig(config());

    assert.deepEqual(loadProductionUseCaseScoutConfig(configPath), config());
  });

  it("rejects invalid production use case scout config JSON", () => {
    const configPath = join(
      mkdtempSync(join(tmpdir(), "birbal-use-case-scout-")),
      "production-use-case-scout.json",
    );
    writeFileSync(configPath, "{");

    assert.throws(
      () => loadProductionUseCaseScoutConfig(configPath),
      new RegExp(USE_CASES.ERRORS.INVALID_JSON),
    );
  });

  it("parses accepted and rejected production use case extractions", () => {
    assert.deepEqual(
      parseProductionUseCaseExtraction(
        JSON.stringify({
          accepted: true,
          company: "Acme",
          workflow: "Customer support",
          whatAiDoes: "Routes and drafts customer replies.",
          productionEvidence: "Rolled out to support agents.",
          businessMetric: "Reduced handle time by 20%.",
          sourceLink: "https://example.com/story",
          publishDate: "2026-05-20",
          whyThisMattersForEnterpriseAiWorkflowRedesign:
            "Shows AI changing support work allocation and escalation.",
        }),
      ),
      {
        accepted: true,
        company: "Acme",
        workflow: "Customer support",
        whatAiDoes: "Routes and drafts customer replies.",
        productionEvidence: "Rolled out to support agents.",
        businessMetric: "Reduced handle time by 20%.",
        sourceLink: "https://example.com/story",
        publishDate: "2026-05-20",
        whyThisMattersForEnterpriseAiWorkflowRedesign:
          "Shows AI changing support work allocation and escalation.",
      },
    );

    assert.deepEqual(
      parseProductionUseCaseExtraction('{"accepted":false,"rejectionReason":"pilot"}'),
      {
        accepted: false,
        rejectionReason: "pilot",
      },
    );
  });

  it("rejects extraction after repeated model responses without JSON", async () => {
    const originalFetch = globalThis.fetch;
    const originalServerUrl = process.env.LLAMA_SERVER_URL;
    const originalModel = process.env.LLAMA_MODEL;
    const requestBodies: unknown[] = [];

    process.env.LLAMA_SERVER_URL = "http://localhost:8080/v1/chat/completions";
    process.env.LLAMA_MODEL = "local";
    globalThis.fetch = (async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "No matching production use case.",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }) as typeof fetch;

    try {
      assert.deepEqual(
        await extractProductionUseCase(
          {
            id: "use-case:https://example.com/story",
            query: "enterprise AI customer story",
            title: "Example story",
            url: "https://example.com/story",
            description: "Named company production deployment.",
            publishedAt: "2026-05-20",
            raw: {},
          },
          {
            url: "https://example.com/story",
            title: "Example story",
            plainText: "A".repeat(USE_CASES.MAX_FETCHED_CONTENT_PROMPT_CHARS + 100),
            detectedPaywall: false,
            contentLength: USE_CASES.MAX_FETCHED_CONTENT_PROMPT_CHARS + 100,
          },
        ),
        {
          accepted: false,
          rejectionReason: USE_CASES.EXTRACTION_PARSE_FAILURE_REJECTION_REASON,
        },
      );

      assert.equal(requestBodies.length, USE_CASES.MAX_ATTEMPTS);
      const firstRequest = requestBodies[0] as { messages: Array<{ content: string }> };
      assert.match(firstRequest.messages[1]?.content ?? "", /\[truncated 100 characters\]/);
      const repairRequest = requestBodies[1] as { messages: Array<{ content: string }> };
      assert.match(repairRequest.messages.at(-1)?.content ?? "", /rejected shape/);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalServerUrl === undefined) {
        delete process.env.LLAMA_SERVER_URL;
      } else {
        process.env.LLAMA_SERVER_URL = originalServerUrl;
      }
      if (originalModel === undefined) {
        delete process.env.LLAMA_MODEL;
      } else {
        process.env.LLAMA_MODEL = originalModel;
      }
    }
  });

  it("rejects accepted extractions with mismatched source links", async () => {
    const originalFetch = globalThis.fetch;
    const originalServerUrl = process.env.LLAMA_SERVER_URL;
    const originalModel = process.env.LLAMA_MODEL;

    process.env.LLAMA_SERVER_URL = "http://localhost:8080/v1/chat/completions";
    process.env.LLAMA_MODEL = "local";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  accepted: true,
                  company: "Acme",
                  workflow: "Customer support",
                  whatAiDoes: "Drafts replies.",
                  productionEvidence: "Rolled out.",
                  businessMetric: "20% faster.",
                  sourceLink: "https://attacker.example/fake",
                  publishDate: "2026-05-20",
                  whyThisMattersForEnterpriseAiWorkflowRedesign: "Shows workflow change.",
                }),
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      )) as typeof fetch;

    try {
      assert.deepEqual(
        await extractProductionUseCase(
          {
            id: "use-case:https://example.com/story",
            query: "enterprise AI customer story",
            title: "Example story",
            url: "https://example.com/story",
            description: "Named company production deployment.",
            publishedAt: "2026-05-20",
            raw: {},
          },
          {
            url: "https://example.com/story",
            title: "Example story",
            plainText: "Acme rolled out an AI assistant.",
            detectedPaywall: false,
            contentLength: 32,
          },
        ),
        {
          accepted: false,
          rejectionReason: "Extracted source link did not match the fetched source.",
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (originalServerUrl === undefined) {
        delete process.env.LLAMA_SERVER_URL;
      } else {
        process.env.LLAMA_SERVER_URL = originalServerUrl;
      }
      if (originalModel === undefined) {
        delete process.env.LLAMA_MODEL;
      } else {
        process.env.LLAMA_MODEL = originalModel;
      }
    }
  });

  it("collects, prioritizes, fetches, extracts, and returns accepted production use cases", async () => {
    const searchedQueries: string[] = [];
    const fetchedUrls: string[] = [];

    const result = await runProductionUseCaseScout(
      {
        loadConfig: () =>
          config({
            maxCandidatesForExtraction: 2,
            maxResults: 2,
          }),
        searchWeb: async (query) => {
          searchedQueries.push(query);
          return [
            {
              title: "Generic vendor launch",
              url: "https://vendor.example/launch",
              description: "No customer evidence.",
              raw: {},
            },
            {
              title: "OpenAI customer workflow story",
              url: "https://openai.com/index/customer-workflow",
              description: "Named customer with production workflow metrics.",
              publishedAt: "2026-05-20",
              sourceName: "OpenAI",
              raw: {},
            },
            {
              title: "Microsoft customer story",
              url: "https://microsoft.com/en/customers/story/acme",
              description: "Named customer story.",
              publishedAt: "2026-05-21",
              sourceName: "Microsoft",
              raw: {},
            },
          ];
        },
        fetchUrlText: async (url) => {
          fetchedUrls.push(url);
          return {
            url,
            title: "Fetched story",
            plainText:
              "Acme rolled out an AI assistant for customer support and cut handle time by 20%.",
            detectedPaywall: false,
            contentLength: 88,
          };
        },
        extractUseCase: async (candidate) => {
          if (!candidate.url.includes("openai.com")) {
            return {
              accepted: false,
              rejectionReason: "Not the highest-priority source.",
            };
          }

          return {
            accepted: true,
            company: "Acme",
            workflow: "Customer support",
            whatAiDoes: "Drafts responses and routes escalations.",
            productionEvidence: "Rolled out to support agents.",
            businessMetric: "Cut handle time by 20%.",
            sourceLink: candidate.url,
            publishDate: candidate.publishedAt,
            whyThisMattersForEnterpriseAiWorkflowRedesign:
              "It shows AI moving support work from manual triage to assisted resolution.",
          };
        },
      },
      { maxResults: 1 },
    );

    assert.deepEqual(searchedQueries, [
      "site:openai.com/index enterprise AI customer story workflow",
      "enterprise AI customer story workflow",
    ]);
    assert.deepEqual(fetchedUrls, ["https://openai.com/index/customer-workflow"]);
    assert.equal(result.failed, false);
    assert.equal(result.searchedQueries, 2);
    assert.equal(result.collected, 2);
    assert.equal(result.accepted, 1);
    assert.deepEqual(result.searchErrors, []);
    assert.deepEqual(result.fetchErrors, []);
    assert.deepEqual(result.extractionErrors, []);
    assert.deepEqual(result.results, [
      {
        company: "Acme",
        workflow: "Customer support",
        whatAiDoes: "Drafts responses and routes escalations.",
        productionEvidence: "Rolled out to support agents.",
        businessMetric: "Cut handle time by 20%.",
        sourceLink: "https://openai.com/index/customer-workflow",
        publishDate: "2026-05-20",
        whyThisMattersForEnterpriseAiWorkflowRedesign:
          "It shows AI moving support work from manual triage to assisted resolution.",
      },
    ]);
  });

  it("writes a Markdown report for accepted use cases", () => {
    const markdown = writeUseCaseReport(
      [
        {
          company: "Acme",
          workflow: "Customer support",
          whatAiDoes: "Drafts replies.",
          productionEvidence: "Rolled out to agents.",
          businessMetric: "20% faster handle time.",
          sourceLink: "https://example.com/story",
          publishDate: "May 20, 2026, 10:30 AM UTC",
          whyThisMattersForEnterpriseAiWorkflowRedesign: "It changes support triage.",
        },
      ],
      new Date("2026-05-22T10:00:00Z"),
    );

    assert.match(markdown, /# Production Enterprise AI Use Cases - 2026-05-22/);
    assert.match(markdown, /## 1\. Acme/);
    assert.match(markdown, /Workflow: Customer support/);
    assert.match(markdown, /Publish date: 2026-05-20/);
  });

  it("escapes Markdown in use-case reports", () => {
    const markdown = writeUseCaseReport(
      [
        {
          company: "Acme [spoof](https://evil.example)",
          workflow: "Support #1",
          whatAiDoes: "Drafts *replies*.",
          productionEvidence: "> rolled out",
          businessMetric: "20% faster.",
          sourceLink: "javascript:alert(1)",
          publishDate: "2026-05-20",
          whyThisMattersForEnterpriseAiWorkflowRedesign:
            "Avoids fake [links](https://evil.example).",
        },
      ],
      new Date("2026-05-22T10:00:00Z"),
    );

    assert.ok(markdown.includes("Acme \\[spoof\\]\\(https://evil.example\\)"));
    assert.ok(markdown.includes("Support \\#1"));
    assert.ok(markdown.includes("Drafts \\*replies\\*."));
    assert.ok(markdown.includes("javascript:alert\\(1\\)"));
  });

  it("saves Markdown reports under the use case report directory", () => {
    const cwd = process.cwd();
    const tempDir = mkdtempSync(join(tmpdir(), "birbal-use-case-report-"));

    try {
      process.chdir(tempDir);
      assert.equal(
        saveUseCaseReport("report", new Date("2026-05-22T10:00:00Z")),
        "use-case-reports/2026-05-22.md",
      );
    } finally {
      process.chdir(cwd);
    }
  });
});
