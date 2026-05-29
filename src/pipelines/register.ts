// Purpose: Registers Birbal pipeline components with the framework registry.
// Scope: Composes framework defaults, shared fetchers, and app-specific component bundles.

import { registerFrameworkPipelineComponents } from "../framework/pipeline/defaultComponents.js";
import type { PipelineComponentRegistry } from "../framework/pipeline/registry.js";
import { pipelineComponentRegistry } from "../framework/pipeline/registry.js";
import { urlTextFetcher } from "./componentHelpers.js";
import { dailyPipelineComponents } from "./daily/components.js";
import { useCasePipelineComponents } from "./useCases/components.js";

const registeredRegistries = new WeakSet<PipelineComponentRegistry>();

export function registerBirbalPipelineComponents(
  registry: PipelineComponentRegistry = pipelineComponentRegistry,
): void {
  if (registeredRegistries.has(registry)) {
    return;
  }

  registerFrameworkPipelineComponents(registry);
  registry.registerMany({
    contentFetchers: {
      url_text_fetcher: urlTextFetcher,
    },
    collectors: {
      ...dailyPipelineComponents.collectors,
      ...useCasePipelineComponents.collectors,
    },
    scorers: dailyPipelineComponents.scorers,
    classifiers: dailyPipelineComponents.classifiers,
    structuredExtractors: useCasePipelineComponents.structuredExtractors,
    selectors: {
      ...dailyPipelineComponents.selectors,
      ...useCasePipelineComponents.selectors,
    },
    renderers: {
      ...dailyPipelineComponents.renderers,
      ...useCasePipelineComponents.renderers,
    },
    rubrics: dailyPipelineComponents.rubrics,
  });

  registeredRegistries.add(registry);
}
