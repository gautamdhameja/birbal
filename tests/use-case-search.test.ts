// Purpose: Tests use case search behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectUseCaseSearchCandidates,
  useCaseSearchRelevanceScore,
  type UseCaseSearchConfig,
} from "../src/pipelines/useCases/search.js";

function config(overrides: Partial<UseCaseSearchConfig> = {}): UseCaseSearchConfig {
  return {
    prioritizedDomains: ["openai.com", "microsoft.com"],
    maxSearchQueries: 2,
    maxSearchResultsPerQuery: 2,
    maxCandidatesForExtraction: 3,
    freshness: "pm",
    ...overrides,
  };
}

describe("enterprise use case search", () => {
  it("caps searched queries before calling Brave Search", async () => {
    const searchedQueries: string[] = [];
    const { candidates, searchedQueries: searchedQueryCount } =
      await collectUseCaseSearchCandidates(
        config({
          maxSearchQueries: 1,
        }),
        async (query) => {
          searchedQueries.push(query);

          return [
            {
              title: "OpenAI customer workflow story",
              url: "https://openai.com/index/customer-workflow",
              description: "Named customer with production workflow metrics.",
              publishedAt: "2026-05-20",
              sourceName: "OpenAI",
              raw: {},
            },
          ];
        },
        [
          "site:openai.com/index enterprise AI customer story workflow",
          "enterprise AI customer story workflow",
        ],
      );

    assert.deepEqual(searchedQueries, [
      "site:openai.com/index enterprise AI customer story workflow",
    ]);
    assert.equal(searchedQueryCount, 1);
    assert.equal(candidates.length, 1);
  });

  it("deduplicates, drops undated results, and ranks by use-case relevance", async () => {
    const { candidates, searchErrors } = await collectUseCaseSearchCandidates(
      config({
        maxCandidatesForExtraction: 2,
      }),
      async () => [
        {
          title: "Generic vendor launch",
          url: "https://vendor.example/launch",
          description: "No publish date.",
          raw: {},
        },
        {
          title: "Microsoft customer story",
          url: "https://microsoft.com/en/customers/story/acme?utm_source=test",
          description: "Named customer story.",
          publishedAt: "2026-05-21",
          sourceName: "Microsoft",
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
          title: "Duplicate OpenAI story",
          url: "https://openai.com/index/customer-workflow#section",
          description: "Duplicate URL with fragment.",
          publishedAt: "2026-05-22",
          sourceName: "OpenAI",
          raw: {},
        },
      ],
      ["enterprise AI customer story workflow"],
    );

    assert.deepEqual(searchErrors, []);
    assert.deepEqual(
      candidates.map((candidate) => candidate.url),
      [
        "https://microsoft.com/en/customers/story/acme?utm_source=test",
        "https://openai.com/index/customer-workflow",
      ],
    );
  });

  it("drops results older than the configured age window before extraction", async () => {
    const { candidates } = await collectUseCaseSearchCandidates(
      config({
        maxCandidateAgeDays: 365,
        referenceDate: new Date("2026-06-04T12:00:00Z"),
      }),
      async () => [
        {
          title: "Old customer story",
          url: "https://openai.com/index/old-customer-story",
          description: "Named customer story, but too old.",
          publishedAt: "2025-06-03",
          sourceName: "OpenAI",
          raw: {},
        },
        {
          title: "Fresh customer story",
          url: "https://openai.com/index/fresh-customer-story",
          description: "Named customer story inside the one-year window.",
          publishedAt: "2025-06-04",
          sourceName: "OpenAI",
          raw: {},
        },
      ],
      ["enterprise AI customer story workflow"],
    );

    assert.deepEqual(
      candidates.map((candidate) => candidate.title),
      ["Fresh customer story"],
    );
  });

  it("ranks concrete customer stories above generic enterprise AI commentary", async () => {
    const { candidates } = await collectUseCaseSearchCandidates(
      config({
        maxCandidatesForExtraction: 2,
      }),
      async () => [
        {
          title: "The state of enterprise AI",
          url: "https://openai.com/index/state-of-enterprise-ai",
          description: "A report with a framework for measuring AI adoption.",
          publishedAt: "2026-05-28",
          sourceName: "OpenAI",
          raw: {},
        },
        {
          title: "Contoso customer story",
          url: "https://microsoft.com/en/customers/story/contoso-generative-ai",
          description:
            "Customer story about a production AI assistant rolled out for a finance workflow with measurable outcome.",
          publishedAt: "2026-05-20",
          sourceName: "Microsoft",
          raw: {},
        },
      ],
      ["enterprise AI customer story workflow"],
    );

    assert.deepEqual(
      candidates.map((candidate) => candidate.title),
      ["Contoso customer story", "The state of enterprise AI"],
    );
  });

  it("scores customer deployment signals higher than framework signals", () => {
    const customerStoryScore = useCaseSearchRelevanceScore({
      id: "use-case:https://aws.amazon.com/solutions/case-studies/acme",
      query: "enterprise AI customer story",
      title: "Acme case study",
      url: "https://aws.amazon.com/solutions/case-studies/acme",
      description:
        "Production deployment automated a customer support workflow and reduced handling time by 30%.",
      publishedAt: "2026-05-20",
      sourceName: "AWS",
      raw: {},
    });
    const frameworkScore = useCaseSearchRelevanceScore({
      id: "use-case:https://example.com/ai-measurement-framework",
      query: "enterprise AI customer story",
      title: "AI performance measurement framework",
      url: "https://example.com/ai-measurement-framework",
      description: "Best practices and methodology for evaluating AI initiatives.",
      publishedAt: "2026-05-21",
      sourceName: "Example",
      raw: {},
    });

    assert.ok(customerStoryScore > frameworkScore);
  });

  it("does not match low-relevance terms inside unrelated words", () => {
    const score = useCaseSearchRelevanceScore({
      id: "use-case:https://example.com/laptop-workflow",
      query: "enterprise AI workflow",
      title: "Enterprise laptop workflow deployment",
      url: "https://example.com/laptop-workflow",
      description: "A production workflow deployment for employee device support.",
      publishedAt: "2026-05-20",
      sourceName: "Example",
      raw: {},
    });

    assert.ok(score > 0);
  });

  it("returns structured search errors without failing the full collection", async () => {
    const result = await collectUseCaseSearchCandidates(
      config(),
      async (query) => {
        if (query === "bad query") {
          throw new Error("rate limit exceeded");
        }

        return [
          {
            title: "OpenAI customer workflow story",
            url: "https://openai.com/index/customer-workflow",
            description: "Named customer with production workflow metrics.",
            publishedAt: "2026-05-20",
            sourceName: "OpenAI",
            raw: {},
          },
        ];
      },
      ["bad query", "good query"],
    );

    assert.equal(result.candidates.length, 1);
    assert.deepEqual(result.searchErrors, [
      {
        query: "bad query",
        error: "rate limit exceeded",
      },
    ]);
  });
});
