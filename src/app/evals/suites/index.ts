import type { EvalSuite } from "../../../framework/evals/types.js";
import { agentHarnessEvalSuite } from "./agentHarness.js";
import { useCaseExtractionEvalSuite } from "./useCaseExtraction.js";

export const birbalEvalSuites: EvalSuite[] = [agentHarnessEvalSuite, useCaseExtractionEvalSuite];
