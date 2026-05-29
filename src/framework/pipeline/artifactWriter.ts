// Purpose: Implements the framework pipeline artifact Writer module.
// Scope: Stays generic so applications can plug in their own components.

import {
  closeSync,
  constants as fsConstants,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { formatDateOnlyInTimeZone } from "../../utils/date.js";
import type { ArtifactWriter, PipelineContext, PipelineMetadata } from "./types.js";

export function formatPipelineRunDate(context: PipelineContext): string {
  return formatDateOnlyInTimeZone(context.startedAt, context.config.schedule?.timezone);
}

export function renderOutputPath(context: PipelineContext): string {
  const directory = context.config.output.directory ?? ".";
  const filenameTemplate = context.config.output.filenameTemplate ?? `${context.pipelineId}.txt`;
  const filename = filenameTemplate
    .replaceAll("{date}", formatPipelineRunDate(context))
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
    const fileHandle = { fd: -1 };

    mkdirSync(dirname(path), { recursive: true });
    assertOutputPathResolvesInsideWorkspace(path);
    fileHandle.fd = openSync(
      path,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_TRUNC |
        (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    try {
      writeFileSync(fileHandle.fd, String(output));
    } finally {
      closeSync(fileHandle.fd);
    }

    return {
      id: `${context.pipelineId}_artifact`,
      type: context.config.output.format,
      path,
      metadata: context.config.output.metadata as PipelineMetadata | undefined,
    };
  },
};
