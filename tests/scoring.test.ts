import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyAvoidPenalty,
  calculateFinalScore,
  parseItemScore,
  rankScoredCandidates,
} from "../src/daily/scoring.js";
import type { CandidateItem, ItemScore, ScoredCandidateItem } from "../src/daily/types.js";
import { SOURCES } from "../src/constants.js";
import type { UserPreferences } from "../src/memory/types.js";

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

function candidate(overrides: Partial<CandidateItem> = {}): CandidateItem {
  return {
    id: "test:https://example.com/item",
    source: SOURCES.ARXIV,
    title: "Example Item",
    url: "https://example.com/item",
    summary: "Practical agent evaluation work.",
    publishedAt: "2026-05-16T10:00:00Z",
    raw: {},
    ...overrides,
  };
}

function preferences(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    interests: ["LLM agents"],
    avoid: ["press release"],
    preferredDifficulty: "advanced",
    dailyMix: {
      arxiv: 0.6,
      hackernews: 0.4,
    },
    ...overrides,
  };
}

function score(overrides: Partial<ItemScore> = {}): ItemScore {
  return {
    relevance: 9,
    technical_depth: 8,
    novelty: 7,
    practicality: 8,
    reason: "Strong match.",
    finalScore: 8.15,
    ...overrides,
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

  it("penalizes items matching avoid terms", () => {
    const penalized = applyAvoidPenalty(
      candidate({ title: "Vendor press release about agents" }),
      preferences(),
      score(),
    );

    assert.equal(penalized.relevance, 3);
    assert.equal(Number(penalized.finalScore.toFixed(2)), 5.85);
    assert.match(penalized.reason, /press release/);
  });

  it("does not penalize items without avoid terms", () => {
    assert.deepEqual(applyAvoidPenalty(candidate(), preferences(), score()), score());
  });

  it("does not penalize partial word avoid matches", () => {
    assert.deepEqual(
      applyAvoidPenalty(
        candidate({ title: "Cryptography for private inference" }),
        preferences({ avoid: ["crypto"] }),
        score(),
      ),
      score(),
    );
  });
});
