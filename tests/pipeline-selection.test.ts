// Purpose: Tests generic pipeline selection helpers.
// Scope: Covers acceptance-gate and backfill behavior independent of any app pipeline.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  selectWithAcceptanceBackfill,
  selectWithIncrementalAcceptance,
} from "../src/framework/pipeline/selection.js";

describe("pipeline selection helpers", () => {
  it("over-selects candidates, applies an acceptance gate, then backfills final selection", async () => {
    const result = await selectWithAcceptanceBackfill({
      candidates: [5, 4, 3, 2, 1],
      candidatePoolSize: 4,
      targetCount: 2,
      selectCandidates: (candidates, limit) => [...candidates].slice(0, limit),
      acceptCandidates: (candidates) => candidates.filter((candidate) => candidate % 2 === 1),
      selectAccepted: (candidates, limit) => [...candidates].slice(0, limit),
    });

    assert.deepEqual(result.candidatePool, [5, 4, 3, 2]);
    assert.deepEqual(result.acceptedPool, [5, 3]);
    assert.deepEqual(result.selected, [5, 3]);
  });

  it("keeps the candidate pool at least as large as the target count", async () => {
    const result = await selectWithAcceptanceBackfill({
      candidates: ["a", "b", "c"],
      candidatePoolSize: 1,
      targetCount: 2,
      selectCandidates: (candidates, limit) => [...candidates].slice(0, limit),
      acceptCandidates: (candidates) => [...candidates],
      selectAccepted: (candidates, limit) => [...candidates].slice(0, limit),
    });

    assert.deepEqual(result.candidatePool, ["a", "b"]);
    assert.deepEqual(result.selected, ["a", "b"]);
  });

  it("rejects invalid target counts", async () => {
    await assert.rejects(
      selectWithAcceptanceBackfill({
        candidates: [],
        candidatePoolSize: 1,
        targetCount: 0,
        selectCandidates: () => [],
        acceptCandidates: () => [],
        selectAccepted: () => [],
      }),
      /targetCount must be a positive integer/,
    );
  });

  it("accepts candidates incrementally and stops when the target is filled", async () => {
    const batches: number[][] = [];
    const result = await selectWithIncrementalAcceptance({
      candidates: [1, 2, 3, 4, 5, 6],
      batchSize: 2,
      candidatePoolSize: 6,
      targetCount: 2,
      selectCandidates: (candidates, limit) => [...candidates].slice(0, limit),
      acceptCandidates: (candidates) => {
        batches.push([...candidates]);
        return candidates.filter((candidate) => candidate % 2 === 0);
      },
      selectAccepted: (candidates, limit) => [...candidates].slice(0, limit),
    });

    assert.deepEqual(batches, [
      [1, 2],
      [3, 4],
    ]);
    assert.equal(result.processedCandidateCount, 4);
    assert.deepEqual(result.acceptedPool, [2, 4]);
    assert.deepEqual(result.selected, [2, 4]);
  });
});
