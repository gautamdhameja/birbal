// Purpose: Tests digest selection behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CANDIDATE_CATEGORIES, CONTENT_FETCH_STATUSES } from "../src/app/constants/candidates.js";
import { SOURCE_REGISTRY } from "../src/app/constants/source-registry.js";
import { selectDigestItemsWithTrace } from "../src/app/daily/digestSelection.js";
import type { CandidateCategory, ItemScore, ScoredCandidateItem } from "../src/app/daily/types.js";
import type { UserPreferences } from "../src/app/memory/types.js";

function preferences(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    interests: ["enterprise AI"],
    avoid: [],
    preferredDifficulty: "advanced",
    enableAcademicFallback: false,
    minFinalScoreForDigest: 3.4,
    maxItemsPerSource: 2,
    dailyMix: {
      "source-a": 1,
    },
    ...overrides,
  };
}

function score(overrides: Partial<ItemScore> = {}): ItemScore {
  return {
    enterpriseRelevance: 4,
    workflowRedesignDepth: 4,
    realUseCaseSpecificity: 4,
    deploymentFdeRelevance: 4,
    businessOutcomeClarity: 4,
    technicalImplementationUsefulness: 4,
    recency: 4,
    nonGenericInsight: 4,
    rejected: false,
    reason: "Useful deployment detail.",
    finalScore: 4,
    ...overrides,
  };
}

function item(
  id: string,
  category: CandidateCategory,
  overrides: Partial<ScoredCandidateItem> = {},
): ScoredCandidateItem {
  return {
    id,
    sourceId: "source-a",
    sourceName: "Source A",
    sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
    title: id,
    url: `https://example.com/${id}`,
    summary: "Enterprise deployment report.",
    publishedAt: "2026-05-16T10:00:00Z",
    discoveredAt: "2026-05-16T11:00:00Z",
    contentFetchStatus: CONTENT_FETCH_STATUSES.FETCHED,
    category,
    raw: {},
    score: score(),
    ...overrides,
  };
}

function selectDigestItems(
  items: ScoredCandidateItem[],
  userPreferences: UserPreferences,
): ScoredCandidateItem[] {
  return selectDigestItemsWithTrace(items, userPreferences).selectedItems;
}

