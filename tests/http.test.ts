import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildHttpStatusError,
  fetchWithRetry,
  fetchWithTimeout,
  HttpAbortError,
  HttpTimeoutError,
  readResponseText,
  RetryableFetchStatusError,
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
      await assert.rejects(request, HttpAbortError);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("retries only retryable HTTP statuses", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;

    globalThis.fetch = (() => {
      calls += 1;
      return Promise.resolve(
        new Response(calls === 1 ? "retry" : "ok", { status: calls === 1 ? 500 : 200 }),
      );
    }) as typeof fetch;

    try {
      const response = await fetchWithRetry(
        "https://example.com",
        {},
        {
          retries: 1,
          minTimeoutMs: 1,
          maxTimeoutMs: 1,
          jitter: false,
        },
      );

      assert.equal(response.status, 200);
      assert.equal(calls, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not retry normal 4xx HTTP statuses", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;

    globalThis.fetch = (() => {
      calls += 1;
      return Promise.resolve(new Response("missing", { status: 404 }));
    }) as typeof fetch;

    try {
      const response = await fetchWithRetry(
        "https://example.com",
        {},
        {
          retries: 3,
          minTimeoutMs: 1,
          maxTimeoutMs: 1,
          jitter: false,
        },
      );

      assert.equal(response.status, 404);
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns structured fetch retry errors", () => {
    const error = new RetryableFetchStatusError(503, "Service Unavailable", 2);

    assert.deepEqual(error.toJSON(), {
      error: "Fetch attempt 2 returned retryable HTTP 503 Service Unavailable.",
      kind: "retryable_status",
      status: 503,
      statusText: "Service Unavailable",
      attemptNumber: 2,
    });
  });
});
