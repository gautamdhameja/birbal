// Purpose: Renders eval results for CLI output.
// Scope: Keeps human and JSON reporting separate from eval execution.

import type { EvalRunResult } from "./types.js";

const JSON_INDENT_SPACES = 2;

export function renderEvalRunJson(result: EvalRunResult): string {
  return JSON.stringify(result, null, JSON_INDENT_SPACES);
}

export function renderEvalRunSummary(result: EvalRunResult): string {
  const lines = [
    `Eval status: ${result.status}`,
    `Suites: ${result.counts.suites}`,
    `Cases: ${result.counts.cases}`,
    `Passed: ${result.counts.passed}`,
    `Failed: ${result.counts.failed}`,
    `Assertions: ${result.counts.assertions}`,
    `Duration: ${result.durationMs}ms`,
  ];

  for (const suite of result.suites) {
    lines.push("");
    lines.push(`${suite.status === "passed" ? "PASS" : "FAIL"} ${suite.id} - ${suite.name}`);
    for (const evalCase of suite.cases) {
      lines.push(
        `  ${evalCase.status === "passed" ? "PASS" : "FAIL"} ${evalCase.id} - ${evalCase.name}`,
      );
      for (const assertion of evalCase.assertions.filter((item) => !item.passed)) {
        lines.push(`    - ${assertion.name}: ${assertion.message ?? "failed"}`);
      }
    }
  }

  return lines.join("\n");
}
