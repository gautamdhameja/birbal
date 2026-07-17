// Purpose: Tests json behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAgentResponse } from "../src/app/agent/parse-response.js";

describe("parseAgentResponse", () => {
  it("parses a strict protocol object", () => {
    assert.deepEqual(parseAgentResponse('{"type":"final","answer":"hello"}'), {
      type: "final",
      answer: "hello",
    });
  });

  it("allows surrounding whitespace", () => {
    assert.deepEqual(parseAgentResponse('  {"type":"clarify","question":"Continue?"}\n'), {
      type: "clarify",
      question: "Continue?",
    });
  });

  it("rejects surrounding prose", () => {
    assert.throws(
      () => parseAgentResponse('before {"type":"clarify","question":"Continue?"} after'),
      /must be valid JSON/,
    );
  });

  it("rejects embedded JSON after earlier invalid braces", () => {
    assert.throws(
      () => parseAgentResponse('noise {not json} {"type":"final","answer":"ok"}'),
      /must be valid JSON/,
    );
  });

  it("preserves braces inside JSON strings", () => {
    assert.deepEqual(parseAgentResponse('{"type":"final","answer":"hello {world}"}'), {
      type: "final",
      answer: "hello {world}",
    });
  });

  it("rejects unescaped newlines inside JSON strings", () => {
    assert.throws(
      () => parseAgentResponse('{"type":"final","answer":"hello\nworld"}'),
      /must be valid JSON/,
    );
  });
});
