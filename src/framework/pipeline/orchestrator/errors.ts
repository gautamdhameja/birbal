import { ModelParseError } from "../../llm/repair.js";
import { preview } from "../../logging/preview.js";
import { isHttpStatusError, summarizeHttpErrorBody } from "../../network/client.js";
import type { PipelineError } from "../types.js";

export class PipelinePolicyAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelinePolicyAbortError";
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function serializeErrorCause(error: unknown): unknown {
  if (isHttpStatusError(error)) {
    return {
      name: error.name,
      status: error.status,
      statusText: error.statusText,
      bodyPreview: summarizeHttpErrorBody(error.body),
    };
  }

  if (error instanceof ModelParseError) {
    return {
      name: error.name,
      type: error.type,
      message: preview(error.message),
      details: {
        ...error.details,
        invalidOutput: preview(error.details.invalidOutput),
        schemaDescription: preview(error.details.schemaDescription),
        ...(error.details.repairedOutput
          ? { repairedOutput: preview(error.details.repairedOutput) }
          : {}),
        ...(error.details.repairValidationError
          ? { repairValidationError: preview(error.details.repairValidationError) }
          : {}),
      },
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: preview(error.message),
    };
  }

  return preview(error);
}

export function toPipelineError(
  error: unknown,
  metadata: Omit<PipelineError, "message">,
): PipelineError {
  return {
    ...metadata,
    message: preview(errorMessage(error)),
    cause: serializeErrorCause(error),
  };
}
