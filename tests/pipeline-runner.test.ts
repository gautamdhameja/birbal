import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { PipelineComponentRegistry } from "../src/framework/pipeline/registry.js";
import { runPipeline } from "../src/framework/pipeline/runner.js";
import { HttpStatusError } from "../src/http/client.js";
import type { PipelineRunItem } from "../src/framework/pipeline/runner.js";
import type {
  PipelineCollectionMethod,
  PipelineConfig,
  PipelineLogger,
} from "../src/framework/pipeline/types.js";

function writeConfig(value: PipelineConfig): string {
  const configPath = join(mkdtempSync(join(tmpdir(), "birbal-pipeline-runner-")), "pipeline.json");
  writeFileSync(configPath, JSON.stringify(value));
  return configPath;
}

function config(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
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
    contentFetchPolicy: {
      enabled: true,
      fetcherId: "fetcher",
      extractorIds: ["extractor"],
      requireFetchedContent: true,
    },
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
    failurePolicy: overrides.failurePolicy ?? {
      failFast: false,
      continueOnSourceFailure: true,
      continueOnContentFetchFailure: true,
      continueOnScoringFailure: true,
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

describe("pipeline runner", () => {
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
    const result = await runPipeline(writeConfig(config()), {
      startRun: () => "run-1",
      finishRun: (_runId, summary) => {
        finishedRuns.push(summary);
      },
      failRun: (_runId, errorSummary) => {
        failedRuns.push(errorSummary);
      },
      loadSourceRegistry: () => ({ sources: [] }),
      logger: recordingLogger(logs),
      now: (() => {
        const dates = [new Date("2026-05-23T08:00:00.000Z"), new Date("2026-05-23T08:00:05.000Z")];
        return () => dates.shift() ?? new Date("2026-05-23T08:00:05.000Z");
      })(),
      registry,
    });

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
      loadSourceRegistry: () => ({ sources: [] }),
      logger: silentLogger(),
      now: () => new Date("2026-05-23T08:00:00.000Z"),
      registry: new PipelineComponentRegistry(),
    });

    assert.equal(result.status, "failed");
    assert.equal(result.artifacts.length, 0);
    assert.equal(result.errors[0]?.code, "component_resolution_failed");
    assert.match(result.errors[0]?.message ?? "", /Unknown pipeline component/);
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
            requireFetchedContent: false,
          },
        }),
      ),
      {
        startRun: () => "run-3",
        finishRun: (_runId, summary) => {
          finishedRuns.push(summary);
        },
        failRun: () => undefined,
        loadSourceRegistry: () => ({ sources: [] }),
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
            minItemsRequiredForSuccess: 1,
          },
        }),
      ),
      {
        startRun: () => "run-source-failure",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: () => ({ sources: [] }),
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
            minItemsRequiredForSuccess: 1,
          },
        }),
      ),
      {
        startRun: () => "run-minimum-output",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: () => ({ sources: [] }),
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
            requireFetchedContent: false,
          },
        }),
      ),
      {
        startRun: () => "run-4",
        finishRun: () => undefined,
        failRun: () => undefined,
        loadSourceRegistry: () => ({ sources: [] }),
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
        loadSourceRegistry: () => ({ sources: [] }),
        logger: silentLogger(),
        now: () => new Date("2026-05-23T08:00:00.000Z"),
        registry,
      },
    );

    assert.equal(result.status, "success");
    assert.deepEqual(calls, ["first,second", "third"]);
    assert.equal(result.counts.scored, 3);
  });
});
