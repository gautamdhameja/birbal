// Purpose: Runs Birbal eval suites from CLI or tests.
// Scope: Keeps application eval orchestration separate from the generic eval runner.

import { renderEvalRunJson, renderEvalRunSummary } from "../../framework/evals/report.js";
import { runEvalSuites } from "../../framework/evals/runner.js";
import type { EvalRunResult } from "../../framework/evals/types.js";
import { birbalEvalSuites } from "./suites/index.js";

export type RunBirbalEvalsOptions = {
  suiteIds?: readonly string[];
};

export type RenderBirbalEvalOptions = {
  json?: boolean;
};

export async function runBirbalEvals(options: RunBirbalEvalsOptions = {}): Promise<EvalRunResult> {
  return runEvalSuites(birbalEvalSuites, {
    suiteIds: options.suiteIds ?? [],
  });
}

export function renderBirbalEvalResult(
  result: EvalRunResult,
  options: RenderBirbalEvalOptions = {},
): string {
  return options.json ? renderEvalRunJson(result) : renderEvalRunSummary(result);
}
