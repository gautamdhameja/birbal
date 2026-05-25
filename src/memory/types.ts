import type { z } from "zod";

import type { PreferencesSchema } from "./schema.js";

export type UserPreferences = z.infer<typeof PreferencesSchema>;
