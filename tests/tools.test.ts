import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatLocalIsoString } from "../src/tools/get-time.js";
import { listTools, renderToolsForPrompt, runTool } from "../src/tools/registry.js";

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
}

function assertString(value: unknown): asserts value is string {
  assert.equal(typeof value, "string");
}

describe("tool registry", () => {
  it("formats local ISO timestamps with an explicit timezone offset", () => {
    assert.match(
      formatLocalIsoString(new Date()),
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/,
    );
  });

  it("lists the get_time tool", () => {
    assert.deepEqual(
      listTools().map((tool) => tool.name),
      ["get_time"],
    );
  });

  it("renders tool metadata for the system prompt", () => {
    const renderedTools = renderToolsForPrompt();

    assert.match(renderedTools, /name: get_time/);
    assert.match(renderedTools, /description: Get the current local time as an ISO string\./);
    assert.match(renderedTools, /args: \{"type":"object","properties":\{\},"additionalProperties":false\}/);
  });

  it("runs get_time", async () => {
    const result = await runTool("get_time", {});

    assertRecord(result);
    assert.ok("now" in result);
    const now = result.now;
    assertString(now);
    assert.match(now, /^\d{4}-\d{2}-\d{2}T/);
    assert.doesNotMatch(now, /Z$/);
    assert.doesNotThrow(() => new Date(now).toISOString());
  });

  it("returns a structured error for unknown tools", async () => {
    assert.deepEqual(await runTool("missing", {}), {
      error: "Unknown tool: missing",
    });
  });

  it("returns a structured error for invalid args", async () => {
    const result = await runTool("get_time", { extra: true });

    assertRecord(result);
    assert.ok("error" in result);
    const error = result.error;
    assertString(error);
    assert.match(error, /Invalid args for tool "get_time"/);
  });
});
