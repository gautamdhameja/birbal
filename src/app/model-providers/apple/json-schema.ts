import { topLevelUnionOptions } from "../json-schema.js";

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

export function createAppleJsonSchema(
  name: string,
  jsonSchema: Record<string, unknown>,
): Record<string, unknown> {
  const rootName = schemaTypeName(name);
  const unionOptions = topLevelUnionOptions(jsonSchema);
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
