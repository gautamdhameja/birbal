import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateFinalScore,
  parseItemScore,
  parseItemScores,
  rankScoredCandidates,
} from "../src/daily/scoring.js";
import type { ScoredCandidateItem } from "../src/daily/types.js";
import { CONTENT_FETCH_STATUSES, SOURCE_REGISTRY, SOURCES } from "../src/constants.js";

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

  it("rejects malformed batch scores with extra or duplicate ids", () => {
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

    assert.throws(
      () =>
        parseItemScores(
          JSON.stringify({
            scores: [
              { id: "first", ...validScore },
              { id: "extra", ...validScore },
            ],
          }),
          ["first"],
        ),
      /unexpected score for candidate extra/i,
    );

    assert.throws(
      () =>
        parseItemScores(
          JSON.stringify({
            scores: [
              { id: "first", ...validScore },
              { id: "first", ...validScore },
            ],
          }),
          ["first", "second"],
        ),
      /duplicate score for candidate first/i,
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
