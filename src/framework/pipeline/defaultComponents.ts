import { filesystemArtifactWriter } from "./artifactWriter.js";
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
    },
  });

  registeredRegistries.add(registry);
}

export { filesystemArtifactWriter };
