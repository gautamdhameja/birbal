import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fetchWithTimeout, HttpTimeoutError, readResponseText } from "../src/http/client.js";

describe("HTTP client helpers", () => {
  it("rejects responses larger than the configured read cap", async () => {
    await assert.rejects(
      readResponseText(new Response("too large"), 3),
      /exceeded maximum allowed size/,
    );
  });

  it("times out stalled fetch calls", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      })) as typeof fetch;

    try {
      await assert.rejects(
        fetchWithTimeout("https://example.com", {}, { timeoutMs: 1 }),
        HttpTimeoutError,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
