// Purpose: Demonstrates static pipeline usage for framework adopters.
// Scope: Keeps the example small enough to copy and adapt.

import {
  createInMemoryPipelineRunStore,
  PipelineComponentRegistry,
  runPipeline,
} from "../src/framework/index.js";
import type { PipelineConfig, PipelineLogger } from "../src/framework/index.js";

const config: PipelineConfig = {
  pipelineId: "static_example",
  enabled: true,
  description: "A minimal static pipeline example.",
  sourceIds: ["static_source"],
  collectionMethods: [
    {
      id: "static_collection",
      collectorId: "static_collector",
      sourceIds: ["static_source"],
    },
  ],
  contentFetchPolicy: {
    enabled: false,
    fetchForTopN: 0,
    maxChars: 0,
    preferFetchedContent: false,
  },
  selectorId: "first_item_selector",
  rendererId: "json_renderer",
  output: {
    format: "json",
    artifactWriterId: "memory_writer",
  },
  limits: {
    maxCandidates: 10,
  },
  failurePolicy: {
    failFast: false,
    continueOnSourceFailure: true,
    continueOnContentFetchFailure: true,
    continueOnScoringFailure: true,
    continueOnStructuredExtractionFailure: true,
    minItemsRequiredForSuccess: 1,
  },
};

const registry = new PipelineComponentRegistry();
registry.registerCollector("static_collector", {
  collect: async () => [
    {
      id: "first",
      title: "First static item",
    },
    {
      id: "second",
      title: "Second static item",
    },
  ],
});
registry.registerSelector("first_item_selector", {
  select: async (items) => items.slice(0, 1),
});
registry.registerRenderer("json_renderer", {
  render: async (items) => JSON.stringify(items, null, 2),
});
registry.registerArtifactWriter("memory_writer", {
  write: async (output, context) => ({
    id: `${context.pipelineId}_memory_artifact`,
    type: context.config.output.format,
    metadata: {
      output,
    },
  }),
});

const silentLogger: PipelineLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const result = await runPipeline("static_example", {
  loadConfig: () => config,
  loadSourceRegistry: () => ({
    sources: [{ id: "static_source" }],
  }),
  logger: silentLogger,
  now: () => new Date("2026-05-25T08:00:00.000Z"),
  registry,
  runStore: createInMemoryPipelineRunStore({
    now: () => new Date("2026-05-25T08:00:00.000Z"),
  }),
});

console.log(JSON.stringify(result, null, 2));
