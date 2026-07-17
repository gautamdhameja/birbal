import type {
  EvalCase,
  EvalCaseContext,
  EvalCaseResult,
  EvalRunOptions,
  EvalRunResult,
  EvalStatus,
  EvalSuite,
  EvalSuiteResult,
} from "./types.js";
import { mapLimit } from "../pipeline/concurrency.js";

const DEFAULT_EVAL_CONCURRENCY = 4;

function statusFromFailures(failedCount: number): EvalStatus {
  return failedCount > 0 ? "failed" : "passed";
}

function durationMs(startedAt: Date, finishedAt: Date): number {
  return finishedAt.getTime() - startedAt.getTime();
}

async function runEvalCase(
  suite: EvalSuite,
  evalCase: EvalCase,
  context: EvalCaseContext,
): Promise<EvalCaseResult> {
  const startedAt = context.now();
  try {
    const result = await evalCase.run(context);
    const finishedAt = context.now();

    return {
      id: evalCase.id,
      name: evalCase.name,
      status: statusFromFailures(result.assertions.filter((assertion) => !assertion.passed).length),
      durationMs: durationMs(startedAt, finishedAt),
      assertions: result.assertions,
      ...(result.metadata ? { metadata: result.metadata } : {}),
      ...(result.trace ? { trace: result.trace } : {}),
    };
  } catch (error) {
    const finishedAt = context.now();

    return {
      id: evalCase.id,
      name: evalCase.name,
      status: "failed",
      durationMs: durationMs(startedAt, finishedAt),
      assertions: [
        {
          name: "case did not throw",
          passed: false,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        suiteId: suite.id,
      },
    };
  }
}

async function runEvalSuite(
  suite: EvalSuite,
  options: Required<EvalRunOptions>,
): Promise<EvalSuiteResult> {
  const startedAt = options.now();
  const context: EvalCaseContext = {
    suiteId: suite.id,
    now: options.now,
  };
  const cases = await mapLimit(suite.cases, options.concurrency, async (evalCase) =>
    runEvalCase(suite, evalCase, context),
  );

  const finishedAt = options.now();
  const failedCases = cases.filter((result) => result.status === "failed").length;

  return {
    id: suite.id,
    name: suite.name,
    status: statusFromFailures(failedCases),
    durationMs: durationMs(startedAt, finishedAt),
    cases,
  };
}

function selectSuites(suites: readonly EvalSuite[], suiteIds: readonly string[]): EvalSuite[] {
  if (suiteIds.length === 0) {
    return [...suites];
  }

  const suiteById = new Map(suites.map((suite) => [suite.id, suite]));
  const unknownSuiteIds = suiteIds.filter((suiteId) => !suiteById.has(suiteId));
  if (unknownSuiteIds.length > 0) {
    throw new Error(
      `Unknown eval suite(s): ${unknownSuiteIds.join(", ")}. Available suites: ${suites.map((suite) => suite.id).join(", ")}.`,
    );
  }

  return suiteIds.map((suiteId) => suiteById.get(suiteId)!);
}

export async function runEvalSuites(
  suites: readonly EvalSuite[],
  options: EvalRunOptions = {},
): Promise<EvalRunResult> {
  const resolvedOptions: Required<EvalRunOptions> = {
    concurrency: options.concurrency ?? DEFAULT_EVAL_CONCURRENCY,
    now: options.now ?? (() => new Date()),
    suiteIds: options.suiteIds ?? [],
  };
  const selectedSuites = selectSuites(suites, resolvedOptions.suiteIds);
  const startedAt = resolvedOptions.now();
  const results = await mapLimit(selectedSuites, resolvedOptions.concurrency, async (suite) =>
    runEvalSuite(suite, resolvedOptions),
  );

  const finishedAt = resolvedOptions.now();
  const cases = results.flatMap((suite) => suite.cases);
  const failed = cases.filter((result) => result.status === "failed").length;
  const passed = cases.length - failed;

  return {
    status: statusFromFailures(failed),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: durationMs(startedAt, finishedAt),
    suites: results,
    counts: {
      suites: results.length,
      cases: cases.length,
      passed,
      failed,
      assertions: cases.reduce((count, result) => count + result.assertions.length, 0),
    },
  };
}
