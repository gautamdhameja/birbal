export type DebugLogger = {
  debug(payload: Record<string, unknown>, message?: string): void;
  isLevelEnabled?(level: "debug"): boolean;
};

export function isDebugEnabled(logger: DebugLogger | undefined): logger is DebugLogger {
  return logger !== undefined && (logger.isLevelEnabled?.("debug") ?? true);
}
