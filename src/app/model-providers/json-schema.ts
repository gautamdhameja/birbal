import { z } from "zod";

export function toInputJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema, { io: "input" });
  return jsonSchema;
}

export function topLevelUnionOptions(jsonSchema: Record<string, unknown>): unknown[] | undefined {
  return Array.isArray(jsonSchema.anyOf)
    ? jsonSchema.anyOf
    : Array.isArray(jsonSchema.oneOf)
      ? jsonSchema.oneOf
      : undefined;
}
