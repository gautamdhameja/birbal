import { z } from "zod";

import type { ModelCompleteOptions } from "../../framework/llm/types.js";
import { STRUCTURED_MODEL_COMPLETION_DEFAULTS } from "../constants/model-completion.js";
import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import { trimmedEnv } from "./config.js";

const ResponseFormatEnvSchema = z
  .enum([
    MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT,
    MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_SCHEMA,
  ])
  .default(MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT);

const JsonSchemaDialectEnvSchema = z
  .enum([MODEL_PROVIDERS.JSON_SCHEMA_DIALECTS.STANDARD, MODEL_PROVIDERS.JSON_SCHEMA_DIALECTS.APPLE])
  .default(MODEL_PROVIDERS.JSON_SCHEMA_DIALECTS.STANDARD);

type StructuredModelCompletionOptions = {
  name: string;
  schema: z.ZodType;
};

function configuredResponseFormat() {
  const responseFormat = parseEnvValue(
    "MODEL_RESPONSE_FORMAT",
    ResponseFormatEnvSchema,
    trimmedEnv("MODEL_RESPONSE_FORMAT"),
  );
  if (responseFormat === MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT) {
    return { responseFormat } as const;
  }

  return {
    responseFormat,
    jsonSchemaDialect: parseEnvValue(
      "MODEL_JSON_SCHEMA_DIALECT",
      JsonSchemaDialectEnvSchema,
      trimmedEnv("MODEL_JSON_SCHEMA_DIALECT"),
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

function rawJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema, { io: "input" });
  return jsonSchema;
}

function standardJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = rawJsonSchema(schema);
  const unionOptions = Array.isArray(jsonSchema.anyOf)
    ? jsonSchema.anyOf
    : Array.isArray(jsonSchema.oneOf)
      ? jsonSchema.oneOf
      : undefined;
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

function schemaTypeName(name: string): string {
  const normalized = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
  return /^\d/.test(normalized) ? `Schema${normalized}` : normalized || "StructuredResponse";
}

function addAppleObjectMetadata(value: unknown, name: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => addAppleObjectMetadata(item, `${name}Option${index + 1}`));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const source = value as Record<string, unknown>;
  const result = Object.fromEntries(
    Object.entries(source).map(([key, nestedValue]) => {
      if (key === "properties" && nestedValue && typeof nestedValue === "object") {
        return [
          key,
          Object.fromEntries(
            Object.entries(nestedValue).map(([propertyName, propertySchema]) => [
              propertyName,
              addAppleObjectMetadata(propertySchema, `${name}${schemaTypeName(propertyName)}`),
            ]),
          ),
        ];
      }
      if (key === "items") {
        return [key, addAppleObjectMetadata(nestedValue, `${name}Item`)];
      }
      return [key, nestedValue];
    }),
  );
  if (
    result.type === "object" &&
    result.properties &&
    typeof result.properties === "object" &&
    !Array.isArray(result.properties)
  ) {
    if (!Array.isArray(result.required)) {
      result.required = [];
    }
    result.title = typeof result.title === "string" ? result.title : name;
    result["x-order"] = Object.keys(result.properties);
  }
  return result;
}

function appleJsonSchema(name: string, schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = rawJsonSchema(schema);
  const rootName = schemaTypeName(name);
  const unionOptions = Array.isArray(jsonSchema.anyOf)
    ? jsonSchema.anyOf
    : Array.isArray(jsonSchema.oneOf)
      ? jsonSchema.oneOf
      : undefined;
  if (!unionOptions) {
    return addAppleObjectMetadata(jsonSchema, rootName) as Record<string, unknown>;
  }

  const definitions = Object.fromEntries(
    unionOptions.map((option, index) => {
      const definitionName = `${rootName}Option${index + 1}`;
      const definition = addAppleObjectMetadata(option, definitionName) as Record<string, unknown>;
      return [definitionName, definition];
    }),
  );

  return {
    anyOf: unionOptions.map((_option, index) => ({
      $ref: `#/$defs/${rootName}Option${index + 1}`,
    })),
    title: rootName,
    $defs: definitions,
  };
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
        schema: appleDialect ? appleJsonSchema(name, schema) : standardJsonSchema(schema),
      },
    },
  };
}
