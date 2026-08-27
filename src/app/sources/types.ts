import type { z } from "zod";

import type { SourceDescriptorSchema } from "./schema.js";

export type SourceDescriptor = z.infer<typeof SourceDescriptorSchema>;
