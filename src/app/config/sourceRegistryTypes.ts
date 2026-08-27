import type { z } from "zod";

import type { SourceRegistrySchema } from "./sourceRegistrySchema.js";
import type { SourceDescriptor } from "../sources/types.js";

export type SourceRegistryItem = SourceDescriptor;
export type SourceRegistry = z.infer<typeof SourceRegistrySchema>;
