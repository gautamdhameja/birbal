// Purpose: Tests pipeline orchestrator behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { PipelineComponentRegistry } from "../src/framework/pipeline/registry.js";
import { runPipeline } from "../src/framework/pipeline/orchestrator.js";
import { ModelParseError } from "../src/framework/llm/repair.js";
import { registerFrameworkPipelineComponents } from "../src/framework/pipeline/defaultComponents.js";
import { HttpStatusError } from "../src/http/client.js";
import type { PipelineRunItem } from "../src/framework/pipeline/orchestrator.js";
import type {
  PipelineCollectionMethod,
  PipelineConfig,
  PipelineLogger,
} from "../src/framework/pipeline/types.js";

type ConfigOverrides = Omit<Partial<PipelineConfig>, "contentFetchPolicy"> & {
  contentFetchPolicy?: Partial<PipelineConfig["contentFetchPolicy"]>;
};

function writeConfig(value: PipelineConfig): string {
  const configPath = join(
    mkdtempSync(join(tmpdir(), "birbal-pipeline-orchestrator-")),
    "pipeline.json",
  );
  writeFileSync(configPath, JSON.stringify(value));
  return configPath;
}

function config(overrides: ConfigOverrides = {}): PipelineConfig {
  return {
    pipelineId: "research",
    enabled: true,
    description: "Test research pipeline.",
    sourceIds: ["source-a"],
    collectionMethods: [
      {
        id: "web",
        collectorId: "collector",
        sourceIds: ["source-a"],
      },
    ],
    scorerId: "scorer",
    classifierId: "classifier",
    structuredExtractorId: "structured_extractor",
    selectorId: "selector",
    rendererId: "renderer",
    output: {
      format: "markdown",
      artifactWriterId: "writer",
    },
    limits: {
      maxCandidates: 10,
    },
    ...overrides,
    contentFetchPolicy: {
      enabled: true,
      fetcherId: "fetcher",
      fetchForTopN: 10,
      maxChars: 12000,
      preferFetchedContent: false,
      ...overrides.contentFetchPolicy,
    },
    failurePolicy: overrides.failurePolicy ?? {
      failFast: false,
      continueOnSourceFailure: true,
      continueOnContentFetchFailure: true,
      continueOnScoringFailure: true,
      continueOnStructuredExtractionFailure: true,
      minItemsRequiredForSuccess: 1,
    },
  };
}

function silentLogger(): PipelineLogger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

function recordingLogger(logs: unknown[]): PipelineLogger {
  return {
    debug: () => undefined,
    info: (payload) => {
      logs.push(payload);
    },
    warn: () => undefined,
    error: () => undefined,
  };
}

function testSourceRegistry(): { sources: Array<{ id: string }> } {
  return {
    sources: [{ id: "source-a" }],
  };
}

