import { CANDIDATE_CATEGORIES, CONTENT_FETCH_STATUSES } from "../constants/candidates.js";
import type { UserPreferences } from "../memory/types.js";
import type { CandidateCategory, ScoredCandidateItem } from "./types.js";

const DIGEST_CATEGORY_SLOTS = [
  CANDIDATE_CATEGORIES.WORKFLOW_REDESIGN,
  CANDIDATE_CATEGORIES.AGENTIC_IMPLEMENTATION,
  CANDIDATE_CATEGORIES.FDE_CUSTOMER_DEPLOYMENT,
  CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE,
  CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE,
] as const satisfies CandidateCategory[];

const BACKFILL_CATEGORY = CANDIDATE_CATEGORIES.GOVERNANCE_ROI;
const CLOSE_SCORE_DELTA = 0.3;
const EVERGREEN_RECENCY_MAX = 2;
const EVERGREEN_MIN_FINAL_SCORE = 4.2;
const EVERGREEN_MIN_DEPTH_SCORE = 4;

type SourceCounts = Map<string, number>;

function practicalDepthScore(item: ScoredCandidateItem): number {
  return (
    item.score.workflowRedesignDepth +
    item.score.deploymentFdeRelevance +
    item.score.businessOutcomeClarity +
    item.score.technicalImplementationUsefulness
  );
}

function averagePracticalDepth(item: ScoredCandidateItem): number {
  return practicalDepthScore(item) / 4;
}

function hasFetchedContent(item: ScoredCandidateItem): boolean {
  return item.contentFetchStatus === CONTENT_FETCH_STATUSES.FETCHED;
}

function isEvergreenAllowed(item: ScoredCandidateItem): boolean {
  if (item.score.recency > EVERGREEN_RECENCY_MAX) {
    return true;
  }

  return (
    item.score.finalScore >= EVERGREEN_MIN_FINAL_SCORE &&
    averagePracticalDepth(item) >= EVERGREEN_MIN_DEPTH_SCORE
  );
}

function isDigestEligible(item: ScoredCandidateItem, preferences: UserPreferences): boolean {
  return (
    !item.score.rejected &&
    item.category !== CANDIDATE_CATEGORIES.REJECTED &&
    item.score.finalScore >= preferences.minFinalScoreForDigest &&
    isEvergreenAllowed(item)
  );
}

function compareDigestCandidates(
  left: ScoredCandidateItem,
  right: ScoredCandidateItem,
  sourceCounts: SourceCounts,
): number {
  const scoreOrder = right.score.finalScore - left.score.finalScore;
  if (Math.abs(scoreOrder) > CLOSE_SCORE_DELTA) {
    return scoreOrder;
  }

  const sourceDiversityOrder =
    (sourceCounts.get(left.sourceId) ?? 0) - (sourceCounts.get(right.sourceId) ?? 0);
  if (sourceDiversityOrder !== 0) {
    return sourceDiversityOrder;
  }

  const fetchedOrder = Number(hasFetchedContent(right)) - Number(hasFetchedContent(left));
  if (fetchedOrder !== 0) {
    return fetchedOrder;
  }

  const practicalOrder = practicalDepthScore(right) - practicalDepthScore(left);
  if (practicalOrder !== 0) {
    return practicalOrder;
  }

  return left.title.localeCompare(right.title);
}

function selectBestCandidate(
  candidates: ScoredCandidateItem[],
  selectedIds: Set<string>,
  sourceCounts: SourceCounts,
  preferences: UserPreferences,
  categories: readonly CandidateCategory[],
): ScoredCandidateItem | undefined {
  return candidates
    .filter((item) => !selectedIds.has(item.id))
    .filter((item) => categories.includes(item.category ?? CANDIDATE_CATEGORIES.REJECTED))
    .filter((item) => (sourceCounts.get(item.sourceId) ?? 0) < preferences.maxItemsPerSource)
    .sort((left, right) => compareDigestCandidates(left, right, sourceCounts))[0];
}

function addSelectedItem(
  item: ScoredCandidateItem,
  selectedItems: ScoredCandidateItem[],
  selectedIds: Set<string>,
  sourceCounts: SourceCounts,
): void {
  selectedItems.push(item);
  selectedIds.add(item.id);
  sourceCounts.set(item.sourceId, (sourceCounts.get(item.sourceId) ?? 0) + 1);
}

export function selectDigestItems(
  items: ScoredCandidateItem[],
  preferences: UserPreferences,
): ScoredCandidateItem[] {
  const eligibleItems = items.filter((item) => isDigestEligible(item, preferences));
  const selectedItems: ScoredCandidateItem[] = [];
  const selectedIds = new Set<string>();
  const sourceCounts: SourceCounts = new Map();

  for (const category of DIGEST_CATEGORY_SLOTS) {
    const item =
      selectBestCandidate(eligibleItems, selectedIds, sourceCounts, preferences, [category]) ??
      selectBestCandidate(eligibleItems, selectedIds, sourceCounts, preferences, [
        BACKFILL_CATEGORY,
      ]);
    if (item) {
      addSelectedItem(item, selectedItems, selectedIds, sourceCounts);
    }
  }

  return selectedItems;
}
