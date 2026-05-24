import { z } from "zod";

import { complete } from "../../llama/client.js";
import type { ChatMessage, CompleteOptions } from "../../llama/schema.js";
import { parseJson } from "../../utils/json.js";

type CompleteFn = (messages: ChatMessage[], options?: CompleteOptions) => Promise<string>;

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
  completeOptions?: CompleteOptions;
  completeFn?: CompleteFn;
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

export function describeJsonSchema<T>(schema: z.ZodType<T>): string {
  try {
    return JSON.stringify(z.toJSONSchema(schema), null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Zod schema could not be converted to JSON Schema: ${message}`;
  }
}

function parseModelOutput<T>(raw: string, schema: z.ZodType<T>): ParsedModelOutput<T> {
  let parsedJson: unknown;
  try {
    parsedJson = parseJson(raw);
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
  completeFn = complete,
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
    return {
      ok: true,
      value: repairedParsed.value,
      raw: repairedOutput,
      repaired: true,
    };
  }

  return failedResult({
    initialOutput,
    initialValidationError: initialParsed.validationError,
    repairedOutput,
    repairValidationError: repairedParsed.validationError,
    schemaDescription,
  });
}
