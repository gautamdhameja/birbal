import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runAgent } from "../src/agent/run.js";

describe("runAgent", () => {
  it("rejects invalid maxSteps before calling the model", async () => {
    await assert.rejects(runAgent("hello", { maxSteps: 0 }), /Too small: expected number to be >0/);
  });
});
