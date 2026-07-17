import { incrementCount } from "../orchestrator/items.js";
import type {
  PipelineArtifact,
  PipelineContext,
  PipelineCounts,
  ArtifactWriter,
  PipelineFinalizer,
  Renderer,
  Selector,
} from "../types.js";
import type { PipelineRunItem } from "../orchestrator/contracts.js";

export async function selectItems(
  items: PipelineRunItem[],
  selector: Selector,
  context: PipelineContext,
  counts: PipelineCounts,
): Promise<unknown[]> {
  const selected = await selector.select(items, context);
  incrementCount(counts, "selected", selected.length);
  return selected;
}

export async function renderAndWriteArtifact(
  selectedItems: unknown[],
  renderer: Renderer,
  writer: ArtifactWriter,
  context: PipelineContext,
  counts: PipelineCounts,
): Promise<PipelineArtifact> {
  const rendered = await renderer.render(selectedItems, context);
  incrementCount(counts, "rendered");

  const artifact = await writer.write(rendered, context);
  incrementCount(counts, "artifactsWritten");

  return artifact;
}

export async function finalizePipeline(
  selectedItems: unknown[],
  artifact: PipelineArtifact,
  finalizer: PipelineFinalizer | undefined,
  context: PipelineContext,
): Promise<void> {
  await finalizer?.finalize(selectedItems, artifact, context);
}
