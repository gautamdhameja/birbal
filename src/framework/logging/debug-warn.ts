import type { DebugLogger } from "./types.js";

export type DebugWarnLogger = DebugLogger & {
  warn(payload: Record<string, unknown>, message?: string): void;
};

export const NOOP_DEBUG_WARN_LOGGER: DebugWarnLogger = {
  debug: () => undefined,
  isLevelEnabled: () => false,
  warn: () => undefined,
};
