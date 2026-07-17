// Purpose: Implements daily enterprise deployment scoring.
// Scope: Owns item persistence, model scoring, and score persistence.

import { getItemByUrl, upsertItem, upsertScore } from "../../../db/items.js";
import {
  scoreItem as scoreDailyItem,
  scoreItems as scoreDailyItems,
} from "../../../daily/scoring.js";
import type { CandidateItem, ItemScore } from "../../../daily/types.js";
import type { Scorer } from "../../../framework/pipeline/types.js";
import {
  asRunItem,
  candidateWithFetchedContent,
  preferencesFromContext,
} from "../../componentHelpers.js";
import { enterpriseDailyRubricFromContext } from "./support.js";

export const enterpriseDeploymentScorer: Scorer = {
  async score(item, context) {
    const candidate = candidateWithFetchedContent(asRunItem(item));
    const existingItem = getItemByUrl(candidate.url);

    upsertItem(candidate);
    const persistedItem = getItemByUrl(candidate.url) ?? existingItem ?? candidate;

    const score = await scoreDailyItem(candidate, preferencesFromContext(context), {
      traceId: context.runId,
      traceLabel: "pipeline.daily.enterprise_deployment_scorer",
      rubric: enterpriseDailyRubricFromContext(context),
      completeFn: context.modelClient.complete,
    });
    upsertScore(persistedItem.id, score);

    return score;
  },
  async scoreBatch(items, context) {
    const preferences = preferencesFromContext(context);
    const orderedScores = new Array<ItemScore>(items.length);
    const candidatesToScore: Array<{
      candidate: CandidateItem;
      itemId: string;
      outputIndex: number;
    }> = [];

    for (const [index, item] of items.entries()) {
      const candidate = candidateWithFetchedContent(asRunItem(item));
      const existingItem = getItemByUrl(candidate.url);

      upsertItem(candidate);
      const persistedItem = getItemByUrl(candidate.url) ?? existingItem ?? candidate;

      candidatesToScore.push({
        candidate,
        itemId: persistedItem.id,
        outputIndex: index,
      });
    }

    const newScores = await scoreDailyItems(
      candidatesToScore.map(({ candidate }) => candidate),
      preferences,
      {
        traceId: context.runId,
        traceLabel: "pipeline.daily.enterprise_deployment_scorer.batch",
        rubric: enterpriseDailyRubricFromContext(context),
        completeFn: context.modelClient.complete,
      },
    );
    for (const [index, score] of newScores.entries()) {
      const candidateToScore = candidatesToScore[index];
      if (!candidateToScore) {
        continue;
      }

      upsertScore(candidateToScore.itemId, score);
      orderedScores[candidateToScore.outputIndex] = score;
    }

    return orderedScores;
  },
};
