// Purpose: Implements verified enterprise use-case selection.
// Scope: Owns incremental verification and final selection policy.

import type { PipelineRunItem } from "../../../../framework/pipeline/orchestrator.js";
import { selectWithIncrementalAcceptance } from "../../../../framework/pipeline/selection.js";
import type { Selector } from "../../../../framework/pipeline/types.js";
import type { EnterpriseUseCase } from "../schema.js";
import { useCasePipelineConfigFromContext } from "../config.js";
import { selectEnterpriseUseCaseItems, selectEnterpriseUseCases } from "../selector.js";
import { verifySelectedEnterpriseUseCases } from "../verification.js";
import {
  cachedVerification,
  cacheVerification,
  selectWithoutVerification,
  sourceTextByUrlFromItems,
  useCaseSelectorConfigFromContext,
  verificationBatchSize,
  verificationCandidatePoolSize,
  verificationConfig,
  verificationEnabled,
} from "./support.js";

export const enterpriseUseCaseSelector: Selector = {
  async select(items, context) {
    const config = useCasePipelineConfigFromContext(context);
    const runItems = items as PipelineRunItem[];
    const extractedUseCases = runItems.flatMap((item) =>
      Array.isArray(item.structuredData) ? (item.structuredData as EnterpriseUseCase[]) : [],
    );
    const selectorConfig = useCaseSelectorConfigFromContext(context, config);
    const targetCount = selectorConfig.maxUseCasesPerRun ?? 10;
    const verified = verificationEnabled(config)
      ? await selectWithIncrementalAcceptance({
          candidates: extractedUseCases,
          batchSize: verificationBatchSize(config, targetCount),
          candidatePoolSize: verificationCandidatePoolSize(config, targetCount),
          targetCount,
          selectCandidates: (candidates, limit) =>
            selectEnterpriseUseCases(candidates, {
              ...selectorConfig,
              maxUseCasesPerRun: limit,
            }),
          acceptCandidates: (candidates) =>
            verifySelectedEnterpriseUseCases(candidates, {
              ...verificationConfig(config),
              sourceTextByUrl: sourceTextByUrlFromItems(runItems),
              traceId: context.runId,
              traceLabel: "pipeline.use_cases.enterprise_use_case_verifier",
              completeFn: context.modelClient.complete,
              getCachedVerification: cachedVerification,
              upsertVerificationCache: cacheVerification,
            }),
          selectAccepted: (candidates, limit) =>
            selectEnterpriseUseCaseItems(candidates, {
              ...selectorConfig,
              maxUseCasesPerRun: limit,
            }),
        })
      : selectWithoutVerification(extractedUseCases, selectorConfig);

    context.logger.info(
      {
        event: "pipeline.use_cases.verification",
        extractedUseCases: extractedUseCases.length,
        selectedBeforeVerification: verified.candidatePool.length,
        verifiedBeforeFinalSelection: verified.acceptedPool.length,
        verified: verified.selected.length,
        rejectedByVerification: verified.candidatePool.length - verified.acceptedPool.length,
        processedForVerification: verified.processedCandidateCount,
      },
      "use-case verification completed",
    );

    return verified.selected;
  },
};
