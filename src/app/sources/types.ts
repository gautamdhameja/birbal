import type { z } from "zod";

import type { SourceDescriptorSchema, SourceTypeSchema } from "./schema.js";

export type SourceDescriptor = z.infer<typeof SourceDescriptorSchema>;
export type SourceType = z.infer<typeof SourceTypeSchema>;
