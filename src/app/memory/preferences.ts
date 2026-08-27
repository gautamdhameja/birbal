import { join } from "node:path";

import { loadJsonConfig } from "../../framework/config/loadJsonConfig.js";
import { PREFERENCES } from "../constants/preferences.js";
import { PreferencesSchema } from "./schema.js";
import type { UserPreferences } from "./types.js";

function getDefaultPreferencesPath(): string {
  return join(process.cwd(), PREFERENCES.DIRECTORY, PREFERENCES.FILE_NAME);
}

export function loadPreferences(preferencesPath = getDefaultPreferencesPath()): UserPreferences {
  return loadJsonConfig(preferencesPath, PreferencesSchema, {
    invalidJson: PREFERENCES.ERRORS.INVALID_JSON,
    invalidConfig: PREFERENCES.ERRORS.INVALID_CONFIG,
  });
}
