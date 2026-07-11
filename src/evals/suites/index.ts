// Purpose: Collects Birbal eval suites.
// Scope: Provides one import surface for CLI and tests.

import type { EvalSuite } from "../../framework/evals/types.js";
import { agentHarnessEvalSuite } from "./agentHarness.js";
import { useCaseExtractionEvalSuite } from "./useCaseExtraction.js";

export const birbalEvalSuites: EvalSuite[] = [agentHarnessEvalSuite, useCaseExtractionEvalSuite];
