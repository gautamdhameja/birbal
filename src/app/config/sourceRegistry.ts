import { join } from "node:path";

import { z } from "zod";

import { loadJsonConfig } from "../../framework/config/loadJsonConfig.js";
import { SOURCE_REGISTRY } from "../constants/source-registry.js";

const SourceRegistryItemSchema = z.strictObject({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  domains: z.array(z.string().trim().min(1)).min(1),
  priority: z.number().int().min(1),
  sourceType: z.enum([
    SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
    SOURCE_REGISTRY.SOURCE_TYPES.ACADEMIC,
    SOURCE_REGISTRY.SOURCE_TYPES.VENDOR,
    SOURCE_REGISTRY.SOURCE_TYPES.PRESS,
  ]),
  searchQueries: z.array(z.string().trim().min(1)).min(1),
  enabled: z.boolean(),
});

const SourceRegistrySchema = z.strictObject({
  sources: z.array(SourceRegistryItemSchema).min(1),
});

export type SourceRegistryItem = z.infer<typeof SourceRegistryItemSchema>;
export type SourceRegistry = z.infer<typeof SourceRegistrySchema>;

function getDefaultSourceRegistryPath(): string {
  return join(process.cwd(), SOURCE_REGISTRY.DIRECTORY, SOURCE_REGISTRY.FILE_NAME);
}

export function loadSourceRegistry(
  sourceRegistryPath = getDefaultSourceRegistryPath(),
): SourceRegistry {
  return loadJsonConfig(sourceRegistryPath, SourceRegistrySchema, {
    invalidJson: SOURCE_REGISTRY.ERRORS.INVALID_JSON,
    invalidConfig: SOURCE_REGISTRY.ERRORS.INVALID_CONFIG,
  });
}
