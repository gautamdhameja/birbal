import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CANDIDATE_CATEGORIES, CONTENT_FETCH_STATUSES, SOURCE_REGISTRY } from "../src/constants.js";
import { selectDigestItems } from "../src/daily/digestSelection.js";
import type { CandidateCategory, ItemScore, ScoredCandidateItem } from "../src/daily/types.js";
import type { UserPreferences } from "../src/memory/types.js";

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
});
