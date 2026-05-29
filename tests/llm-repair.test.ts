// Purpose: Tests llm repair behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import { completeStructuredWithRepair, ModelParseError } from "../src/framework/llm/repair.js";
import type { ChatMessage, CompleteOptions } from "../src/llama/schema.js";

const ExampleSchema = z.strictObject({
  answer: z.string().min(1),
});

describe("shared LLM output repair", () => {
  it("returns valid structured model output without repair", async () => {
    const calls: Array<{ messages: ChatMessage[]; options?: CompleteOptions }> = [];
    const result = await completeStructuredWithRepair({
      messages: [{ role: "user", content: "Return JSON." }],
      schema: ExampleSchema,
      completeFn: async (messages, options) => {
        calls.push({ messages, options });
        return '{"answer":"ok"}';
      },
    });

    assert.deepEqual(result, {
      ok: true,
      value: {
        answer: "ok",
      },
      raw: '{"answer":"ok"}',
      repaired: false,
    });
    assert.equal(calls.length, 1);
  });

  it("repairs invalid structured model output once with schema context", async () => {
    const calls: Array<{ messages: ChatMessage[]; options?: CompleteOptions }> = [];
    const result = await completeStructuredWithRepair({
      messages: [{ role: "user", content: "Return JSON." }],
      schema: ExampleSchema,
      completeOptions: {
        traceLabel: "test.structured",
      },
      completeFn: async (messages, options) => {
        calls.push({ messages, options });
        return calls.length === 1 ? "not json" : '{"answer":"fixed"}';
      },
      schemaDescription: '{"type":"object","required":["answer"]}',
    });

    assert.deepEqual(result, {
      ok: true,
      value: {
        answer: "fixed",
      },
      raw: '{"answer":"fixed"}',
      repaired: true,
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[1]?.options?.traceLabel, "test.structured.repair");
    assert.match(calls[1]?.messages.at(-1)?.content ?? "", /not json/);
    assert.match(calls[1]?.messages.at(-1)?.content ?? "", /"required":\["answer"\]/);
  });

  it("treats embedded JSON in surrounding prose as invalid before repair", async () => {
    let calls = 0;
    const result = await completeStructuredWithRepair({
      messages: [{ role: "user", content: "Return JSON only." }],
      schema: ExampleSchema,
      completeFn: async () => {
        calls += 1;
        return calls === 1 ? 'Here is the JSON: {"answer":"ok"}' : '{"answer":"ok"}';
      },
    });

    assert.equal(calls, 2);
    assert.deepEqual(result, {
      ok: true,
      value: {
        answer: "ok",
      },
      raw: '{"answer":"ok"}',
      repaired: true,
    });
  });

  it("returns structured model_parse_error when repair also fails", async () => {
    const result = await completeStructuredWithRepair({
      messages: [{ role: "user", content: "Return JSON." }],
      schema: ExampleSchema,
      completeFn: async () => '{"answer":""}',
      schemaDescription: '{"type":"object"}',
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.type, "model_parse_error");
      assert.equal(result.error.repairAttempted, true);
      assert.equal(result.error.invalidOutput, '{"answer":""}');
      assert.equal(result.error.schemaDescription, '{"type":"object"}');
      assert.match(result.error.repairValidationError ?? "", /Too small/);
      assert.deepEqual(new ModelParseError(result.error).toJSON(), result.error);
    }
  });
});
