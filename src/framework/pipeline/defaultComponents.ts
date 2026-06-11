// Purpose: Implements the framework pipeline default Components module.
// Scope: Stays generic so applications can plug in their own components.

import { filesystemArtifactWriter, noopArtifactWriter } from "./artifactWriter.js";
import type { PipelineComponentRegistry } from "./registry.js";
import { pipelineComponentRegistry } from "./registry.js";

const registeredRegistries = new WeakSet<PipelineComponentRegistry>();

export function registerFrameworkPipelineComponents(
  registry: PipelineComponentRegistry = pipelineComponentRegistry,
): void {
  if (registeredRegistries.has(registry)) {
    return;
  }

  registry.registerMany({
    artifactWriters: {
      filesystem_artifact_writer: filesystemArtifactWriter,
      noop_artifact_writer: noopArtifactWriter,
    },
  });

  registeredRegistries.add(registry);
}

export { filesystemArtifactWriter, noopArtifactWriter };
