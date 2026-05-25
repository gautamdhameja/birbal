import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { registerDefaultPipelineComponents } from "../src/framework/pipeline/defaultComponents.js";
import { PipelineComponentRegistry } from "../src/framework/pipeline/registry.js";
import { ENTERPRISE_DAILY_READING_RUBRIC_ID } from "../src/pipelines/daily/rubric.js";
import { ENTERPRISE_USE_CASE_RUBRIC_ID } from "../src/pipelines/useCases/rubric.js";
import type { PipelineConfig } from "../src/framework/pipeline/types.js";

function pipelineConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    pipelineId: "daily",
    enabled: true,
    description: "Test pipeline.",
    sourceIds: [],
    collectionMethods: [
      {
        id: "test_collection",
        collectorId: "test_collector",
      },
    ],
    contentFetchPolicy: {
      enabled: false,
      fetchForTopN: 0,
      maxChars: 12000,
      preferFetchedContent: false,
    },
    scorerId: "test_scorer",
    selectorId: "test_selector",
    rendererId: "test_renderer",
    output: {
      format: "markdown",
    },
    limits: {},
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

function registerRequiredDefaults(registry: PipelineComponentRegistry): void {
  registry.registerCollector("test_collector", {
    collect: async () => [],
  });
  registry.registerScorer("test_scorer", {
    score: async () => ({}),
  });
  registry.registerSelector("test_selector", {
    select: async (items: unknown[]) => items,
  });
  registry.registerRenderer("test_renderer", {
    render: async () => "",
  });
}

describe("pipeline component registry", () => {
  it("registers components and resolves them from pipeline config IDs", () => {
    const collector = {
      collect: async () => ["item"],
    };
    const scorer = {
      score: async () => ({ score: 1 }),
    };
    const selector = {
      select: async (items: unknown[]) => items,
    };
    const renderer = {
      render: async () => "markdown",
    };
    const registry = new PipelineComponentRegistry();

    registry.registerCollector("web_search_collector", collector);
    registry.registerScorer("enterprise_deployment_scorer", scorer);
    registry.registerSelector("daily_enterprise_mix_selector", selector);
    registry.registerRenderer("daily_markdown_renderer", renderer);

    const config = pipelineConfig({
      collectionMethods: [
        {
          id: "web_search",
          collectorId: "web_search_collector",
        },
      ],
      scorerId: "enterprise_deployment_scorer",
      selectorId: "daily_enterprise_mix_selector",
      rendererId: "daily_markdown_renderer",
    });

    const resolved = registry.resolveFromConfig(config);

    assert.deepEqual(resolved.collectors, [collector]);
    assert.deepEqual(resolved.scorers, [scorer]);
    assert.deepEqual(resolved.selectors, [selector]);
    assert.deepEqual(resolved.renderers, [renderer]);
    assert.deepEqual(resolved.contentFetchers, []);
  });

  it("resolves rubric IDs from top-level pipeline config", () => {
    const rubric = {
      id: "rubric",
      description: "Test rubric.",
      scale: {
        min: 1,
        max: 5,
      },
      criteria: [],
      weights: {},
      hardRejectionRules: [],
      outputSchema: {} as never,
    };
    const registry = new PipelineComponentRegistry();

    registerRequiredDefaults(registry);
    registry.registerRubric("rubric", rubric);

    const resolved = registry.resolveFromConfig(
      pipelineConfig({
        rubricId: "rubric",
        components: undefined,
      }),
    );

    assert.deepEqual(resolved.rubrics, [rubric]);
  });

  it("supports registering many components and resolving ordered component arrays", () => {
    const firstFetcher = {
      fetch: async () => "first",
    };
    const secondFetcher = {
      fetch: async () => "second",
    };
    const registry = new PipelineComponentRegistry();

    registerRequiredDefaults(registry);
    registry.registerMany({
      contentFetchers: {
        first_fetcher: firstFetcher,
        second_fetcher: secondFetcher,
      },
    });

    const resolved = registry.resolveFromConfig(
      pipelineConfig({
        pipelineId: "research",
        contentFetchPolicy: {
          enabled: true,
          fetcherId: "first_fetcher",
          fetchForTopN: 2,
          maxChars: 12000,
          preferFetchedContent: false,
        },
        components: {
          contentFetchers: ["first_fetcher", "second_fetcher"],
        },
      }),
    );

    assert.deepEqual(resolved.contentFetchers, [firstFetcher, secondFetcher]);
  });

  it("rejects duplicate and unknown component IDs", () => {
    const registry = new PipelineComponentRegistry();
    const scorer = {
      score: async () => ({ score: 1 }),
    };

    registerRequiredDefaults(registry);
    registry.registerScorer("enterprise_deployment_scorer", scorer);

    assert.throws(
      () => registry.registerScorer("enterprise_deployment_scorer", scorer),
      /Pipeline component already registered: scorers\.enterprise_deployment_scorer/,
    );
    assert.throws(
      () =>
        registry.resolveFromConfig(
          pipelineConfig({
            pipelineId: "weekly",
            scorerId: "missing_scorer",
          }),
        ),
      /Unknown pipeline component: scorers\.missing_scorer/,
    );
  });

  it("can be configured to allow component replacement", () => {
    const firstScorer = {
      score: async () => ({ score: 1 }),
    };
    const secondScorer = {
      score: async () => ({ score: 2 }),
    };
    const registry = new PipelineComponentRegistry({ allowOverwrite: true });

    registry.registerScorer("scorer", firstScorer);
    registry.registerScorer("scorer", secondScorer);

    assert.equal(registry.getScorer("scorer"), secondScorer);
  });

  it("registers the enterprise daily reading rubric as a default component", () => {
    const registry = new PipelineComponentRegistry();

    registerDefaultPipelineComponents(registry);

    assert.equal(
      registry.getRubric(ENTERPRISE_DAILY_READING_RUBRIC_ID).id,
      ENTERPRISE_DAILY_READING_RUBRIC_ID,
    );
    assert.equal(
      registry.getRubric(ENTERPRISE_USE_CASE_RUBRIC_ID).id,
      ENTERPRISE_USE_CASE_RUBRIC_ID,
    );
  });
});
