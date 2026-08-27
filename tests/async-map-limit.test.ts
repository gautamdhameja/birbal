import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mapLimit } from "../src/framework/async/mapLimit.js";

describe("mapLimit", () => {
  it("preserves order while bounding concurrency", async () => {
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

  it("rejects invalid concurrency", async () => {
    await assert.rejects(() => mapLimit([1], 0, async (value) => value), /positive integer/);
  });
});
