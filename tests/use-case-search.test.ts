// Purpose: Tests use case search behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectUseCaseSearchCandidates,
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

  it("deduplicates, drops undated results, and prioritizes trusted domains", async () => {
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
        "https://openai.com/index/customer-workflow",
        "https://microsoft.com/en/customers/story/acme?utm_source=test",
      ],
    );
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
