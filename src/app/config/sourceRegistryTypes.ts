import type { z } from "zod";

import type { SourceRegistrySchema } from "./sourceRegistrySchema.js";

export type SourceRegistry = z.infer<typeof SourceRegistrySchema>;
