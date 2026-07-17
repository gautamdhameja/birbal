// Purpose: Tests classification behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CANDIDATE_CATEGORIES, CONTENT_FETCH_STATUSES } from "../src/app/constants/candidates.js";
import { SOURCE_REGISTRY } from "../src/app/constants/source-registry.js";
import { SOURCES } from "../src/app/constants/sources.js";
import {
  classifyCandidateCategory,
  fallbackCategoryFromScore,
} from "../src/app/daily/classification.js";
import type { CandidateItem, ItemScore } from "../src/app/daily/types.js";

function candidate(overrides: Partial<CandidateItem> = {}): CandidateItem {
  return {
    id: "test:https://example.com/item",
    sourceId: SOURCES.HACKER_NEWS,
    sourceName: "Hacker News",
    sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
    title: "Customer deployment case study",
    url: "https://example.com/item",
    summary: "A customer story about an enterprise deployment.",
    publishedAt: "2026-05-16T10:00:00Z",
    discoveredAt: "2026-05-16T11:00:00Z",
    contentFetchStatus: CONTENT_FETCH_STATUSES.FETCHED,
    raw: {},
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
    reason: "Useful.",
    finalScore: 4,
    ...overrides,
  };
}

describe("digest category classification", () => {
  it("uses deterministic keyword hints when one category is clear", async () => {
    assert.equal(
      await classifyCandidateCategory(
        candidate({
          title: "Operating model workflow redesign",
          summary: "A workflow redesign with a human in the loop operating model.",
        }),
        score(),
      ),
      CANDIDATE_CATEGORIES.WORKFLOW_REDESIGN,
    );
  });

  it("classifies rejected scores without calling the model", async () => {
    assert.equal(
      await classifyCandidateCategory(
        candidate(),
        score({
          rejected: true,
          rejectionReason: "Generic AI news.",
          finalScore: 0,
        }),
      ),
      CANDIDATE_CATEGORIES.REJECTED,
    );
  });

  it("falls back to the strongest score dimension when model classification is unavailable", () => {
    assert.equal(
      fallbackCategoryFromScore(
        score({
          enterpriseRelevance: 3,
          workflowRedesignDepth: 2,
          realUseCaseSpecificity: 3,
          deploymentFdeRelevance: 5,
          businessOutcomeClarity: 1,
          technicalImplementationUsefulness: 2,
          nonGenericInsight: 2,
        }),
      ),
      CANDIDATE_CATEGORIES.FDE_CUSTOMER_DEPLOYMENT,
    );
  });

  it("falls back to rejected for rejected scores", () => {
    assert.equal(
      fallbackCategoryFromScore(
        score({
          rejected: true,
          rejectionReason: "No enterprise angle.",
          finalScore: 0,
        }),
      ),
      CANDIDATE_CATEGORIES.REJECTED,
    );
  });

  it("parses LLM category classifications", async () => {
    assert.equal(
      await classifyCandidateCategory(
        candidate({
          sourceName: "Journal",
          title: "Technical report",
          summary: "Detailed analysis",
        }),
        score(),
        { completeFn: async () => '{"category":"agentic_implementation"}' },
      ),
      CANDIDATE_CATEGORIES.AGENTIC_IMPLEMENTATION,
    );
  });

  it("falls back after invalid model category classifications", async () => {
    assert.equal(
      await classifyCandidateCategory(
        candidate({
          sourceName: "Journal",
          title: "Technical report",
          summary: "Detailed analysis",
        }),
        score(),
        { completeFn: async () => '{"category":"news"}' },
      ),
      CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE,
    );
  });

  it("does not accept rejected model classifications for accepted scores", async () => {
    assert.equal(
      await classifyCandidateCategory(
        candidate({
          sourceName: "Journal",
          title: "Technical report",
          summary: "Detailed analysis",
        }),
        score(),
        { completeFn: async () => '{"category":"rejected"}' },
      ),
      CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE,
    );
  });
});
