// Purpose: Tests scoring behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateFinalScore, scoreItem, scoreItems } from "../src/app/daily/scoring.js";
import type { CandidateItem } from "../src/app/daily/types.js";
import type { UserPreferences } from "../src/app/memory/types.js";
import { CONTENT_FETCH_STATUSES } from "../src/app/constants/candidates.js";
import { SOURCE_REGISTRY } from "../src/app/constants/source-registry.js";
import { SOURCES } from "../src/app/constants/sources.js";

function candidate(id = "candidate"): CandidateItem {
  return {
    id,
    sourceId: SOURCES.ARXIV,
    sourceName: "arXiv",
    sourceType: SOURCE_REGISTRY.SOURCE_TYPES.ACADEMIC_FALLBACK,
    title: "Enterprise deployment",
    url: `https://example.com/${id}`,
    summary: "",
    publishedAt: "2026-05-16T10:00:00Z",
    discoveredAt: "2026-05-16T11:00:00Z",
    contentFetchStatus: CONTENT_FETCH_STATUSES.NOT_FETCHED,
    raw: {},
  };
}

const preferences: UserPreferences = {
  interests: ["enterprise AI"],
  avoid: [],
  preferredDifficulty: "advanced",
  enableAcademicFallback: true,
  minFinalScoreForDigest: 3,
  maxItemsPerSource: 2,
  dailyMix: { arxiv: 1 },
};

const validScore = {
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
};

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

  it("parses and validates model JSON scores", async () => {
    assert.deepEqual(
      await scoreItem(candidate(), preferences, {
        completeFn: async () => JSON.stringify(validScore),
      }),
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

  it("parses rejected model scores", async () => {
    const rejectedScore = {
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
    };
    assert.deepEqual(
      await scoreItem(candidate(), preferences, {
        completeFn: async () => JSON.stringify(rejectedScore),
      }),
      { ...rejectedScore, finalScore: 0 },
    );
  });

  it("rejects out-of-range model scores", async () => {
    await assert.rejects(
      scoreItem(candidate(), preferences, {
        completeFn: async () => JSON.stringify({ ...validScore, enterpriseRelevance: 6 }),
      }),
    );
  });

  it("rejects malformed batch scores with extra or duplicate ids", async () => {
    await assert.rejects(
      scoreItems([candidate("first")], preferences, {
        completeFn: async () =>
          JSON.stringify({
            scores: [
              { id: "first", ...validScore },
              { id: "extra", ...validScore },
            ],
          }),
      }),
    );

    await assert.rejects(
      scoreItems([candidate("first"), candidate("second")], preferences, {
        completeFn: async () =>
          JSON.stringify({
            scores: [
              { id: "first", ...validScore },
              { id: "first", ...validScore },
            ],
          }),
      }),
    );
  });
});
