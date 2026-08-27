import { z } from "zod";

import { SourceDescriptorSchema } from "../sources/schema.js";

export const SourceRegistrySchema = z.strictObject({
  sources: z.array(SourceDescriptorSchema).min(1),
});
