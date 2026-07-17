// Purpose: Implements use-case persistence finalization and Markdown rendering.
// Scope: Owns successful-run persistence and output formatting.

import { upsertUseCase } from "../../../db/useCases.js";
import type { PipelineFinalizer, Renderer } from "../../../framework/pipeline/types.js";
import { runDateString } from "../../componentHelpers.js";
import { renderEnterpriseUseCaseDigest } from "../renderer.js";
import type { EnterpriseUseCase } from "../schema.js";
import { shouldPersistSelectedUseCases } from "./support.js";
import type { VerifiedEnterpriseUseCase } from "../verification.js";

export const enterpriseUseCaseFinalizer: PipelineFinalizer = {
  async finalize(items, _artifact, context) {
    if (!shouldPersistSelectedUseCases(context)) {
      return;
    }

    for (const useCase of items as VerifiedEnterpriseUseCase[]) {
      upsertUseCase({
        ...useCase,
        runId: context.runId,
        rawJson: {
          useCase,
          verification: useCase.verification,
        },
      });
    }
  },
};

export const enterpriseUseCaseMarkdownRenderer: Renderer = {
  async render(items, context) {
    return renderEnterpriseUseCaseDigest(items as EnterpriseUseCase[], runDateString(context));
  },
};
