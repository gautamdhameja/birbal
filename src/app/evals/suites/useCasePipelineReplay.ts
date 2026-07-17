import type { EvalCase, EvalSuite } from "../../../framework/evals/types.js";
import { extractEnterpriseUseCases } from "../../pipelines/useCases/extractor.js";
import { renderEnterpriseUseCaseDigest } from "../../pipelines/useCases/renderer.js";
import { selectEnterpriseUseCases } from "../../pipelines/useCases/selector.js";
import { verifySelectedEnterpriseUseCases } from "../../pipelines/useCases/verification.js";
import { expectEqual, expectIncludes } from "../assertions.js";
import {
  replayCandidate,
  replayExtractionResponse,
  replaySourceEvidence,
  replaySourceText,
} from "../fixtures/useCasePipelineReplay.js";

const replayCase: EvalCase = {
  id: "use_case_pipeline_offline_replay",
  name: "replays extraction through digest rendering without network access",
  async run() {
    let extractionCalls = 0;
    const extracted = await extractEnterpriseUseCases(replayCandidate, replaySourceText, {
      sourceEvidence: replaySourceEvidence,
      completeFn: async () => {
        extractionCalls += 1;
        return JSON.stringify(replayExtractionResponse);
      },
    });

    let verificationCalls = 0;
    const verificationPrompts: string[] = [];
    const verified = await verifySelectedEnterpriseUseCases(extracted, {
      fetchEvidence: async () => replaySourceEvidence,
      completeFn: async (messages) => {
        verificationCalls += 1;
        const prompt = messages.map((message) => message.content).join("\n");
        verificationPrompts.push(prompt);
        const supported =
          prompt.includes('"companyName":"Acme"') &&
          prompt.includes(replaySourceEvidence.source.plainText);
        return JSON.stringify({
          verified: supported,
          confidenceScore: supported ? 5 : 1,
          evidenceLinks: [replayCandidate.url],
          notes: supported
            ? "The source supports the deployed workflow and outcome."
            : "The source contains advice, not a Globex deployment.",
        });
      },
    });

    const selected = selectEnterpriseUseCases(verified, {
      maxUseCasesPerRun: 5,
      referenceDate: new Date("2026-06-21T09:00:00.000Z"),
    });
    const digest = renderEnterpriseUseCaseDigest(selected, "2026-06-21");

    return {
      assertions: [
        expectEqual("two candidates extracted", extracted.length, 2),
        expectEqual("each candidate verified", verificationCalls, 2),
        expectEqual(
          "each verification is grounded in the source snapshot",
          verificationPrompts.every((prompt) =>
            prompt.includes(replaySourceEvidence.source.plainText),
          ),
          true,
        ),
        expectEqual("one grounded candidate accepted", verified.length, 1),
        expectEqual("one candidate selected", selected.length, 1),
        expectEqual("extractor called once", extractionCalls, 1),
        expectIncludes("digest contains supported company", digest, "### 1. Acme"),
        expectIncludes("digest contains supported metric", digest, "20% faster troubleshooting"),
        expectEqual("digest excludes hypothetical company", digest.includes("Globex"), false),
      ],
      metadata: {
        extracted: extracted.length,
        verified: verified.length,
        selected: selected.length,
      },
    };
  },
};

export const useCasePipelineReplayEvalSuite: EvalSuite = {
  id: "use_case_pipeline_replay",
  name: "Enterprise Use-Case Pipeline Replay",
  description: "Offline replay of the model-facing enterprise use-case stages.",
  cases: [replayCase],
};
