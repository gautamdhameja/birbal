import type { CandidateItem, ItemScore, ScoredCandidateItem } from "../../../daily/types.js";
import type { PipelineRunItem } from "../../../../framework/pipeline/orchestrator.js";
import type { PipelineContext } from "../../../../framework/pipeline/types.js";
import type { Rubric } from "../../../../framework/scoring/rubric.js";
import { enterpriseDailyReadingRubric } from "../rubric.js";
import type { EnterpriseDailyScore } from "../rubric.js";

export function enterpriseDailyRubricFromContext(
  context: PipelineContext,
): Rubric<EnterpriseDailyScore> {
  return (
    (context.rubric as Rubric<EnterpriseDailyScore> | undefined) ?? enterpriseDailyReadingRubric
  );
}

export function selectedRunItemScore(item: PipelineRunItem): ItemScore {
  return item.score as ItemScore;
}

export function dailyScoredItemFromRunItem(item: PipelineRunItem): ScoredCandidateItem {
  const candidate = item.item as CandidateItem;
  const score = selectedRunItemScore(item);
  const contentText =
    typeof item.content === "object" && item.content !== null && "plainText" in item.content
      ? String((item.content as { plainText?: unknown }).plainText ?? "")
      : candidate.contentText;
  const enrichedCandidate: CandidateItem = {
    ...candidate,
    contentText,
    contentFetchStatus:
      typeof item.metadata.contentFetchStatus === "string"
        ? item.metadata.contentFetchStatus
        : candidate.contentFetchStatus,
    category: typeof item.classification === "string" ? item.classification : candidate.category,
  } as CandidateItem;

  return {
    ...enrichedCandidate,
    score,
  };
}
