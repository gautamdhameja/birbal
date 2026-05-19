import { z } from "zod";

import { PREFERENCES } from "../constants/preferences.js";
import { SOURCES } from "../constants/sources.js";

const PreferenceTextSchema = z.string().trim().min(1);

export const PreferencesSchema = z
  .strictObject({
    interests: z.array(PreferenceTextSchema).min(1),
    avoid: z.array(PreferenceTextSchema),
    preferredDifficulty: z.enum(PREFERENCES.DIFFICULTIES),
    dailyMix: z.strictObject({
      [SOURCES.ARXIV]: z.number().min(0),
      [SOURCES.HACKER_NEWS]: z.number().min(0),
    }),
  })
  .refine((preferences) => Object.values(preferences.dailyMix).some((weight) => weight > 0), {
    message: PREFERENCES.ERRORS.INVALID_DAILY_MIX,
    path: ["dailyMix"],
  });
