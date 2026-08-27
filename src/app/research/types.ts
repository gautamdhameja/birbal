import type { z } from "zod";

import type { ResearchConfigSchema, ResearchResultSchema } from "./schema.js";

export type ResearchConfig = z.infer<typeof ResearchConfigSchema>;
export type ResearchResult = z.infer<typeof ResearchResultSchema>;