describe("pipeline orchestrator", () => {
  it("runs configured generic pipeline components in order", async () => {
    const calls: string[] = [];
    const logs: unknown[] = [];
    const registry = new PipelineComponentRegistry();

    registry.registerCollector("collector", {
      collect: async (method, context) => {
        const collectionMethod = method as PipelineCollectionMethod;
        calls.push(`collect:${collectionMethod.id}:${context.pipelineId}`);
        return [
          { id: "first", title: "First" },
          { id: "second", title: "Second" },
        ];
      },
    });
    registry.registerContentFetcher("fetcher", {
      fetch: async (item) => {
        const runItem = item as PipelineRunItem;
        calls.push(`fetch:${runItem.id}`);
        return { html: `<article>${runItem.id}</article>` };
      },
    });
    registry.registerContentExtractor("extractor", {
      extract: async (content) => {
        calls.push("extract");
        return { text: JSON.stringify(content) };
      },
    });
    registry.registerScorer("scorer", {
      score: async (item) => {
        const runItem = item as PipelineRunItem;
        calls.push(`score:${runItem.id}`);
        return { finalScore: runItem.id === "first" ? 5 : 4 };
      },
    });
    registry.registerClassifier("classifier", {
      classify: async (item) => {
        const runItem = item as PipelineRunItem;
        calls.push(`classify:${runItem.id}`);
        return "category";
      },
    });
    registry.registerStructuredExtractor("structured_extractor", {
      extractStructured: async (item) => {
        const runItem = item as PipelineRunItem;
        calls.push(`structured:${runItem.id}`);
        return { itemId: runItem.id };
      },
    });
    registry.registerSelector("selector", {
      select: async (items) => {
        const runItems = items as PipelineRunItem[];
        calls.push(`select:${runItems.length}`);
        assert.equal(runItems[0]?.classification, "category");
        assert.deepEqual(runItems[0]?.structuredData, { itemId: "first" });
        assert.deepEqual(runItems[0]?.extractedContent, [
          { text: '{"html":"<article>first</article>"}' },
        ]);
        return [runItems[0]];
      },
    });
    registry.registerRenderer("renderer", {
      render: async (items) => {
        const selectedItems = items as PipelineRunItem[];
        calls.push(`render:${selectedItems.length}`);
        return "rendered artifact";
      },
    });
    registry.registerArtifactWriter("writer", {
      write: async (output, context) => {
        calls.push(`write:${String(output)}:${context.runId}`);
        return {
          id: "artifact",
          type: "markdown",
          path: "artifact.md",
        };
      },
    });

    const finishedRuns: unknown[] = [];
    const failedRuns: string[] = [];
    const result = await runPipeline(
      writeConfig(
        config({
          contentFetchPolicy: {
            extractorIds: ["extractor"],
          },
        }),
      ),
      {
        startRun: () => "run-1",
        finishRun: (_runId, summary) => {
          finishedRuns.push(summary);
        },
        failRun: (_runId, errorSummary) => {
          failedRuns.push(errorSummary);
        },
        loadSourceRegistry: testSourceRegistry,
        logger: recordingLogger(logs),
        now: (() => {
          const dates = [
            new Date("2026-05-23T08:00:00.000Z"),
            new Date("2026-05-23T08:00:05.000Z"),
          ];
          return () => dates.shift() ?? new Date("2026-05-23T08:00:05.000Z");
        })(),
        registry,
        runMetadata: {
          searchSnapshotId: "snapshot-1",
        },
      },
    );

    assert.equal(result.pipelineId, "research");
    assert.equal(result.runId, "run-1");
    assert.equal(result.status, "success");
    assert.deepEqual(result.artifacts, [
      {
        id: "artifact",
        type: "markdown",
        path: "artifact.md",
      },
    ]);
    assert.deepEqual(result.counts, {
      collectionMethodsRun: 1,
      collected: 2,
      contentFetched: 2,
      contentExtracted: 2,
      scored: 2,
      classified: 2,
      structuredExtracted: 2,
      selected: 1,
      rendered: 1,
      artifactsWritten: 1,
    });
    assert.deepEqual(result.errors, []);
    assert.equal(result.metadata.searchSnapshotId, "snapshot-1");
    assert.equal(result.metadata.startedAt, "2026-05-23T08:00:00.000Z");
    assert.equal(result.metadata.finishedAt, "2026-05-23T08:00:05.000Z");
    assert.equal(result.metadata.durationMs, 5000);
    assert.deepEqual(calls, [
      "collect:web:research",
      "fetch:first",
      "extract",
      "fetch:second",
      "extract",
      "score:first",
      "score:second",
      "classify:first",
      "classify:second",
      "structured:first",
      "structured:second",
      "select:2",
      "render:1",
      "write:rendered artifact:run-1",
    ]);
    assert.equal(finishedRuns.length, 1);
    assert.deepEqual(failedRuns, []);
    assert.deepEqual(logs, [
      {
        event: "pipeline.run.started",
        pipelineId: "research",
        runId: "run-1",
        startedAt: "2026-05-23T08:00:00.000Z",
      },
      {
        event: "pipeline.run.finished",
        pipelineId: "research",
        runId: "run-1",
        status: "success",
        startedAt: "2026-05-23T08:00:00.000Z",
        finishedAt: "2026-05-23T08:00:05.000Z",
        durationMs: 5000,
        counts: result.counts,
        artifactCount: 1,
        errorCount: 0,
      },
    ]);
  });

  it("returns a failed result when configured components cannot be resolved", async () => {
    const result = await runPipeline(writeConfig(config()), {
      startRun: () => "run-2",
      finishRun: () => undefined,
      failRun: () => undefined,
      loadSourceRegistry: testSourceRegistry,
      logger: silentLogger(),
      now: () => new Date("2026-05-23T08:00:00.000Z"),
      registry: new PipelineComponentRegistry(),
    });

    assert.equal(result.status, "failed");
    assert.equal(result.artifacts.length, 0);
    assert.equal(result.errors[0]?.code, "component_resolution_failed");
    assert.match(result.errors[0]?.message ?? "", /Unknown pipeline component/);
  });

  it("allows pipelines to skip the scoring stage", async () => {
    const registry = new PipelineComponentRegistry();

    registry.registerCollector("collector", {
      collect: async () => [{ id: "first" }],
    });
    registry.registerSelector("selector", {
      select: async (items) => items,
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered artifact",
    });
    registry.registerArtifactWriter("writer", {
      write: async () => ({
        id: "artifact",
        type: "markdown",
        path: "artifact.md",
      }),
    });

    const result = await runPipeline(
      writeConfig(
        config({
          scorerId: undefined,
          classifierId: undefined,
          structuredExtractorId: undefined,
          contentFetchPolicy: {
            enabled: false,
          },
        }),
      ),
      {
        startRun: () => "run-no-score",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: testSourceRegistry,
        logger: silentLogger(),
        now: () => new Date("2026-05-23T08:00:00.000Z"),
        registry,
      },
    );

    assert.equal(result.status, "success");
    assert.equal(result.counts.scored, undefined);
    assert.equal(result.counts.selected, 1);
  });

  it("returns a partial result when non-critical item stages fail but an artifact is written", async () => {
    const registry = new PipelineComponentRegistry();
    const finishedRuns: unknown[] = [];

    registry.registerCollector("collector", {
      collect: async () => [{ id: "first" }, { id: "second" }],
    });
    registry.registerContentFetcher("fetcher", {
      fetch: async (item) => {
        const runItem = item as PipelineRunItem;
        if (runItem.id === "second") {
          throw new Error("blocked");
        }

        return { text: runItem.id };
      },
    });
    registry.registerScorer("scorer", {
      score: async () => ({ finalScore: 1 }),
    });
    registry.registerSelector("selector", {
      select: async (items) => items,
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered",
    });
    registry.registerArtifactWriter("writer", {
      write: async () => ({ id: "artifact", type: "markdown" }),
    });

    const result = await runPipeline(
      writeConfig(
        config({
          classifierId: undefined,
          structuredExtractorId: undefined,
          contentFetchPolicy: {
            enabled: true,
            fetcherId: "fetcher",
          },
        }),
      ),
      {
        startRun: () => "run-3",
        finishRun: (_runId, summary) => {
          finishedRuns.push(summary);
        },
        failRun: () => undefined,
        loadSourceRegistry: testSourceRegistry,
        logger: silentLogger(),
        now: () => new Date("2026-05-23T08:00:00.000Z"),
        registry,
      },
    );

    assert.equal(result.status, "partial_success");
    assert.equal(result.counts.contentFetched, 1);
    assert.equal(result.counts.contentFetchErrors, 1);
    assert.equal(result.counts.artifactsWritten, 1);
    assert.equal(result.errors[0]?.code, "content_fetch_failed");
    assert.equal(finishedRuns.length, 1);
  });

  it("treats structured failed content fetch results as fetch failures", async () => {
    const registry = new PipelineComponentRegistry();

    registry.registerCollector("collector", {
      collect: async () => [{ id: "first" }],
    });
    registry.registerContentFetcher("fetcher", {
      fetch: async () => ({
        url: "https://example.com/blocked",
        title: "",
        plainText: "",
        contentLength: 0,
        fetchStatus: "failed",
        error: {
          message: "blocked",
          code: "fetch_failed",
        },
      }),
    });
    registry.registerScorer("scorer", {
      score: async () => ({ finalScore: 1 }),
    });
    registry.registerSelector("selector", {
      select: async (items) => items,
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered",
    });
    registry.registerArtifactWriter("writer", {
      write: async () => ({ id: "artifact", type: "markdown" }),
    });

    const result = await runPipeline(
      writeConfig(
        config({
          classifierId: undefined,
          structuredExtractorId: undefined,
          contentFetchPolicy: {
            enabled: true,
            fetcherId: "fetcher",
          },
        }),
      ),
      {
        startRun: () => "run-structured-fetch-failure",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: testSourceRegistry,
        logger: silentLogger(),
        now: () => new Date("2026-05-23T08:00:00.000Z"),
        registry,
      },
    );

    assert.equal(result.status, "partial_success");
    assert.equal(result.counts.contentFetched, undefined);
    assert.equal(result.counts.contentFetchErrors, 1);
    assert.equal(result.errors[0]?.code, "content_fetch_failed");
    assert.equal(result.errors[0]?.message, "blocked");
  });

  it("can prefer fetched content before later pipeline stages", async () => {
    const registry = new PipelineComponentRegistry();

    registry.registerCollector("collector", {
      collect: async () => [{ id: "snippet-only" }, { id: "full-text" }],
    });
    registry.registerContentFetcher("fetcher", {
      fetch: async (item) => {
        const runItem = item as PipelineRunItem;
        return {
          fetchStatus: runItem.id === "snippet-only" ? "failed" : "fetched",
          error: runItem.id === "snippet-only" ? { message: "blocked" } : undefined,
        };
      },
    });
    registry.registerScorer("scorer", {
      score: async () => ({ finalScore: 1 }),
    });
    registry.registerSelector("selector", {
      select: async (items) => {
        assert.deepEqual(
          (items as PipelineRunItem[]).map((item) => item.id),
          ["full-text", "snippet-only"],
        );
        return items;
      },
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered",
    });
    registry.registerArtifactWriter("writer", {
      write: async () => ({ id: "artifact", type: "markdown" }),
    });

    const result = await runPipeline(
      writeConfig(
        config({
          classifierId: undefined,
          structuredExtractorId: undefined,
          contentFetchPolicy: {
            enabled: true,
            fetcherId: "fetcher",
            preferFetchedContent: true,
          },
        }),
      ),
      {
        startRun: () => "run-prefer-fetched",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: testSourceRegistry,
        logger: silentLogger(),
        now: () => new Date("2026-05-23T08:00:00.000Z"),
        registry,
      },
    );

    assert.equal(result.status, "partial_success");
    assert.equal(result.counts.contentFetched, 1);
    assert.equal(result.counts.contentFetchErrors, 1);
  });

  it("drops unscored items when scoring failures are continuable", async () => {
    const registry = new PipelineComponentRegistry();

    registry.registerCollector("collector", {
      collect: async () => [{ id: "first" }, { id: "second" }],
    });
    registry.registerScorer("scorer", {
      score: async (item) => {
        const runItem = item as PipelineRunItem;
        if (runItem.id === "second") {
          throw new Error("score unavailable");
        }

        return { finalScore: 1 };
      },
    });
    registry.registerSelector("selector", {
      select: async (items) => {
        const runItems = items as PipelineRunItem[];
        assert.deepEqual(
          runItems.map((item) => item.id),
          ["first"],
        );
        assert.deepEqual(runItems[0]?.score, { finalScore: 1 });
        return runItems;
      },
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered",
    });
    registry.registerArtifactWriter("writer", {
      write: async () => ({ id: "artifact", type: "markdown" }),
    });

    const result = await runPipeline(
      writeConfig(
        config({
          contentFetchPolicy: {
            enabled: false,
          },
          classifierId: undefined,
          structuredExtractorId: undefined,
          failurePolicy: {
            failFast: false,
            continueOnSourceFailure: true,
            continueOnContentFetchFailure: true,
            continueOnScoringFailure: true,
            continueOnStructuredExtractionFailure: true,
            minItemsRequiredForSuccess: 1,
          },
        }),
      ),
      {
        startRun: () => "run-scoring-partial",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: testSourceRegistry,
        logger: silentLogger(),
        now: () => new Date("2026-05-23T08:00:00.000Z"),
        registry,
      },
    );

    assert.equal(result.status, "partial_success");
    assert.equal(result.counts.scored, 1);
    assert.equal(result.counts.scoreErrors, 1);
    assert.equal(result.counts.selected, 1);
    assert.equal(result.errors[0]?.code, "score_failed");
  });

  it("fails when a source fails and source failures are not continuable", async () => {
    const registry = new PipelineComponentRegistry();

    registry.registerCollector("collector", {
      collect: async () => {
        throw new Error("source down");
      },
    });
    registry.registerScorer("scorer", {
      score: async () => ({ finalScore: 1 }),
    });
    registry.registerSelector("selector", {
      select: async (items) => items,
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered",
    });
    registry.registerArtifactWriter("writer", {
      write: async () => ({ id: "artifact", type: "markdown" }),
    });

    const result = await runPipeline(
      writeConfig(
        config({
          contentFetchPolicy: {
            enabled: false,
          },
          classifierId: undefined,
          structuredExtractorId: undefined,
          failurePolicy: {
            failFast: false,
            continueOnSourceFailure: false,
            continueOnContentFetchFailure: true,
            continueOnScoringFailure: true,
            continueOnStructuredExtractionFailure: true,
            minItemsRequiredForSuccess: 1,
          },
        }),
      ),
      {
        startRun: () => "run-source-failure",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: testSourceRegistry,
        logger: silentLogger(),
        now: () => new Date("2026-05-23T08:00:00.000Z"),
        registry,
      },
    );

    assert.equal(result.status, "failed");
    assert.equal(result.counts.collectionErrors, 1);
    assert.equal(result.errors[0]?.code, "collection_failed");
    assert.equal(result.errors.at(-1)?.code, "failure_policy_abort");
  });

  it("stops dequeuing collection methods after a non-continuable source failure", async () => {
    const registry = new PipelineComponentRegistry();
    const startedMethods: string[] = [];

    registry.registerCollector("collector", {
      collect: async (method) => {
        const collectionMethod = method as PipelineCollectionMethod;
        startedMethods.push(collectionMethod.id);
        if (collectionMethod.id === "web-1") {
          await Promise.resolve();
          throw new Error("source down");
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
        return [];
      },
    });
    registry.registerSelector("selector", {
      select: async (items) => items,
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered",
    });
    registry.registerArtifactWriter("writer", {
      write: async () => ({ id: "artifact", type: "markdown" }),
    });

    const result = await runPipeline(
      writeConfig(
        config({
          collectionMethods: ["web-1", "web-2", "web-3", "web-4"].map((id) => ({
            id,
            collectorId: "collector",
            sourceIds: ["source-a"],
          })),
          execution: {
            collectionConcurrency: 2,
          },
          contentFetchPolicy: {
            enabled: false,
          },
          scorerId: undefined,
          classifierId: undefined,
          structuredExtractorId: undefined,
          failurePolicy: {
            failFast: false,
            continueOnSourceFailure: false,
            continueOnContentFetchFailure: true,
            continueOnScoringFailure: true,
            continueOnStructuredExtractionFailure: true,
            minItemsRequiredForSuccess: 1,
          },
        }),
      ),
      {
        startRun: () => "run-source-fail-fast",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: testSourceRegistry,
        logger: silentLogger(),
        now: () => new Date("2026-05-23T08:00:00.000Z"),
        registry,
      },
    );

    assert.equal(result.status, "failed");
    assert.deepEqual(startedMethods, ["web-1", "web-2"]);
    assert.equal(result.counts.collectionErrors, 1);
  });

  it("marks structured collector errors as partial when source failures are continuable", async () => {
    const registry = new PipelineComponentRegistry();

    registry.registerCollector("collector", {
      collect: async () => ({
        items: [{ id: "first" }],
        errors: [
          {
            message: "one query failed",
            code: "source_collection_failed",
            metadata: { query: "bad query" },
          },
        ],
      }),
    });
    registry.registerScorer("scorer", {
      score: async () => ({ finalScore: 1 }),
    });
    registry.registerSelector("selector", {
      select: async (items) => items,
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered",
    });
    registry.registerArtifactWriter("writer", {
      write: async () => ({ id: "artifact", type: "markdown" }),
    });

    const result = await runPipeline(
      writeConfig(
        config({
          contentFetchPolicy: {
            enabled: false,
          },
          classifierId: undefined,
          structuredExtractorId: undefined,
        }),
      ),
      {
        startRun: () => "run-source-partial",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: testSourceRegistry,
        logger: silentLogger(),
        now: () => new Date("2026-05-23T08:00:00.000Z"),
        registry,
      },
    );

    assert.equal(result.status, "partial_success");
    assert.equal(result.counts.collectionErrors, 1);
    assert.equal(result.counts.selected, 1);
    assert.equal(result.errors[0]?.code, "source_collection_failed");
  });

  it("can stop after the first structured extraction failure", async () => {
    const registry = new PipelineComponentRegistry();

    registry.registerCollector("collector", {
      collect: async () => [{ id: "first" }, { id: "second" }],
    });
    registry.registerStructuredExtractor("structured_extractor", {
      extractStructured: async () => {
        throw new Error("model unavailable");
      },
    });
    registry.registerSelector("selector", {
      select: async (items) => items,
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered",
    });
    registry.registerArtifactWriter("writer", {
      write: async () => ({ id: "artifact", type: "markdown" }),
    });

    const result = await runPipeline(
      writeConfig(
        config({
          contentFetchPolicy: {
            enabled: false,
          },
          scorerId: undefined,
          classifierId: undefined,
          failurePolicy: {
            failFast: false,
            continueOnSourceFailure: true,
            continueOnContentFetchFailure: true,
            continueOnScoringFailure: true,
            continueOnStructuredExtractionFailure: false,
            minItemsRequiredForSuccess: 1,
          },
        }),
      ),
      {
        startRun: () => "run-structured-failure-stop",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: testSourceRegistry,
        logger: silentLogger(),
        now: () => new Date("2026-05-23T08:00:00.000Z"),
        registry,
      },
    );

    assert.equal(result.status, "failed");
    assert.equal(result.counts.structuredExtractionErrors, 1);
    assert.equal(result.counts.selected, undefined);
    assert.equal(result.errors[0]?.code, "structured_extraction_failed");
    assert.equal(result.errors.at(-1)?.code, "failure_policy_abort");
  });

  it("rejects pipeline configs that reference unknown source IDs", async () => {
    const registry = new PipelineComponentRegistry();

    registry.registerCollector("collector", {
      collect: async () => [{ id: "first" }],
    });
    registry.registerScorer("scorer", {
      score: async () => ({ finalScore: 1 }),
    });
    registry.registerSelector("selector", {
      select: async (items) => items,
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered",
    });
    registry.registerArtifactWriter("writer", {
      write: async () => ({ id: "artifact", type: "markdown" }),
    });

    const result = await runPipeline(
      writeConfig(
        config({
          sourceIds: ["missing-source"],
          collectionMethods: [
            {
              id: "web",
              collectorId: "collector",
              sourceIds: ["missing-source"],
            },
          ],
        }),
      ),
      {
        startRun: () => "run-unknown-source",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: testSourceRegistry,
        logger: silentLogger(),
        now: () => new Date("2026-05-23T08:00:00.000Z"),
        registry,
      },
    );

    assert.equal(result.status, "failed");
    assert.equal(result.errors[0]?.code, "source_registry_load_failed");
    assert.match(result.errors[0]?.message ?? "", /unknown source IDs: missing-source/);
  });

  it("fails when selected output is below the configured minimum", async () => {
    const registry = new PipelineComponentRegistry();

    registry.registerCollector("collector", {
      collect: async () => [{ id: "first" }, { id: "second" }],
    });
    registry.registerScorer("scorer", {
      score: async () => ({ finalScore: 1 }),
    });
    registry.registerSelector("selector", {
      select: async () => [],
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered",
    });
    registry.registerArtifactWriter("writer", {
      write: async () => ({ id: "artifact", type: "markdown" }),
    });

    const result = await runPipeline(
      writeConfig(
        config({
          contentFetchPolicy: {
            enabled: false,
          },
          classifierId: undefined,
          structuredExtractorId: undefined,
          failurePolicy: {
            failFast: false,
            continueOnSourceFailure: true,
            continueOnContentFetchFailure: true,
            continueOnScoringFailure: true,
            continueOnStructuredExtractionFailure: true,
            minItemsRequiredForSuccess: 1,
          },
        }),
      ),
      {
        startRun: () => "run-minimum-output",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: testSourceRegistry,
        logger: silentLogger(),
        now: () => new Date("2026-05-23T08:00:00.000Z"),
        registry,
      },
    );

    assert.equal(result.status, "failed");
    assert.equal(result.counts.selected, 0);
    assert.equal(result.counts.artifactsWritten, undefined);
    assert.equal(result.errors.at(-1)?.code, "failure_policy_abort");
  });

  it("runs finalization only after the artifact writer succeeds", async () => {
    const registry = new PipelineComponentRegistry();
    let finalized = false;

    registry.registerCollector("collector", {
      collect: async () => [{ id: "first" }],
    });
    registry.registerSelector("selector", {
      select: async (items) => items,
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered",
    });
    registry.registerArtifactWriter("writer", {
      write: async () => {
        throw new Error("disk unavailable");
      },
    });
    registry.registerFinalizer("finalizer", {
      finalize: async () => {
        finalized = true;
      },
    });

    const result = await runPipeline(
      writeConfig(
        config({
          contentFetchPolicy: { enabled: false },
          scorerId: undefined,
          classifierId: undefined,
          structuredExtractorId: undefined,
          finalizerId: "finalizer",
        }),
      ),
      {
        startRun: () => "run-finalizer-order",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: testSourceRegistry,
        logger: silentLogger(),
        now: () => new Date("2026-05-23T08:00:00.000Z"),
        registry,
      },
    );

    assert.equal(result.status, "failed");
    assert.equal(finalized, false);
  });

  it("sanitizes large error causes before returning pipeline errors", async () => {
    const registry = new PipelineComponentRegistry();
    const largeBody = "<html>".repeat(1_000);

    registry.registerCollector("collector", {
      collect: async () => [{ id: "blocked" }],
    });
    registry.registerContentFetcher("fetcher", {
      fetch: async () => {
        throw new HttpStatusError(`blocked: ${largeBody}`, 403, "Forbidden", largeBody);
      },
    });
    registry.registerScorer("scorer", {
      score: async () => ({ finalScore: 1 }),
    });
    registry.registerSelector("selector", {
      select: async (items) => items,
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered",
    });
    registry.registerArtifactWriter("writer", {
      write: async () => ({ id: "artifact", type: "markdown" }),
    });

    const result = await runPipeline(
      writeConfig(
        config({
          classifierId: undefined,
          structuredExtractorId: undefined,
          contentFetchPolicy: {
            enabled: true,
            fetcherId: "fetcher",
          },
        }),
      ),
      {
        startRun: () => "run-4",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: testSourceRegistry,
        logger: silentLogger(),
        now: () => new Date("2026-05-23T08:00:00.000Z"),
        registry,
      },
    );

    const error = result.errors[0];
    assert.equal(error?.code, "content_fetch_failed");
    assert.ok((error?.message.length ?? 0) < largeBody.length);
    assert.deepEqual(error?.cause, {
      name: "HttpStatusError",
      status: 403,
      statusText: "Forbidden",
      bodyPreview: `${largeBody.slice(0, 500)}...`,
    });
  });

  it("preserves structured model parse details in pipeline errors", async () => {
    const registry = new PipelineComponentRegistry();

    registry.registerCollector("collector", {
      collect: async () => [{ id: "bad-model-output" }],
    });
    registry.registerScorer("scorer", {
      score: async () => {
        throw new ModelParseError({
          type: "model_parse_error",
          message: "Model output failed JSON parsing or schema validation after repair.",
          invalidOutput: "not json",
          schemaDescription: '{"type":"object"}',
          validationError: "No JSON object found.",
          repairAttempted: true,
          repairedOutput: '{"score":99}',
          repairValidationError: "score must be <= 5",
        });
      },
    });
    registry.registerSelector("selector", {
      select: async (items) => items,
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered",
    });
    registry.registerArtifactWriter("writer", {
      write: async () => ({ id: "artifact", type: "markdown" }),
    });

    const result = await runPipeline(
      writeConfig(
        config({
          contentFetchPolicy: {
            enabled: false,
          },
          classifierId: undefined,
          structuredExtractorId: undefined,
          failurePolicy: {
            failFast: false,
            continueOnSourceFailure: true,
            continueOnContentFetchFailure: true,
            continueOnScoringFailure: true,
            continueOnStructuredExtractionFailure: true,
            minItemsRequiredForSuccess: 1,
          },
        }),
      ),
      {
        startRun: () => "run-model-parse-error",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: testSourceRegistry,
        logger: silentLogger(),
        now: () => new Date("2026-05-23T08:00:00.000Z"),
        registry,
      },
    );

    assert.equal(result.status, "failed");
    assert.equal(result.errors[0]?.code, "score_failed");
    assert.deepEqual(result.errors[0]?.cause, {
      name: "ModelParseError",
      type: "model_parse_error",
      message: "Model output failed JSON parsing or schema validation after repair.",
      details: {
        type: "model_parse_error",
        message: "Model output failed JSON parsing or schema validation after repair.",
        invalidOutput: "not json",
        schemaDescription: '{"type":"object"}',
        validationError: "No JSON object found.",
        repairAttempted: true,
        repairedOutput: '{"score":99}',
        repairValidationError: "score must be <= 5",
      },
    });
  });

  it("uses optional batch scorer when configured", async () => {
    const registry = new PipelineComponentRegistry();
    const calls: string[] = [];

    registry.registerCollector("collector", {
      collect: async () => [{ id: "first" }, { id: "second" }, { id: "third" }],
    });
    registry.registerScorer("scorer", {
      score: async () => {
        throw new Error("single scorer should not be used");
      },
      scoreBatch: async (items) => {
        const runItems = items as PipelineRunItem[];
        calls.push(runItems.map((item) => item.id).join(","));
        return runItems.map((item) => ({ finalScore: item.id.length }));
      },
    });
    registry.registerSelector("selector", {
      select: async (items) => items,
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered",
    });
    registry.registerArtifactWriter("writer", {
      write: async () => ({ id: "artifact", type: "markdown" }),
    });

    const result = await runPipeline(
      writeConfig(
        config({
          contentFetchPolicy: {
            enabled: false,
          },
          classifierId: undefined,
          structuredExtractorId: undefined,
          execution: {
            batchSize: {
              scoring: 2,
            },
          },
        }),
      ),
      {
        startRun: () => "run-5",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: testSourceRegistry,
        logger: silentLogger(),
        now: () => new Date("2026-05-23T08:00:00.000Z"),
        registry,
      },
    );

    assert.equal(result.status, "success");
    assert.deepEqual(calls, ["first,second", "third"]);
    assert.equal(result.counts.scored, 3);
  });

  it("deduplicates collected URL items across collection methods", async () => {
    const registry = new PipelineComponentRegistry();
    let fetched = 0;

    registry.registerCollector("collector", {
      collect: async () => [{ id: "first", url: "https://example.com/report#section" }],
    });
    registry.registerContentFetcher("fetcher", {
      fetch: async () => {
        fetched += 1;
        return { fetchStatus: "fetched" };
      },
    });
    registry.registerScorer("scorer", {
      score: async () => ({ finalScore: 1 }),
    });
    registry.registerSelector("selector", {
      select: async (items) => items,
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered",
    });
    registry.registerArtifactWriter("writer", {
      write: async () => ({ id: "artifact", type: "markdown" }),
    });

    const result = await runPipeline(
      writeConfig(
        config({
          collectionMethods: [
            {
              id: "first",
              collectorId: "collector",
            },
            {
              id: "second",
              collectorId: "collector",
            },
          ],
          classifierId: undefined,
          structuredExtractorId: undefined,
        }),
      ),
      {
        startRun: () => "run-dedupe",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: testSourceRegistry,
        logger: silentLogger(),
        now: () => new Date("2026-05-23T08:00:00.000Z"),
        registry,
      },
    );

    assert.equal(result.status, "success");
    assert.equal(result.counts.collected, 2);
    assert.equal(result.counts.duplicatesRemoved, 1);
    assert.equal(fetched, 1);
  });

  it("rejects filesystem artifact paths outside the workspace", async () => {
    const registry = new PipelineComponentRegistry();
    registerFrameworkPipelineComponents(registry);

    registry.registerCollector("collector", {
      collect: async () => [{ id: "first" }],
    });
    registry.registerScorer("scorer", {
      score: async () => ({ finalScore: 1 }),
    });
    registry.registerSelector("selector", {
      select: async (items) => items,
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered",
    });

    const result = await runPipeline(
      writeConfig(
        config({
          contentFetchPolicy: {
            enabled: false,
          },
          classifierId: undefined,
          structuredExtractorId: undefined,
          output: {
            format: "markdown",
            artifactWriterId: "filesystem_artifact_writer",
            directory: "..",
            filenameTemplate: "outside.md",
          },
        }),
      ),
      {
        startRun: () => "run-output-path",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: testSourceRegistry,
        logger: silentLogger(),
        now: () => new Date("2026-05-23T08:00:00.000Z"),
        registry,
      },
    );

    assert.equal(result.status, "failed");
    assert.equal(result.errors.at(-1)?.code, "pipeline_failed");
    assert.match(result.errors.at(-1)?.message ?? "", /inside the workspace/);
  });

  it("renders timestamped filesystem artifact paths", async () => {
    const registry = new PipelineComponentRegistry();
    const outputDirectory = `.tmp-pipeline-output-${Date.now()}`;

    registerFrameworkPipelineComponents(registry);
    registry.registerCollector("collector", {
      collect: async () => [{ id: "first" }],
    });
    registry.registerScorer("scorer", {
      score: async () => ({ finalScore: 1 }),
    });
    registry.registerSelector("selector", {
      select: async (items) => items,
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered",
    });

    try {
      const result = await runPipeline(
        writeConfig(
          config({
            contentFetchPolicy: {
              enabled: false,
            },
            classifierId: undefined,
            structuredExtractorId: undefined,
            output: {
              format: "markdown",
              artifactWriterId: "filesystem_artifact_writer",
              directory: outputDirectory,
              filenameTemplate: "{date}-{time}.md",
            },
          }),
        ),
        {
          startRun: () => "run-output-timestamp",
          finishRun: () => undefined,
          failRun: () => undefined,
          loadSourceRegistry: testSourceRegistry,
          logger: silentLogger(),
          now: () => new Date("2026-05-23T08:09:10.000Z"),
          registry,
        },
      );

      assert.equal(result.status, "success");
      assert.equal(
        result.artifacts[0]?.path,
        join(process.cwd(), outputDirectory, "2026-05-23-080910.md"),
      );
      assert.equal(existsSync(result.artifacts[0]?.path ?? ""), true);
    } finally {
      rmSync(join(process.cwd(), outputDirectory), { force: true, recursive: true });
    }
  });

  it("rejects filesystem artifact paths that resolve through symlinks outside the workspace", async () => {
    const registry = new PipelineComponentRegistry();
    const linkName = `.tmp-pipeline-output-link-${Date.now()}`;
    const outsideDirectory = mkdtempSync(join(tmpdir(), "birbal-artifact-outside-"));

    registerFrameworkPipelineComponents(registry);
    symlinkSync(outsideDirectory, join(process.cwd(), linkName), "dir");

    registry.registerCollector("collector", {
      collect: async () => [{ id: "first" }],
    });
    registry.registerScorer("scorer", {
      score: async () => ({ finalScore: 1 }),
    });
    registry.registerSelector("selector", {
      select: async (items) => items,
    });
    registry.registerRenderer("renderer", {
      render: async () => "rendered",
    });

    try {
      const result = await runPipeline(
        writeConfig(
          config({
            contentFetchPolicy: {
              enabled: false,
            },
            classifierId: undefined,
            structuredExtractorId: undefined,
            output: {
              format: "markdown",
              artifactWriterId: "filesystem_artifact_writer",
              directory: linkName,
              filenameTemplate: "outside.md",
            },
          }),
        ),
        {
          startRun: () => "run-output-symlink",
          finishRun: () => undefined,
          failRun: () => undefined,
          loadSourceRegistry: testSourceRegistry,
          logger: silentLogger(),
          now: () => new Date("2026-05-23T08:00:00.000Z"),
          registry,
        },
      );

      assert.equal(result.status, "failed");
      assert.equal(result.errors.at(-1)?.code, "pipeline_failed");
      assert.match(result.errors.at(-1)?.message ?? "", /outside the workspace/);
    } finally {
      rmSync(join(process.cwd(), linkName), { force: true, recursive: true });
      rmSync(outsideDirectory, { force: true, recursive: true });
    }
  });
});
