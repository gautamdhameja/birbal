import type { EvalCase, EvalSuite } from "../../../framework/evals/types.js";
import type { ModelCompleteOptions } from "../../../framework/llm/types.js";
import { MODEL_PROVIDERS } from "../../constants/model-providers.js";
import {
  isAcceptedEnterpriseUseCaseVerification,
  verifyEnterpriseUseCase,
} from "../../pipelines/useCases/verification.js";
import { expectEqual, expectIncludes, expectTrue } from "../assertions.js";
import {
  VERIFICATION_SOURCE_URL,
  verificationEvidence,
  verificationFixtures,
  verificationUseCase,
  type VerificationFixture,
} from "../fixtures/useCaseVerification.js";

function verificationCase(fixture: VerificationFixture): EvalCase {
  return {
    id: fixture.id,
    name: fixture.name,
    async run() {
      let callCount = 0;
      let prompt = "";
      let capturedOptions: ModelCompleteOptions | undefined;
      const verification = await verifyEnterpriseUseCase(
        verificationUseCase(fixture.roiMetric),
        verificationEvidence(fixture.evidenceText),
        {
          completeFn: async (messages, options) => {
            callCount += 1;
            prompt = messages.map((message) => message.content).join("\n");
            capturedOptions = options;
            return JSON.stringify({
              verified: fixture.expected.verified,
              confidenceScore: fixture.expected.confidenceScore,
              evidenceLinks: [VERIFICATION_SOURCE_URL],
              notes: fixture.expected.notes,
            });
          },
        },
      );
      return {
        assertions: [
          expectEqual("verification decision", verification.verified, fixture.expected.verified),
          expectEqual(
            "verification confidence",
            verification.confidenceScore,
            fixture.expected.confidenceScore,
          ),
          expectEqual(
            "acceptance policy",
            isAcceptedEnterpriseUseCaseVerification(verification),
            fixture.expected.accepted,
          ),
          expectEqual("model called once", callCount, 1),
          expectTrue(
            "prompt contains the conflicting or supporting claims",
            fixture.promptClaims.every((claim) => prompt.includes(claim)),
          ),
          expectIncludes(
            "prompt requires source-only grounding",
            prompt,
            "Use only the provided source and linked evidence",
          ),
          expectIncludes(
            "prompt defines material contradiction",
            prompt,
            "extracted core story is materially contradicted",
          ),
          expectIncludes("notes explain the decision", verification.notes, fixture.expected.notes),
          expectEqual("temperature is deterministic", capturedOptions?.temperature, 0),
          expectEqual(
            "response is constrained to JSON",
            capturedOptions?.response_format?.type,
            MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT,
          ),
        ],
        metadata: {
          modelCalls: callCount,
        },
      };
    },
  };
}

export const useCaseVerificationEvalSuite: EvalSuite = {
  id: "use_case_verification",
  name: "Enterprise Use-Case Verification",
  description: "Source-grounding contracts for enterprise use-case verification.",
  cases: verificationFixtures.map(verificationCase),
};
