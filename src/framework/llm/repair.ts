// Purpose: Implements the framework LLM repair module.
// Scope: Stays generic so applications can plug in their own components.

import { z } from "zod";

import { parseJson, parseStrictJson } from "./json.js";
import type { ChatMessage, ModelClient, ModelCompleteOptions } from "./types.js";

type CompleteFn = ModelClient["complete"];

type StructuredOutputRepairLogger = {
  debug(payload: Record<string, unknown>, message?: string): void;
  warn(payload: Record<string, unknown>, message?: string): void;
};

export type ModelParseErrorDetails = {
  type: "model_parse_error";
  message: string;
  invalidOutput: string;
  schemaDescription: string;
  validationError: string;
  repairAttempted: boolean;
  repairedOutput?: string;
  repairValidationError?: string;
};

export type StructuredModelOutputResult<T> =
  | {
      ok: true;
      value: T;
      raw: string;
      repaired: boolean;
    }
  | {
      ok: false;
      error: ModelParseErrorDetails;
    };

export type CompleteStructuredWithRepairOptions<T> = {
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  completeOptions?: ModelCompleteOptions;
  completeFn: CompleteFn;
  logger?: StructuredOutputRepairLogger;
  repairInstructions?: string;
  schemaDescription?: string;
};

type ParsedModelOutput<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      validationError: string;
    };

const MAX_LOGGED_VALIDATION_ERROR_CHARS = 1_000;

const noopLogger: StructuredOutputRepairLogger = {
  debug: () => undefined,
  warn: () => undefined,
};

export class ModelParseError extends Error {
  readonly type = "model_parse_error";

  constructor(readonly details: ModelParseErrorDetails) {
    super(details.message);
    this.name = "ModelParseError";
  }

  toJSON(): ModelParseErrorDetails {
    return this.details;
  }
}

function truncateValidationError(validationError: string): string {
  if (validationError.length <= MAX_LOGGED_VALIDATION_ERROR_CHARS) {
    return validationError;
  }

  return `${validationError.slice(0, MAX_LOGGED_VALIDATION_ERROR_CHARS)}...`;
}

function jsonShapeSummary(raw: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = parseJson(raw);
  } catch {
    return undefined;
  }

  if (Array.isArray(parsed)) {
    return {
      topLevelType: "array",
      length: parsed.length,
      firstItemKeys:
        typeof parsed[0] === "object" && parsed[0] !== null ? Object.keys(parsed[0]) : [],
    };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return {
      topLevelType: typeof parsed,
    };
  }

  const record = parsed as Record<string, unknown>;
  const useCases = Array.isArray(record.useCases)
    ? record.useCases
    : Array.isArray(record.use_cases)
      ? record.use_cases
      : undefined;

  return {
    topLevelType: "object",
    topLevelKeys: Object.keys(record),
    ...(useCases
      ? {
          useCasesLength: useCases.length,
          firstUseCaseKeys:
            typeof useCases[0] === "object" && useCases[0] !== null ? Object.keys(useCases[0]) : [],
        }
      : {}),
  };
}

