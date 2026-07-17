import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PREFERENCES } from "../constants/preferences.js";
import { PreferencesSchema } from "./schema.js";
import type { UserPreferences } from "./types.js";

function getDefaultPreferencesPath(): string {
  return join(process.cwd(), PREFERENCES.DIRECTORY, PREFERENCES.FILE_NAME);
}

function parsePreferencesJson(rawConfig: string): unknown {
  try {
    return JSON.parse(rawConfig);
  } catch (error) {
    throw new Error(
      `${PREFERENCES.ERRORS.INVALID_JSON} ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function loadPreferences(preferencesPath = getDefaultPreferencesPath()): UserPreferences {
  const parsed = PreferencesSchema.safeParse(
    parsePreferencesJson(readFileSync(preferencesPath, "utf8")),
  );
  if (!parsed.success) {
    throw new Error(`${PREFERENCES.ERRORS.INVALID_CONFIG} ${parsed.error.message}`);
  }

  return parsed.data;
}
