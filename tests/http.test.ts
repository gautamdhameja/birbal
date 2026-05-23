import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildHttpStatusError,
  fetchWithTimeout,
  HttpTimeoutError,
  readResponseText,
} from "../src/http/client.js";

describe("HTTP client helpers", () => {
  it("rejects responses larger than the configured read cap", async () => {
    await assert.rejects(
      readResponseText(new Response("too large"), 3),
      /exceeded maximum allowed size/,
    );
  });

  it("summarizes blocked-page HTTP error bodies", async () => {
    const error = await buildHttpStatusError(
      "URL text request failed with HTTP",
      new Response("<html><title>Just a moment...</title>Cloudflare challenge-platform</html>", {
        status: 403,
      }),
    );

    assert.match(error.message, /blocked by bot protection/);
    assert.doesNotMatch(error.message, /challenge-platform/);
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

  it("aborts fetch calls when the caller signal is aborted", async () => {
    const originalFetch = globalThis.fetch;
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;

    globalThis.fetch = ((_input, init) => {
      receivedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    }) as typeof fetch;

    try {
      const request = fetchWithTimeout(
        "https://example.com",
        {
          signal: controller.signal,
        },
        { timeoutMs: 10_000 },
      );

      controller.abort();

      assert.notEqual(receivedSignal, controller.signal);
      assert.equal(receivedSignal?.aborted, true);
      await assert.rejects(request, HttpTimeoutError);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
