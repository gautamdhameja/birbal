import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { SOURCE_REGISTRY } from "../constants/source-registry.js";
import { SOURCES } from "../constants/sources.js";

const SourceRegistryItemSchema = z
  .strictObject({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    domains: z.array(z.string().trim().min(1)).min(1),
    priority: z.number().int().min(1),
    sourceType: z.enum([
      SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
      SOURCE_REGISTRY.SOURCE_TYPES.ACADEMIC_FALLBACK,
    ]),
    searchQueries: z.array(z.string().trim().min(1)).min(1),
    enabled: z.boolean(),
  })
  .refine(
    (source) =>
      source.id !== SOURCES.ARXIV ||
      source.sourceType === SOURCE_REGISTRY.SOURCE_TYPES.ACADEMIC_FALLBACK,
    {
      message: "arXiv must be configured as an academic fallback source.",
      path: ["sourceType"],
    },
  );

const SourceRegistrySchema = z.strictObject({
  sources: z.array(SourceRegistryItemSchema).min(1),
});

export type SourceRegistryItem = z.infer<typeof SourceRegistryItemSchema>;
export type SourceRegistry = z.infer<typeof SourceRegistrySchema>;

function getDefaultSourceRegistryPath(): string {
  return join(process.cwd(), SOURCE_REGISTRY.DIRECTORY, SOURCE_REGISTRY.FILE_NAME);
}

function parseSourceRegistryJson(rawConfig: string): unknown {
  try {
    return JSON.parse(rawConfig);
  } catch (error) {
    throw new Error(
      `${SOURCE_REGISTRY.ERRORS.INVALID_JSON} ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function loadSourceRegistry(
  sourceRegistryPath = getDefaultSourceRegistryPath(),
): SourceRegistry {
  const parsed = SourceRegistrySchema.safeParse(
    parseSourceRegistryJson(readFileSync(sourceRegistryPath, "utf8")),
  );
  if (!parsed.success) {
    throw new Error(`${SOURCE_REGISTRY.ERRORS.INVALID_CONFIG} ${parsed.error.message}`);
  }

  return parsed.data;
}
