import type { EvalSuite } from "../../../framework/evals/types.js";
import { agentHarnessEvalSuite } from "./agentHarness.js";
import { useCaseExtractionEvalSuite } from "./useCaseExtraction.js";
import { useCasePipelineReplayEvalSuite } from "./useCasePipelineReplay.js";
import { useCaseVerificationEvalSuite } from "./useCaseVerification.js";

export const birbalEvalSuites: EvalSuite[] = [
  agentHarnessEvalSuite,
  useCaseExtractionEvalSuite,
  useCaseVerificationEvalSuite,
  useCasePipelineReplayEvalSuite,
];
