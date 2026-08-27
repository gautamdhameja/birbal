import { z } from "zod";

import { SOURCE_REGISTRY } from "../constants/source-registry.js";

export const SourceTypeSchema = z.enum(SOURCE_REGISTRY.SOURCE_TYPES);

export const SourceDescriptorSchema = z.strictObject({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  domains: z.array(z.string().trim().min(1)).min(1),
  sourceType: SourceTypeSchema,
  enabled: z.boolean(),
});
