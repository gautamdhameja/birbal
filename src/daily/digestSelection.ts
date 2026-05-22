import { CANDIDATE_CATEGORIES, CONTENT_FETCH_STATUSES } from "../constants/candidates.js";
import { DAILY_READING } from "../constants/daily.js";
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

export type DigestSelectionTrace = {
  counts: {
    candidatesBySource: Record<string, number>;
    candidatesByCategory: Record<string, number>;
    rejected: number;
    belowScoreThreshold: number;
    withFetchedContent: number;
    withFailedOrPaywalledContent: number;
  };
  selected: Array<{
    slot: CandidateCategory;
    slotIndex: number;
    itemId: string;
    title: string;
    url: string;
    sourceId: string;
    sourceName: string;
    category: CandidateCategory;
    finalScore: number;
    reason: string;
  }>;
  skippedDueConstraints: Array<{
    itemId: string;
    title: string;
    url: string;
    sourceId: string;
    sourceName: string;
    category: CandidateCategory | null;
    finalScore: number;
    reason: string;
  }>;
};

export type DigestSelectionResult = {
  selectedItems: ScoredCandidateItem[];
  trace: DigestSelectionTrace;
};

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

function hasFailedOrPaywalledContent(item: ScoredCandidateItem): boolean {
  return (
    item.contentFetchStatus === CONTENT_FETCH_STATUSES.FAILED ||
    item.contentFetchStatus === CONTENT_FETCH_STATUSES.PAYWALLED
  );
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

function incrementCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function buildSelectionCounts(
  items: ScoredCandidateItem[],
  preferences: UserPreferences,
): DigestSelectionTrace["counts"] {
  const candidatesBySource: Record<string, number> = {};
  const candidatesByCategory: Record<string, number> = {};
  let rejected = 0;
  let belowScoreThreshold = 0;
  let withFetchedContent = 0;
  let withFailedOrPaywalledContent = 0;

  for (const item of items) {
    incrementCount(candidatesBySource, item.sourceId);
    incrementCount(candidatesByCategory, item.category ?? CANDIDATE_CATEGORIES.REJECTED);

    if (item.score.rejected || item.category === CANDIDATE_CATEGORIES.REJECTED) {
      rejected += 1;
    }

    if (item.score.finalScore < preferences.minFinalScoreForDigest) {
      belowScoreThreshold += 1;
    }

    if (hasFetchedContent(item)) {
      withFetchedContent += 1;
    }

    if (hasFailedOrPaywalledContent(item)) {
      withFailedOrPaywalledContent += 1;
    }
  }

  return {
    candidatesBySource,
    candidatesByCategory,
    rejected,
    belowScoreThreshold,
    withFetchedContent,
    withFailedOrPaywalledContent,
  };
}

function selectedReason(
  item: ScoredCandidateItem,
  slot: CandidateCategory,
  backfilled: boolean,
): string {
  if (backfilled) {
    return `${item.category} backfilled ${slot} because no eligible ${slot} item remained.`;
  }

  return `Highest-ranked eligible ${slot} item for this slot.`;
}

function summarizeSelectedItem(
  item: ScoredCandidateItem,
  slot: CandidateCategory,
  slotIndex: number,
  backfilled: boolean,
): DigestSelectionTrace["selected"][number] {
  return {
    slot,
    slotIndex,
    itemId: item.id,
    title: item.title,
    url: item.url,
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    category: item.category ?? CANDIDATE_CATEGORIES.REJECTED,
    finalScore: item.score.finalScore,
    reason: selectedReason(item, slot, backfilled),
  };
}

function targetCategoryCounts(): Map<CandidateCategory, number> {
  const counts = new Map<CandidateCategory, number>();

  for (const category of DIGEST_CATEGORY_SLOTS) {
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return counts;
}

function selectedCategoryCounts(
  selectedItems: readonly ScoredCandidateItem[],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const item of selectedItems) {
    const category = item.category ?? CANDIDATE_CATEGORIES.REJECTED;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return counts;
}

function skippedConstraintReason(
  item: ScoredCandidateItem,
  selectedItems: readonly ScoredCandidateItem[],
  sourceCounts: SourceCounts,
  preferences: UserPreferences,
): string | null {
  if ((sourceCounts.get(item.sourceId) ?? 0) >= preferences.maxItemsPerSource) {
    return `source limit reached for ${item.sourceName}`;
  }

  const category = item.category ?? CANDIDATE_CATEGORIES.REJECTED;
  const targetCounts = targetCategoryCounts();
  const selectedCounts = selectedCategoryCounts(selectedItems);
  const targetCount = targetCounts.get(category);

  if (targetCount !== undefined && (selectedCounts.get(category) ?? 0) >= targetCount) {
    return `${category} slot quota already filled`;
  }

  if (category === BACKFILL_CATEGORY) {
    return `${BACKFILL_CATEGORY} backfill was not needed`;
  }

  if (!targetCounts.has(category)) {
    return `${category} is not part of the digest slot mix`;
  }

  return null;
}

function buildSkippedDueConstraints(
  eligibleItems: readonly ScoredCandidateItem[],
  selectedItems: readonly ScoredCandidateItem[],
  sourceCounts: SourceCounts,
  preferences: UserPreferences,
): DigestSelectionTrace["skippedDueConstraints"] {
  const selectedIds = new Set(selectedItems.map((item) => item.id));

  return eligibleItems
    .filter((item) => !selectedIds.has(item.id))
    .sort((left, right) => right.score.finalScore - left.score.finalScore)
    .flatMap((item) => {
      const reason = skippedConstraintReason(item, selectedItems, sourceCounts, preferences);
      if (!reason) {
        return [];
      }

      return [
        {
          itemId: item.id,
          title: item.title,
          url: item.url,
          sourceId: item.sourceId,
          sourceName: item.sourceName,
          category: item.category ?? null,
          finalScore: item.score.finalScore,
          reason,
        },
      ];
    })
    .slice(0, DAILY_READING.MAX_SELECTION_TRACE_SKIPPED_ITEMS);
}

export function selectDigestItemsWithTrace(
  items: ScoredCandidateItem[],
  preferences: UserPreferences,
): DigestSelectionResult {
  const eligibleItems = items.filter((item) => isDigestEligible(item, preferences));
  const selectedItems: ScoredCandidateItem[] = [];
  const selectedTraceItems: DigestSelectionTrace["selected"] = [];
  const selectedIds = new Set<string>();
  const sourceCounts: SourceCounts = new Map();

  for (const [slotIndex, category] of DIGEST_CATEGORY_SLOTS.entries()) {
    const directItem = selectBestCandidate(eligibleItems, selectedIds, sourceCounts, preferences, [
      category,
    ]);
    const item =
      directItem ??
      selectBestCandidate(eligibleItems, selectedIds, sourceCounts, preferences, [
        BACKFILL_CATEGORY,
      ]);

    if (item) {
      addSelectedItem(item, selectedItems, selectedIds, sourceCounts);
      selectedTraceItems.push(summarizeSelectedItem(item, category, slotIndex + 1, !directItem));
    }
  }

  return {
    selectedItems,
    trace: {
      counts: buildSelectionCounts(items, preferences),
      selected: selectedTraceItems,
      skippedDueConstraints: buildSkippedDueConstraints(
        eligibleItems,
        selectedItems,
        sourceCounts,
        preferences,
      ),
    },
  };
}

export function selectDigestItems(
  items: ScoredCandidateItem[],
  preferences: UserPreferences,
): ScoredCandidateItem[] {
  return selectDigestItemsWithTrace(items, preferences).selectedItems;
}
