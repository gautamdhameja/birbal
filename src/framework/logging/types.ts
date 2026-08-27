export type DebugLogger = {
  debug(payload: Record<string, unknown>, message?: string): void;
};
