export type DebugWarnLogger = {
  debug(payload: Record<string, unknown>, message?: string): void;
  warn(payload: Record<string, unknown>, message?: string): void;
};

export const NOOP_DEBUG_WARN_LOGGER: DebugWarnLogger = {
  debug: () => undefined,
  warn: () => undefined,
};
