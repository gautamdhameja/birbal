export type EvalStatus = "passed" | "failed";

export type EvalAssertionResult = {
  name: string;
  passed: boolean;
  message?: string;
  metadata?: Record<string, unknown>;
};

export type EvalTraceStatus = "ok" | "error";

export type EvalTraceSpan = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startedAt: string;
  endedAt: string;
  status: EvalTraceStatus;
  attributes: Record<string, unknown>;
};

export type EvalTrace = {
  traceId: string;
  spans: EvalTraceSpan[];
};

export type EvalCaseResult = {
  id: string;
  name: string;
  status: EvalStatus;
  durationMs: number;
  assertions: EvalAssertionResult[];
  error?: string;
  metadata?: Record<string, unknown>;
  trace?: EvalTrace;
};

export type EvalCaseOutput = {
  assertions: EvalAssertionResult[];
  metadata?: Record<string, unknown>;
  trace?: EvalTrace;
};

export type EvalCaseContext = {
  suiteId: string;
  now(): Date;
};

export type EvalCase = {
  id: string;
  name: string;
  description?: string;
  run(context: EvalCaseContext): Promise<EvalCaseOutput>;
};

export type EvalSuite = {
  id: string;
  name: string;
  description?: string;
  cases: EvalCase[];
};

export type EvalSuiteResult = {
  id: string;
  name: string;
  status: EvalStatus;
  durationMs: number;
  cases: EvalCaseResult[];
};

export type EvalRunResult = {
  status: EvalStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  suites: EvalSuiteResult[];
  counts: {
    suites: number;
    cases: number;
    passed: number;
    failed: number;
    assertions: number;
  };
};

export type EvalRunOptions = {
  concurrency?: number;
  now?: () => Date;
  suiteIds?: readonly string[];
};
