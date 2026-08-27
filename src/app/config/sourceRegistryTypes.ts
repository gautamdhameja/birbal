import type { z } from "zod";

import type { SourceRegistryItemSchema, SourceRegistrySchema } from "./sourceRegistrySchema.js";

export type SourceRegistryItem = z.infer<typeof SourceRegistryItemSchema>;
export type SourceRegistry = z.infer<typeof SourceRegistrySchema>;
