import { fileURLToPath } from "node:url";

import { loadJsonConfig } from "../../framework/config/loadJsonConfig.js";
import { SOURCE_REGISTRY } from "../constants/source-registry.js";
import { SourceRegistrySchema } from "./sourceRegistrySchema.js";
import type { SourceRegistry } from "./sourceRegistryTypes.js";

const BUNDLED_SOURCE_REGISTRY_PATH = fileURLToPath(
  new URL("../../../config/source-registry.json", import.meta.url),
);

function getDefaultSourceRegistryPath(): string {
  return process.env.SOURCE_REGISTRY_PATH?.trim() || BUNDLED_SOURCE_REGISTRY_PATH;
}

export function loadSourceRegistry(
  sourceRegistryPath = getDefaultSourceRegistryPath(),
): SourceRegistry {
  return loadJsonConfig(sourceRegistryPath, SourceRegistrySchema, {
    invalidJson: SOURCE_REGISTRY.ERRORS.INVALID_JSON,
    invalidConfig: SOURCE_REGISTRY.ERRORS.INVALID_CONFIG,
  });
}
