import { z } from "zod";

import type { ModelCompleteOptions } from "../../framework/llm/types.js";
import { STRUCTURED_MODEL_COMPLETION_DEFAULTS } from "../constants/model-completion.js";
import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import { createAppleJsonSchema } from "./apple/json-schema.js";
import { getConfiguredModelProviderId, trimmedEnv } from "./config.js";
import { toInputJsonSchema, topLevelUnionOptions } from "./json-schema.js";

const ResponseFormatEnvSchema = z.enum([
  MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT,
  MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_SCHEMA,
]);

const JsonSchemaDialectEnvSchema = z.enum([
  MODEL_PROVIDERS.JSON_SCHEMA_DIALECTS.STANDARD,
  MODEL_PROVIDERS.JSON_SCHEMA_DIALECTS.APPLE,
]);

type StructuredModelCompletionOptions = {
  name: string;
  schema: z.ZodType;
};

function configuredResponseFormat() {
  const isAppleProvider = getConfiguredModelProviderId() === MODEL_PROVIDERS.PROVIDERS.APPLE;
  const responseFormat = parseEnvValue(
    "MODEL_RESPONSE_FORMAT",
    ResponseFormatEnvSchema,
    trimmedEnv("MODEL_RESPONSE_FORMAT") ??
      (isAppleProvider
        ? MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_SCHEMA
        : MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT),
  );
  if (responseFormat === MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT) {
    return { responseFormat } as const;
  }

  return {
    responseFormat,
    jsonSchemaDialect: parseEnvValue(
      "MODEL_JSON_SCHEMA_DIALECT",
      JsonSchemaDialectEnvSchema,
      trimmedEnv("MODEL_JSON_SCHEMA_DIALECT") ??
        (isAppleProvider
          ? MODEL_PROVIDERS.JSON_SCHEMA_DIALECTS.APPLE
          : MODEL_PROVIDERS.JSON_SCHEMA_DIALECTS.STANDARD),
    ),
  } as const;
}

function parseEnvValue<T>(name: string, schema: z.ZodType<T>, value: string | undefined): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${name}: ${parsed.error.message}`);
  }
  return parsed.data;
}

function standardJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = toInputJsonSchema(schema);
  const unionOptions = topLevelUnionOptions(jsonSchema);
  if (!unionOptions || !unionOptions.every(isObjectSchema)) {
    return jsonSchema;
  }

  const properties = new Map<string, unknown[]>();
  for (const option of unionOptions) {
    for (const [propertyName, propertySchema] of Object.entries(option.properties ?? {})) {
      const candidates = properties.get(propertyName) ?? [];
      if (
        !candidates.some(
          (candidate) => JSON.stringify(candidate) === JSON.stringify(propertySchema),
        )
      ) {
        candidates.push(propertySchema);
      }
      properties.set(propertyName, candidates);
    }
  }

  const required = [...properties.keys()].filter((propertyName) =>
    unionOptions.every(
      (option) => Array.isArray(option.required) && option.required.includes(propertyName),
    ),
  );

  return {
    type: "object",
    properties: Object.fromEntries(
      [...properties].map(([propertyName, candidates]) => [
        propertyName,
        candidates.length === 1 ? candidates[0] : { anyOf: candidates },
      ]),
    ),
    required,
    additionalProperties: false,
  };
}

function isObjectSchema(value: unknown): value is {
  type: "object";
  properties: Record<string, unknown>;
  required?: unknown;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === "object" &&
    Boolean(candidate.properties) &&
    typeof candidate.properties === "object" &&
    !Array.isArray(candidate.properties)
  );
}

export function createStructuredModelCompletionOptions({
  name,
  schema,
}: StructuredModelCompletionOptions): ModelCompleteOptions {
  const config = configuredResponseFormat();
  if (config.responseFormat === MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT) {
    return {
      ...STRUCTURED_MODEL_COMPLETION_DEFAULTS,
      response_format: { type: config.responseFormat },
    };
  }

  const appleDialect = config.jsonSchemaDialect === MODEL_PROVIDERS.JSON_SCHEMA_DIALECTS.APPLE;

  return {
    ...STRUCTURED_MODEL_COMPLETION_DEFAULTS,
    response_format: {
      type: config.responseFormat,
      json_schema: {
        name,
        strict: appleDialect,
        schema: appleDialect
          ? createAppleJsonSchema(name, toInputJsonSchema(schema))
          : standardJsonSchema(schema),
      },
    },
  };
}