describe("enterprise digest item selection", () => {
  it("targets the enterprise digest category mix", () => {
    const selected = selectDigestItems(
      [
        item("enterprise-1", CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE, {
          score: score({ finalScore: 4.6 }),
        }),
        item("enterprise-2", CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE, {
          score: score({ finalScore: 4.5 }),
        }),
        item("workflow", CANDIDATE_CATEGORIES.WORKFLOW_REDESIGN, {
          score: score({ finalScore: 4.4 }),
        }),
        item("agentic", CANDIDATE_CATEGORIES.AGENTIC_IMPLEMENTATION, {
          score: score({ finalScore: 4.3 }),
        }),
        item("fde", CANDIDATE_CATEGORIES.FDE_CUSTOMER_DEPLOYMENT, {
          score: score({ finalScore: 4.2 }),
        }),
        item("governance", CANDIDATE_CATEGORIES.GOVERNANCE_ROI, {
          score: score({ finalScore: 5 }),
        }),
      ],
      preferences({ maxItemsPerSource: 10 }),
    );

    assert.deepEqual(
      selected.map((selectedItem) => selectedItem.id),
      ["workflow", "agentic", "fde", "enterprise-1", "enterprise-2"],
    );
  });

  it("uses governance ROI as a backfill category", () => {
    const selected = selectDigestItems(
      [
        item("enterprise-1", CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE),
        item("enterprise-2", CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE),
        item("workflow", CANDIDATE_CATEGORIES.WORKFLOW_REDESIGN),
        item("agentic", CANDIDATE_CATEGORIES.AGENTIC_IMPLEMENTATION),
        item("governance", CANDIDATE_CATEGORIES.GOVERNANCE_ROI),
      ],
      preferences({ maxItemsPerSource: 10 }),
    );

    assert.deepEqual(
      selected.map((selectedItem) => selectedItem.id),
      ["workflow", "agentic", "governance", "enterprise-1", "enterprise-2"],
    );
  });

  it("excludes rejected items and items below the digest score threshold", () => {
    const selected = selectDigestItems(
      [
        item("rejected", CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE, {
          score: score({ rejected: true, rejectionReason: "Generic.", finalScore: 0 }),
        }),
        item("below-threshold", CANDIDATE_CATEGORIES.WORKFLOW_REDESIGN, {
          score: score({ finalScore: 3.39 }),
        }),
        item("eligible", CANDIDATE_CATEGORIES.AGENTIC_IMPLEMENTATION, {
          score: score({ finalScore: 3.4 }),
        }),
      ],
      preferences(),
    );

    assert.deepEqual(
      selected.map((selectedItem) => selectedItem.id),
      ["eligible"],
    );
  });

  it("prefers source diversity when scores are close", () => {
    const selected = selectDigestItems(
      [
        item("enterprise-a-1", CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE, {
          sourceId: "source-a",
          score: score({ finalScore: 4.9 }),
        }),
        item("enterprise-a-2", CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE, {
          sourceId: "source-a",
          score: score({ finalScore: 4.85 }),
        }),
        item("enterprise-b", CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE, {
          sourceId: "source-b",
          score: score({ finalScore: 4.8 }),
        }),
      ],
      preferences(),
    );

    assert.deepEqual(
      selected.map((selectedItem) => selectedItem.id),
      ["enterprise-a-1", "enterprise-b"],
    );
  });

  it("prefers fetched content and practical detail when scores are close", () => {
    const selected = selectDigestItems(
      [
        item("snippet-workflow", CANDIDATE_CATEGORIES.WORKFLOW_REDESIGN, {
          contentFetchStatus: CONTENT_FETCH_STATUSES.NOT_FETCHED,
          score: score({
            finalScore: 4.8,
            workflowRedesignDepth: 3,
            deploymentFdeRelevance: 3,
            businessOutcomeClarity: 3,
            technicalImplementationUsefulness: 3,
          }),
        }),
        item("fetched-workflow", CANDIDATE_CATEGORIES.WORKFLOW_REDESIGN, {
          contentFetchStatus: CONTENT_FETCH_STATUSES.FETCHED,
          score: score({
            finalScore: 4.7,
            workflowRedesignDepth: 5,
            deploymentFdeRelevance: 5,
            businessOutcomeClarity: 5,
            technicalImplementationUsefulness: 5,
          }),
        }),
      ],
      preferences(),
    );

    assert.equal(selected[0]?.id, "fetched-workflow");
  });

  it("allows older evergreen reports only when score and depth are strong", () => {
    const selected = selectDigestItems(
      [
        item("old-shallow", CANDIDATE_CATEGORIES.WORKFLOW_REDESIGN, {
          score: score({
            finalScore: 4.1,
            recency: 1,
            workflowRedesignDepth: 5,
            deploymentFdeRelevance: 3,
            businessOutcomeClarity: 3,
            technicalImplementationUsefulness: 3,
          }),
        }),
        item("old-evergreen", CANDIDATE_CATEGORIES.AGENTIC_IMPLEMENTATION, {
          score: score({
            finalScore: 4.2,
            recency: 1,
            workflowRedesignDepth: 4,
            deploymentFdeRelevance: 4,
            businessOutcomeClarity: 4,
            technicalImplementationUsefulness: 4,
          }),
        }),
      ],
      preferences(),
    );

    assert.deepEqual(
      selected.map((selectedItem) => selectedItem.id),
      ["old-evergreen"],
    );
  });

  it("explains digest selection counts, selected slots, and constrained skips", () => {
    const result = selectDigestItemsWithTrace(
      [
        item("workflow", CANDIDATE_CATEGORIES.WORKFLOW_REDESIGN, {
          sourceId: "source-a",
          score: score({ finalScore: 4.9 }),
        }),
        item("workflow-extra", CANDIDATE_CATEGORIES.WORKFLOW_REDESIGN, {
          sourceId: "source-a",
          score: score({ finalScore: 4.8 }),
        }),
        item("agentic", CANDIDATE_CATEGORIES.AGENTIC_IMPLEMENTATION, {
          sourceId: "source-b",
          contentFetchStatus: CONTENT_FETCH_STATUSES.FAILED,
          score: score({ finalScore: 4.7 }),
        }),
        item("governance", CANDIDATE_CATEGORIES.GOVERNANCE_ROI, {
          sourceId: "source-c",
          contentFetchStatus: CONTENT_FETCH_STATUSES.PAYWALLED,
          score: score({ finalScore: 4.6 }),
        }),
        item("below", CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE, {
          sourceId: "source-d",
          score: score({ finalScore: 3.3 }),
        }),
        item("rejected", CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE, {
          sourceId: "source-e",
          score: score({ rejected: true, finalScore: 0 }),
        }),
      ],
      preferences({ maxItemsPerSource: 1 }),
    );

    assert.deepEqual(
      result.selectedItems.map((selectedItem) => selectedItem.id),
      ["workflow", "agentic", "governance"],
    );
    assert.deepEqual(result.trace.counts.candidatesBySource, {
      "source-a": 2,
      "source-b": 1,
      "source-c": 1,
      "source-d": 1,
      "source-e": 1,
    });
    assert.equal(result.trace.counts.rejected, 1);
    assert.equal(result.trace.counts.belowScoreThreshold, 2);
    assert.equal(result.trace.counts.withFetchedContent, 4);
    assert.equal(result.trace.counts.withFailedOrPaywalledContent, 2);
    assert.deepEqual(
      result.trace.selected.map((selectedItem) => ({
        slot: selectedItem.slot,
        itemId: selectedItem.itemId,
        reason: selectedItem.reason,
      })),
      [
        {
          slot: CANDIDATE_CATEGORIES.WORKFLOW_REDESIGN,
          itemId: "workflow",
          reason: "Highest-ranked eligible workflow_redesign item for this slot.",
        },
        {
          slot: CANDIDATE_CATEGORIES.AGENTIC_IMPLEMENTATION,
          itemId: "agentic",
          reason: "Highest-ranked eligible agentic_implementation item for this slot.",
        },
        {
          slot: CANDIDATE_CATEGORIES.FDE_CUSTOMER_DEPLOYMENT,
          itemId: "governance",
          reason:
            "governance_roi backfilled fde_customer_deployment because no eligible fde_customer_deployment item remained.",
        },
      ],
    );
    assert.deepEqual(
      result.trace.skippedDueConstraints.map((skippedItem) => ({
        itemId: skippedItem.itemId,
        reason: skippedItem.reason,
      })),
      [
        {
          itemId: "workflow-extra",
          reason: "source limit reached for Source A",
        },
      ],
    );
  });
});
