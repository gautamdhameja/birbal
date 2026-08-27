import { readFileSync } from "node:fs";

import type { z } from "zod";

export type JsonConfigErrors = {
  invalidJson: string;
  invalidConfig: string;
};

function parseJsonConfig(rawConfig: string, invalidJsonMessage: string): unknown {
  try {
    return JSON.parse(rawConfig);
  } catch (error) {
    throw new Error(
      `${invalidJsonMessage} ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function loadJsonConfig<T>(
  configPath: string,
  schema: z.ZodType<T>,
  errors: JsonConfigErrors,
): T {
  const parsed = schema.safeParse(
    parseJsonConfig(readFileSync(configPath, "utf8"), errors.invalidJson),
  );
  if (!parsed.success) {
    throw new Error(`${errors.invalidConfig} ${parsed.error.message}`);
  }

  return parsed.data;
}
