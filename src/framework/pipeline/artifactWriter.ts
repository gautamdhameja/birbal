import { constants as fsConstants, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { open, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { formatDateOnlyInTimeZone, formatTimeOnlyInTimeZone } from "./date.js";
import type { ArtifactWriter, PipelineContext, PipelineMetadata } from "./types.js";

export function formatPipelineRunDate(context: PipelineContext): string {
  return formatDateOnlyInTimeZone(context.startedAt, context.config.schedule?.timezone);
}

export function formatPipelineRunTime(context: PipelineContext): string {
  return formatTimeOnlyInTimeZone(context.startedAt, context.config.schedule?.timezone);
}

export function renderOutputPath(context: PipelineContext): string {
  const directory = context.config.output.directory ?? ".";
  const filenameTemplate = context.config.output.filenameTemplate ?? `${context.pipelineId}.txt`;
  const filename = filenameTemplate
    .replaceAll("{date}", formatPipelineRunDate(context))
    .replaceAll("{time}", formatPipelineRunTime(context))
    .replaceAll("{pipelineId}", context.pipelineId)
    .replaceAll("{runId}", context.runId);
  const unsafeParts = [directory, filename].flatMap((part) => part.split(/[\\/]+/));
  if (isAbsolute(directory) || isAbsolute(filename) || unsafeParts.includes("..")) {
    throw new Error("Pipeline output path must stay inside the workspace.");
  }

  const artifactRoot = resolve(process.cwd());
  const outputPath = resolve(artifactRoot, join(directory, filename));
  const relativeOutputPath = relative(artifactRoot, outputPath);
  if (relativeOutputPath.startsWith("..") || isAbsolute(relativeOutputPath)) {
    throw new Error("Pipeline output path must stay inside the workspace.");
  }

  return outputPath;
}

function assertOutputPathResolvesInsideWorkspace(outputPath: string): void {
  const realWorkspaceRoot = realpathSync(process.cwd());
  const realParentDirectory = realpathSync(dirname(outputPath));
  const relativeParent = relative(realWorkspaceRoot, realParentDirectory);
  if (relativeParent.startsWith("..") || isAbsolute(relativeParent)) {
    throw new Error("Pipeline output path must not resolve outside the workspace.");
  }

  try {
    if (lstatSync(outputPath).isSymbolicLink()) {
      throw new Error("Pipeline output file must not be a symlink.");
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

export const filesystemArtifactWriter: ArtifactWriter = {
  async write(output, context) {
    const path = renderOutputPath(context);
    const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;

    mkdirSync(dirname(path), { recursive: true });
    assertOutputPathResolvesInsideWorkspace(path);
    try {
      const fileHandle = await open(
        temporaryPath,
        fsConstants.O_WRONLY |
          fsConstants.O_CREAT |
          fsConstants.O_EXCL |
          (fsConstants.O_NOFOLLOW ?? 0),
        0o600,
      );
      try {
        await fileHandle.writeFile(String(output));
        await fileHandle.sync();
      } finally {
        await fileHandle.close();
      }
      await rename(temporaryPath, path);
    } catch (error) {
      try {
        await unlink(temporaryPath);
      } catch {
        // The temporary file may already have been moved or removed.
      }
      throw error;
    }

    return {
      id: `${context.pipelineId}_artifact`,
      type: context.config.output.format,
      path,
      metadata: context.config.output.metadata as PipelineMetadata | undefined,
    };
  },
};

export const noopArtifactWriter: ArtifactWriter = {
  async write(_output, context) {
    return {
      id: `${context.pipelineId}_noop_artifact`,
      type: context.config.output.format,
      metadata: {
        ...context.config.output.metadata,
        skipped: true,
      },
    };
  },
};
