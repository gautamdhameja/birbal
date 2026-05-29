// Purpose: Tests pipeline concurrency behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chunkItems, mapBatches, mapLimit } from "../src/framework/pipeline/concurrency.js";

describe("pipeline concurrency helpers", () => {
  it("maps items with bounded concurrency while preserving order", async () => {
    let active = 0;
    let maxActive = 0;

    const results = await mapLimit([3, 2, 1, 0], 2, async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, value));
      active -= 1;
      return value * 2;
    });

    assert.deepEqual(results, [6, 4, 2, 0]);
    assert.equal(maxActive, 2);
  });

  it("chunks and maps batches while preserving flattened order", async () => {
    assert.deepEqual(chunkItems([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);

    const results = await mapBatches([1, 2, 3, 4, 5], 2, 2, async (batch) =>
      batch.map((value) => value * 10),
    );

    assert.deepEqual(results, [10, 20, 30, 40, 50]);
  });

  it("rejects invalid concurrency settings", async () => {
    await assert.rejects(() => mapLimit([1], 0, async (value) => value), /positive integer/);
    assert.throws(() => chunkItems([1], 0), /positive integer/);
  });
});
