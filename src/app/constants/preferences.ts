// Purpose: Collects shared preferences constants.
// Scope: Avoids scattering repeated literals across runtime modules.

export const PREFERENCES = {
  DIRECTORY: "config",
  FILE_NAME: "preferences.json",
  DIFFICULTIES: ["introductory", "intermediate", "advanced", "research"] as const,
  ERRORS: {
    INVALID_JSON: "Preferences config is not valid JSON.",
    INVALID_CONFIG: "Preferences config is invalid.",
    INVALID_DAILY_MIX: "dailyMix must include at least one source with a positive weight.",
  },
} as const;
