// Purpose: Tests adaptive enterprise use-case pipeline orchestration.
// Scope: Covers bounded search retries without real Brave Search, model, or filesystem calls.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SearchWebResult } from "../src/brave-search/client.js";
import { loadPipelineConfig } from "../src/framework/pipeline/config.js";
import type { PipelineConfig, PipelineResult } from "../src/framework/pipeline/types.js";
import { runUseCaseAdaptivePipeline } from "../src/pipelines/useCases/commands.js";

function config(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  const base = loadPipelineConfig("use-cases");

  return {
    ...base,
    ...overrides,
    collectionMethods: overrides.collectionMethods ?? [
      {
        id: "open_web_search",
        collectorId: "brave_web_search_collector",
        enabled: true,
        queries: ["query one", "query two", "query three", "query four", "query five"],
      },
    ],
    limits: {
      ...base.limits,
      maxSearchQueries: 2,
      maxSearchResultsPerQuery: 1,
      maxCandidatesForExtraction: 10,
      maxResults: 3,
      maxUseCasesPerRun: 3,
      ...(overrides.limits ?? {}),
    },
    settings: {
      ...base.settings,
      searchRetry: {
        enabled: true,
        maxAttempts: 3,
      },
      ...(overrides.settings ?? {}),
    },
  };
}

function searchResult(query: string): SearchWebResult {
  return {
    title: `${query} customer story`,
    url: `https://openai.com/index/${query.replaceAll(" ", "-")}`,
    description: "Customer story about a production workflow with measurable business outcome.",
    publishedAt: "2026-06-01",
    sourceName: "OpenAI",
    raw: {},
  };
}

function pipelineResult(selected: number, metadata: Record<string, unknown> = {}): PipelineResult {
  return {
    pipelineId: "use_cases",
    runId: `run-${selected}`,
    status: "success",
    artifacts: [],
    counts: {
      selected,
    },
    errors: [],
    metadata,
  };
}

describe("adaptive use-case pipeline", () => {
  it("searches additional query batches until the target selection is available", async () => {
    const searchedQueries: string[] = [];
    const snapshots: Array<{
      candidateCount: number;
      metadata: unknown;
      queryCount: number;
      snapshotId: string;
    }> = [];
    const processCalls: Array<{
      mode: string;
      runMetadata?: Record<string, unknown>;
      snapshotId: string;
    }> = [];

    const result = await runUseCaseAdaptivePipeline(config(), {
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
      search: async (query) => {
        searchedQueries.push(query);
        return [searchResult(query)];
      },
      persistSnapshot: (_config, candidates, queryCount, metadata) => {
        const snapshotId = `snapshot-${snapshots.length + 1}`;
        snapshots.push({
          candidateCount: candidates.length,
          metadata,
          queryCount,
          snapshotId,
        });

        return {
          id: snapshotId,
          pipelineId: "use_cases",
        };
      },
      processSnapshot: async (_config, snapshotId, options) => {
        processCalls.push({
          mode: options.mode,
          runMetadata: options.runMetadata,
          snapshotId,
        });

        if (options.mode === "final") {
          return pipelineResult(3, options.runMetadata);
        }

        return pipelineResult(processCalls.length === 1 ? 1 : 3);
      },
    });

    assert.deepEqual(searchedQueries, ["query one", "query two", "query three", "query four"]);
    assert.deepEqual(
      snapshots.map((snapshot) => ({
        candidateCount: snapshot.candidateCount,
        queryCount: snapshot.queryCount,
      })),
      [
        { candidateCount: 2, queryCount: 2 },
        { candidateCount: 4, queryCount: 4 },
      ],
    );
    assert.deepEqual(
      processCalls.map((call) => ({ mode: call.mode, snapshotId: call.snapshotId })),
      [
        { mode: "probe", snapshotId: "snapshot-1" },
        { mode: "probe", snapshotId: "snapshot-2" },
        { mode: "final", snapshotId: "snapshot-2" },
      ],
    );
    assert.equal(result.counts.selected, 3);
    assert.deepEqual(result.metadata.adaptiveSearch, {
      enabled: true,
      targetCount: 3,
      maxAttempts: 3,
      attempts: [
        {
          attempt: 1,
          snapshotId: "snapshot-1",
          searchedQueries: 2,
          totalSearchedQueries: 2,
          candidateCount: 2,
          selectedCount: 1,
          searchErrors: 0,
        },
        {
          attempt: 2,
          snapshotId: "snapshot-2",
          searchedQueries: 2,
          totalSearchedQueries: 4,
          candidateCount: 4,
          selectedCount: 3,
          searchErrors: 0,
        },
      ],
      totalSearchedQueries: 4,
      searchErrors: [],
    });
  });

  it("fails clearly when no enabled query is available", async () => {
    await assert.rejects(
      () =>
        runUseCaseAdaptivePipeline(
          config({
            collectionMethods: [
              {
                id: "open_web_search",
                collectorId: "brave_web_search_collector",
                enabled: true,
                queries: [],
              },
            ],
          }),
          {
            search: async () => [searchResult("unexpected")],
            processSnapshot: async () => pipelineResult(0),
          },
        ),
      /did not run because no search queries were found/,
    );
  });

  it("keeps the final run metadata explicit instead of persisting arbitrary config metadata", async () => {
    const processRunMetadata: Array<Record<string, unknown> | undefined> = [];

    await runUseCaseAdaptivePipeline(
      config({
        metadata: {
          apiKey: "should-not-be-forwarded",
        },
      }),
      {
        search: async (query) => [searchResult(query)],
        persistSnapshot: (_config, _candidates, _queryCount) => ({
          id: "snapshot-1",
          pipelineId: "use_cases",
        }),
        processSnapshot: async (_config, _snapshotId, options) => {
          processRunMetadata.push(options.runMetadata);
          return pipelineResult(3, options.runMetadata);
        },
      },
    );

    assert.equal(processRunMetadata[0], undefined);
    assert.deepEqual(Object.keys(processRunMetadata[1] ?? {}), ["adaptiveSearch"]);
  });
});
