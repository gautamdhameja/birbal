// Purpose: Implements the research preference memory: types.
// Scope: Loads and validates local preference configuration.

import type { z } from "zod";

import type { PreferencesSchema } from "./schema.js";

export type UserPreferences = z.infer<typeof PreferencesSchema>;
