import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAgentResponse } from "../src/utils/json.js";

describe("parseAgentResponse", () => {
  it("parses a strict protocol object", () => {
    assert.deepEqual(parseAgentResponse('{"type":"final","answer":"hello"}'), {
      type: "final",
      answer: "hello",
    });
  });

  it("extracts a valid object from surrounding text", () => {
    assert.deepEqual(parseAgentResponse('before {"type":"clarify","question":"Continue?"} after'), {
      type: "clarify",
      question: "Continue?",
    });
  });

  it("skips earlier balanced braces that are not valid JSON", () => {
    assert.deepEqual(parseAgentResponse('noise {not json} {"type":"final","answer":"ok"}'), {
      type: "final",
      answer: "ok",
    });
  });

  it("finds a valid object inside an invalid outer brace block", () => {
    assert.deepEqual(parseAgentResponse('noise {bad {"type":"final","answer":"ok"}}'), {
      type: "final",
      answer: "ok",
    });
  });

  it("preserves braces inside JSON strings", () => {
    assert.deepEqual(parseAgentResponse('{"type":"final","answer":"hello {world}"}'), {
      type: "final",
      answer: "hello {world}",
    });
  });
});
