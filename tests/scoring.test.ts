import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateFinalScore, parseItemScore, rankScoredCandidates } from "../src/daily/scoring.js";
import type { ScoredCandidateItem } from "../src/daily/types.js";
import { SOURCES } from "../src/constants.js";

function scoredItem(title: string, finalScore: number): ScoredCandidateItem {
  return {
    id: `test:${title}`,
    source: SOURCES.ARXIV,
    title,
    url: `https://example.com/${title}`,
    summary: "",
    publishedAt: "2026-05-16T10:00:00Z",
    raw: {},
    score: {
      relevance: finalScore,
      technical_depth: finalScore,
      novelty: finalScore,
      practicality: finalScore,
      reason: "reason",
      finalScore,
    },
  };
}

describe("daily item scoring", () => {
  it("calculates the weighted final score", () => {
    assert.equal(
      calculateFinalScore({
        relevance: 10,
        technical_depth: 8,
        practicality: 6,
        novelty: 4,
        reason: "Useful and technical.",
      }),
      7.8,
    );
  });

  it("parses and validates model JSON scores", () => {
    assert.deepEqual(
      parseItemScore(`
        {
          "relevance": 10,
          "technical_depth": 8,
          "novelty": 4,
          "practicality": 6,
          "reason": "Useful and technical."
        }
      `),
      {
        relevance: 10,
        technical_depth: 8,
        novelty: 4,
        practicality: 6,
        reason: "Useful and technical.",
        finalScore: 7.8,
      },
    );
  });

  it("rejects out-of-range model scores", () => {
    assert.throws(
      () =>
        parseItemScore(
          '{"relevance":11,"technical_depth":8,"novelty":4,"practicality":6,"reason":"bad"}',
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
