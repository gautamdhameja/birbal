// Purpose: Provides small assertion helpers for Birbal eval suites.
// Scope: Keeps eval cases readable without coupling to the test runner.

import type { EvalAssertionResult } from "../framework/evals/types.js";

export function expectEqual<TValue>(
  name: string,
  actual: TValue,
  expected: TValue,
): EvalAssertionResult {
  const passed = Object.is(actual, expected);

  return {
    name,
    passed,
    ...(passed
      ? {}
      : {
          message: `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        }),
  };
}

export function expectIncludes(
  name: string,
  actual: string,
  expectedSubstring: string,
): EvalAssertionResult {
  const passed = actual.includes(expectedSubstring);

  return {
    name,
    passed,
    ...(passed
      ? {}
      : {
          message: `expected ${JSON.stringify(actual)} to include ${JSON.stringify(
            expectedSubstring,
          )}`,
        }),
  };
}

export function expectTrue(
  name: string,
  condition: boolean,
  message?: string,
): EvalAssertionResult {
  return {
    name,
    passed: condition,
    ...(condition ? {} : { message: message ?? "expected condition to be true" }),
  };
}
