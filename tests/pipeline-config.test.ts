import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { loadPipelineConfig } from "../src/framework/pipeline/config.js";

function writeConfig(value: unknown): string {
  const configPath = join(mkdtempSync(join(tmpdir(), "birbal-pipeline-config-")), "pipeline.json");
  writeFileSync(configPath, JSON.stringify(value));
  return configPath;
}

describe("pipeline config", () => {
  it("loads daily pipeline config and maps component IDs for registry resolution", () => {
    const config = loadPipelineConfig("daily");

    assert.equal(config.pipelineId, "daily");
    assert.equal(config.enabled, true);
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
      minItemsRequiredForSuccess: 5,
    });
    assert.deepEqual(config.contentFetchPolicy, {
      enabled: true,
      fetcherId: "url_text_fetcher",
      fetchForTopN: 10,
      maxChars: 12000,
      preferFetchedContent: true,
    });
    assert.deepEqual(config.components, {
      collectors: ["source_domain_collector"],
      contentFetcher: "url_text_fetcher",
      contentExtractors: undefined,
      scorer: "enterprise_deployment_scorer",
      classifier: "enterprise_digest_classifier",
      structuredExtractor: undefined,
      selector: "daily_enterprise_mix_selector",
      renderer: "daily_markdown_renderer",
      artifactWriter: "filesystem_artifact_writer",
    });
  });

  it("loads use-case pipeline config without requiring known component IDs", () => {
    const config = loadPipelineConfig("use-cases");

    assert.equal(config.pipelineId, "use_cases");
    assert.equal(config.scorerId, "production_use_case_filter");
    assert.equal(config.structuredExtractorId, "production_use_case_extractor");
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
      minItemsRequiredForSuccess: 1,
    });
    assert.deepEqual(config.components?.collectors, [
      "source_domain_collector",
      "brave_web_search_collector",
    ]);
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
});
