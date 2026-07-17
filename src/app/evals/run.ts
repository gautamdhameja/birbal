import { renderEvalRunJson, renderEvalRunSummary } from "../../framework/evals/report.js";
import { runEvalSuites } from "../../framework/evals/runner.js";
import type { EvalRunResult } from "../../framework/evals/types.js";
import { LOCAL_MODEL_SMOKE_EVAL_SUITE_ID } from "./constants.js";
import { birbalEvalSuites } from "./suites/index.js";

export type RunBirbalEvalsOptions = {
  suiteIds?: readonly string[];
};

export type RenderBirbalEvalOptions = {
  json?: boolean;
};

export async function runBirbalEvals(options: RunBirbalEvalsOptions = {}): Promise<EvalRunResult> {
  const suiteIds = options.suiteIds ?? [];
  const suites = [...birbalEvalSuites];
  if (suiteIds.includes(LOCAL_MODEL_SMOKE_EVAL_SUITE_ID)) {
    const { localModelSmokeEvalSuite } = await import("./suites/localModelSmoke.js");
    suites.push(localModelSmokeEvalSuite);
  }

  return runEvalSuites(suites, {
    suiteIds,
  });
}

export function renderBirbalEvalResult(
  result: EvalRunResult,
  options: RenderBirbalEvalOptions = {},
): string {
  return options.json ? renderEvalRunJson(result) : renderEvalRunSummary(result);
}
