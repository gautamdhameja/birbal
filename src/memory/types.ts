import type { z } from "zod";

import { PreferencesSchema } from "./schema.js";

export type UserPreferences = z.infer<typeof PreferencesSchema>;
