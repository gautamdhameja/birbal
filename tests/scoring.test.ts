import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateFinalScore, parseItemScore, rankScoredCandidates } from "../src/daily/scoring.js";
import type { CandidateItem, ItemScore, ScoredCandidateItem } from "../src/daily/types.js";
import { CONTENT_FETCH_STATUSES, SOURCE_REGISTRY, SOURCES } from "../src/constants.js";
import type { UserPreferences } from "../src/memory/types.js";

function scoredItem(title: string, finalScore: number): ScoredCandidateItem {
  return {
    id: `test:${title}`,
    sourceId: SOURCES.ARXIV,
    sourceName: "arXiv",
    sourceType: SOURCE_REGISTRY.SOURCE_TYPES.ACADEMIC_FALLBACK,
    title,
    url: `https://example.com/${title}`,
    summary: "",
    publishedAt: "2026-05-16T10:00:00Z",
    discoveredAt: "2026-05-16T11:00:00Z",
    contentFetchStatus: CONTENT_FETCH_STATUSES.NOT_FETCHED,
    raw: {},
    score: {
      enterpriseRelevance: finalScore,
      workflowRedesignDepth: finalScore,
      realUseCaseSpecificity: finalScore,
      deploymentFdeRelevance: finalScore,
      businessOutcomeClarity: finalScore,
      technicalImplementationUsefulness: finalScore,
      recency: finalScore,
      nonGenericInsight: finalScore,
      rejected: false,
      reason: "reason",
      finalScore,
    },
  };
}

function candidate(overrides: Partial<CandidateItem> = {}): CandidateItem {
  return {
    id: "test:https://example.com/item",
    sourceId: SOURCES.ARXIV,
    sourceName: "arXiv",
    sourceType: SOURCE_REGISTRY.SOURCE_TYPES.ACADEMIC_FALLBACK,
    title: "Example Item",
    url: "https://example.com/item",
    summary: "Practical agent evaluation work.",
    publishedAt: "2026-05-16T10:00:00Z",
    discoveredAt: "2026-05-16T11:00:00Z",
    contentFetchStatus: CONTENT_FETCH_STATUSES.NOT_FETCHED,
    raw: {},
    ...overrides,
  };
}

function preferences(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    interests: ["LLM agents"],
    avoid: ["press release"],
    preferredDifficulty: "advanced",
    enableAcademicFallback: false,
    dailyMix: {
      arxiv: 0.6,
      hackernews: 0.4,
    },
    ...overrides,
  };
}

function score(overrides: Partial<ItemScore> = {}): ItemScore {
  return {
    enterpriseRelevance: 5,
    workflowRedesignDepth: 4,
    realUseCaseSpecificity: 4,
    deploymentFdeRelevance: 3,
    businessOutcomeClarity: 4,
    technicalImplementationUsefulness: 5,
    recency: 3,
    nonGenericInsight: 4,
    rejected: false,
    reason: "Strong enterprise deployment match.",
    finalScore: 4.1,
    ...overrides,
  };
}

describe("daily item scoring", () => {
  it("calculates the weighted final score", () => {
    assert.equal(
      calculateFinalScore({
        enterpriseRelevance: 5,
        workflowRedesignDepth: 4,
        realUseCaseSpecificity: 4,
        deploymentFdeRelevance: 3,
        businessOutcomeClarity: 4,
        technicalImplementationUsefulness: 5,
        recency: 3,
        nonGenericInsight: 4,
        rejected: false,
        reason: "Useful deployment signal.",
      }),
      4.1,
    );
  });

  it("parses and validates model JSON scores", () => {
    assert.deepEqual(
      parseItemScore(`
        {
          "enterpriseRelevance": 5,
          "workflowRedesignDepth": 4,
          "realUseCaseSpecificity": 4,
          "deploymentFdeRelevance": 3,
          "businessOutcomeClarity": 4,
          "technicalImplementationUsefulness": 5,
          "recency": 3,
          "nonGenericInsight": 4,
          "rejected": false,
          "reason": "Useful deployment signal."
        }
      `),
      {
        enterpriseRelevance: 5,
        workflowRedesignDepth: 4,
        realUseCaseSpecificity: 4,
        deploymentFdeRelevance: 3,
        businessOutcomeClarity: 4,
        technicalImplementationUsefulness: 5,
        recency: 3,
        nonGenericInsight: 4,
        rejected: false,
        reason: "Useful deployment signal.",
        finalScore: 4.1,
      },
    );
  });

  it("parses rejected model scores", () => {
    assert.deepEqual(
      parseItemScore(`
        {
          "enterpriseRelevance": 1,
          "workflowRedesignDepth": 1,
          "realUseCaseSpecificity": 1,
          "deploymentFdeRelevance": 1,
          "businessOutcomeClarity": 1,
          "technicalImplementationUsefulness": 1,
          "recency": 1,
          "nonGenericInsight": 1,
          "rejected": true,
          "rejectionReason": "Generic AI news with no enterprise deployment angle.",
          "reason": "Rejected as generic AI news."
        }
      `),
      {
        enterpriseRelevance: 1,
        workflowRedesignDepth: 1,
        realUseCaseSpecificity: 1,
        deploymentFdeRelevance: 1,
        businessOutcomeClarity: 1,
        technicalImplementationUsefulness: 1,
        recency: 1,
        nonGenericInsight: 1,
        rejected: true,
        rejectionReason: "Generic AI news with no enterprise deployment angle.",
        reason: "Rejected as generic AI news.",
        finalScore: 0,
      },
    );
  });

  it("rejects out-of-range model scores", () => {
    assert.throws(
      () =>
        parseItemScore(
          '{"enterpriseRelevance":6,"workflowRedesignDepth":4,"realUseCaseSpecificity":4,"deploymentFdeRelevance":3,"businessOutcomeClarity":4,"technicalImplementationUsefulness":5,"recency":3,"nonGenericInsight":4,"rejected":false,"reason":"bad"}',
        ),
      /invalid item score/i,
    );
  });

  it("ranks scored candidates by final score", () => {
    assert.deepEqual(
      rankScoredCandidates(
        [scoredItem("middle", 6), scoredItem("high", 9), scoredItem("low", 2)],
        2,
      ).map((item) => item.title),
      ["high", "middle"],
    );
  });
});
