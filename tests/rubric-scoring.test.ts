import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import {
  calculateWeightedFinalScore,
  scoreItem,
  type Rubric,
} from "../src/framework/scoring/rubric.js";

const TestScoreSchema = z.strictObject({
  relevance: z.number().min(1).max(5),
  depth: z.number().min(1).max(5),
  rejected: z.boolean(),
  reason: z.string().min(1),
});

const rubric: Rubric<z.infer<typeof TestScoreSchema>> = {
  id: "test_rubric",
  description: "Score technical relevance and depth.",
  scale: {
    min: 1,
    max: 5,
  },
  criteria: [
    {
      id: "relevance",
      description: "How relevant the item is.",
    },
    {
      id: "depth",
      description: "How technically deep the item is.",
    },
  ],
  weights: {
    relevance: 0.75,
    depth: 0.25,
  },
  hardRejectionRules: ["Reject generic announcements."],
  outputSchema: TestScoreSchema,
};

describe("generic rubric scoring", () => {
  it("calculates weighted final scores from rubric weights", () => {
    assert.equal(
      calculateWeightedFinalScore(
        {
          relevance: 4,
          depth: 2,
          rejected: false,
        },
        rubric.weights,
      ),
      3.5,
    );
  });

  it("forces rejected items to a zero final score", () => {
    assert.equal(
      calculateWeightedFinalScore(
        {
          relevance: 5,
          depth: 5,
          rejected: true,
        },
        rubric.weights,
      ),
      0,
    );
  });

  it("scores an item with an injected model completion", async () => {
    const score = await scoreItem(
      {
        title: "A deep technical report",
      },
      rubric,
      {
        completeFn: async () =>
          JSON.stringify({
            relevance: 4,
            depth: 5,
            rejected: false,
            reason: "Detailed and relevant.",
          }),
      },
    );

    assert.deepEqual(score, {
      relevance: 4,
      depth: 5,
      rejected: false,
      reason: "Detailed and relevant.",
      finalScore: 4.25,
    });
  });
});
