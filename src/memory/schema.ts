import { z } from "zod";

import { PREFERENCES } from "../constants/preferences.js";

const PreferenceTextSchema = z.string().trim().min(1);

export const PreferencesSchema = z
  .strictObject({
    interests: z.array(PreferenceTextSchema).min(1),
    avoid: z.array(PreferenceTextSchema),
    preferredDifficulty: z.enum(PREFERENCES.DIFFICULTIES),
    enableAcademicFallback: z.boolean().default(false),
    minFinalScoreForDigest: z.number().min(0),
    maxItemsPerSource: z.number().int().min(1),
    dailyMix: z.record(z.string().trim().min(1), z.number().min(0)),
  })
  .refine((preferences) => Object.values(preferences.dailyMix).some((weight) => weight > 0), {
    message: PREFERENCES.ERRORS.INVALID_DAILY_MIX,
    path: ["dailyMix"],
  });
