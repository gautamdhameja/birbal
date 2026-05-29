// Purpose: Tests pipeline config behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { loadSourceRegistry } from "../src/config/sourceRegistry.js";
import { loadPipelineConfig } from "../src/framework/pipeline/config.js";

function writeConfig(value: unknown): string {
  const configPath = join(mkdtempSync(join(tmpdir(), "birbal-pipeline-config-")), "pipeline.json");
  writeFileSync(configPath, JSON.stringify(value));
  return configPath;
}

describe("pipeline config", () => {
  it("loads daily pipeline config with top-level component IDs", () => {
    const config = loadPipelineConfig("daily");

    assert.equal(config.pipelineId, "daily");
    assert.equal(config.enabled, true);
    assert.equal(config.rubricId, "enterprise_daily_reading_rubric");
    assert.deepEqual(config.sourceIds, ["hackernews"]);
    assert.deepEqual(config.execution, {
      collectionConcurrency: 3,
      contentFetchConcurrency: 5,
      scoringConcurrency: 1,
      classificationConcurrency: 2,
      batchSize: {
        scoring: 5,
      },
    });
    assert.deepEqual(config.failurePolicy, {
      failFast: false,
      continueOnSourceFailure: true,
      continueOnContentFetchFailure: true,
      continueOnScoringFailure: true,
      continueOnStructuredExtractionFailure: true,
      minItemsRequiredForSuccess: 5,
    });
    assert.deepEqual(config.contentFetchPolicy, {
      enabled: true,
      fetcherId: "url_text_fetcher",
      fetchForTopN: 10,
      maxChars: 12000,
      preferFetchedContent: true,
    });
    assert.equal(config.collectionMethods[0]?.collectorId, "source_domain_collector");
    assert.equal(config.scorerId, "enterprise_deployment_scorer");
    assert.equal(config.classifierId, "enterprise_digest_classifier");
    assert.equal(config.selectorId, "daily_enterprise_mix_selector");
    assert.equal(config.rendererId, "daily_markdown_renderer");
    assert.equal(config.output.artifactWriterId, "filesystem_artifact_writer");
  });

  it("loads use-case pipeline config without requiring known component IDs", () => {
    const config = loadPipelineConfig("use-cases");

    assert.equal(config.pipelineId, "use_cases");
    assert.equal(config.scorerId, undefined);
    assert.equal(config.rubricId, undefined);
    assert.equal(config.structuredExtractorId, "enterprise_use_case_extractor");
    assert.equal(config.selectorId, "enterprise_use_case_selector");
    assert.equal(config.rendererId, "enterprise_use_case_markdown_renderer");
    assert.deepEqual(config.output, {
      format: "markdown",
      directory: "digests/use-cases",
      filenameTemplate: "{date}.md",
      artifactWriterId: "filesystem_artifact_writer",
    });
    assert.deepEqual(config.contentFetchPolicy, {
      enabled: true,
      fetcherId: "url_text_fetcher",
      fetchForTopN: 30,
      maxChars: 24000,
      preferFetchedContent: true,
    });
    assert.deepEqual(config.failurePolicy, {
      failFast: false,
      continueOnSourceFailure: true,
      continueOnContentFetchFailure: true,
      continueOnScoringFailure: true,
      continueOnStructuredExtractionFailure: true,
      minItemsRequiredForSuccess: 1,
    });
    assert.equal(config.limits.maxSearchQueries, 5);
    assert.equal(config.limits.maxSearchResultsPerQuery, 20);
    assert.equal(config.collectionMethods[0]?.collectorId, "brave_web_search_collector");
  });

  it("keeps configured pipeline source IDs present in the source registry", () => {
    const sourceIds = new Set(loadSourceRegistry().sources.map((source) => source.id));
    const pipelineIds = ["daily", "use-cases"];

    for (const pipelineId of pipelineIds) {
      const config = loadPipelineConfig(pipelineId);
      const configuredSourceIds = [
        ...config.sourceIds,
        ...config.collectionMethods.flatMap((method) => method.sourceIds ?? []),
      ];

      for (const sourceId of configuredSourceIds) {
        assert.ok(sourceIds.has(sourceId), `${pipelineId} references unknown source ${sourceId}`);
      }
    }
  });

  it("rejects invalid pipeline config JSON", () => {
    const configPath = join(mkdtempSync(join(tmpdir(), "birbal-pipeline-config-")), "bad.json");
    writeFileSync(configPath, "{");

    assert.throws(() => loadPipelineConfig(configPath), /Pipeline config is not valid JSON/);
  });

  it("rejects invalid pipeline config shapes", () => {
    const configPath = writeConfig({
      pipelineId: "daily",
      enabled: true,
    });

    assert.throws(() => loadPipelineConfig(configPath), /Pipeline config is invalid/);
  });

  it("rejects configs without an artifact writer", () => {
    const configPath = writeConfig({
      pipelineId: "daily",
      enabled: true,
      description: "Invalid pipeline.",
      sourceIds: ["hackernews"],
      collectionMethods: [
        {
          id: "source_domain_search",
          collectorId: "source_domain_collector",
        },
      ],
      contentFetchPolicy: {
        enabled: true,
        fetchForTopN: 1,
        maxChars: 1000,
        preferFetchedContent: true,
      },
      selectorId: "selector",
      rendererId: "renderer",
      output: {
        format: "markdown",
      },
      limits: {},
    });

    assert.throws(() => loadPipelineConfig(configPath), /artifactWriterId/);
  });
});