export function describeJsonSchema<T>(schema: z.ZodType<T>): string {
  try {
    return JSON.stringify(z.toJSONSchema(schema), null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Zod schema could not be converted to JSON Schema: ${message}`;
  }
}

export function summarizeModelParseError(details: ModelParseErrorDetails): Record<string, unknown> {
  return {
    type: details.type,
    message: details.message,
    validationError: truncateValidationError(details.validationError),
    repairAttempted: details.repairAttempted,
    invalidOutputChars: details.invalidOutput.length,
    schemaDescriptionChars: details.schemaDescription.length,
    ...(details.repairedOutput ? { repairedOutputChars: details.repairedOutput.length } : {}),
    ...(details.repairValidationError
      ? { repairValidationError: truncateValidationError(details.repairValidationError) }
      : {}),
  };
}

function parseModelOutput<T>(raw: string, schema: z.ZodType<T>): ParsedModelOutput<T> {
  let parsedJson: unknown;
  try {
    parsedJson = parseStrictJson(raw);
  } catch (error) {
    return {
      ok: false,
      validationError: error instanceof Error ? error.message : String(error),
    };
  }

  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      ok: false,
      validationError: parsed.error.message,
    };
  }

  return {
    ok: true,
    value: parsed.data,
  };
}

function buildRepairPrompt({
  invalidOutput,
  repairInstructions,
  schemaDescription,
  validationError,
}: {
  invalidOutput: string;
  repairInstructions?: string;
  schemaDescription: string;
  validationError: string;
}): string {
  return [
    repairInstructions ??
      "Your previous response failed JSON parsing or schema validation. Repair it.",
    "",
    "Invalid output:",
    invalidOutput,
    "",
    "Validation error:",
    validationError,
    "",
    "Target JSON schema description:",
    schemaDescription,
    "",
    "Return only one valid JSON object matching the target schema. Do not include Markdown, code fences, or prose outside JSON.",
  ].join("\n");
}

function failedResult({
  initialOutput,
  initialValidationError,
  repairedOutput,
  repairValidationError,
  schemaDescription,
}: {
  initialOutput: string;
  initialValidationError: string;
  repairedOutput?: string;
  repairValidationError?: string;
  schemaDescription: string;
}): StructuredModelOutputResult<never> {
  return {
    ok: false,
    error: {
      type: "model_parse_error",
      message: "Model output failed JSON parsing or schema validation after repair.",
      invalidOutput: repairedOutput ?? initialOutput,
      schemaDescription,
      validationError: initialValidationError,
      repairAttempted: true,
      ...(repairedOutput ? { repairedOutput } : {}),
      ...(repairValidationError ? { repairValidationError } : {}),
    },
  };
}

export async function completeStructuredWithRepair<T>({
  messages,
  schema,
  completeOptions = {},
  completeFn,
  logger = noopLogger,
  repairInstructions,
  schemaDescription = describeJsonSchema(schema),
}: CompleteStructuredWithRepairOptions<T>): Promise<StructuredModelOutputResult<T>> {
  const initialOutput = await completeFn(messages, completeOptions);
  const initialParsed = parseModelOutput(initialOutput, schema);
  if (initialParsed.ok) {
    return {
      ok: true,
      value: initialParsed.value,
      raw: initialOutput,
      repaired: false,
    };
  }

  logger.debug(
    {
      event: "structured_output.validation_failed",
      traceId: completeOptions.traceId,
      traceLabel: completeOptions.traceLabel,
      repaired: false,
      validationError: truncateValidationError(initialParsed.validationError),
      outputShape: jsonShapeSummary(initialOutput),
      outputChars: initialOutput.length,
    },
    "structured model output failed validation",
  );

  const repairMessages: ChatMessage[] = [
    ...messages,
    {
      role: "assistant",
      content: initialOutput,
    },
    {
      role: "user",
      content: buildRepairPrompt({
        invalidOutput: initialOutput,
        repairInstructions,
        schemaDescription,
        validationError: initialParsed.validationError,
      }),
    },
  ];
  const repairedOutput = await completeFn(repairMessages, {
    ...completeOptions,
    traceLabel: completeOptions.traceLabel
      ? `${completeOptions.traceLabel}.repair`
      : "structured_output.repair",
  });
  const repairedParsed = parseModelOutput(repairedOutput, schema);
  if (repairedParsed.ok) {
    logger.debug(
      {
        event: "structured_output.repaired",
        traceId: completeOptions.traceId,
        traceLabel: completeOptions.traceLabel,
        outputChars: repairedOutput.length,
      },
      "structured model output repaired",
    );

    return {
      ok: true,
      value: repairedParsed.value,
      raw: repairedOutput,
      repaired: true,
    };
  }

  logger.warn(
    {
      event: "structured_output.repair_failed",
      traceId: completeOptions.traceId,
      traceLabel: completeOptions.traceLabel,
      validationError: truncateValidationError(initialParsed.validationError),
      repairValidationError: truncateValidationError(repairedParsed.validationError),
      outputShape: jsonShapeSummary(repairedOutput),
      outputChars: repairedOutput.length,
    },
    "structured model output repair failed",
  );

  return failedResult({
    initialOutput,
    initialValidationError: initialParsed.validationError,
    repairedOutput,
    repairValidationError: repairedParsed.validationError,
    schemaDescription,
  });
}
