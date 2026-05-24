import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CONTENT_FETCH_STATUSES } from "../src/constants/candidates.js";
import { fetchUrlContent } from "../src/framework/content/fetchUrl.js";

const publicHostResolver = async () => [{ address: "93.184.216.34", family: 4 as const }];

describe("framework URL content fetcher", () => {
  it("fetches and extracts HTML content into a generic result", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = ((input) => {
      assert.equal(String(input), "https://example.com/report");

      return Promise.resolve(
        new Response(
          `
            <html>
              <head>
                <title>Enterprise AI Report</title>
                <link rel="canonical" href="/canonical-report" />
              </head>
              <body>
                <main><p>Workflow redesign details.</p></main>
              </body>
            </html>
          `,
          { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
        ),
      );
    }) as typeof fetch;

    try {
      assert.deepEqual(
        await fetchUrlContent({
          url: "https://example.com/report",
          maxChars: 1000,
          fetchPolicy: {
            hostResolver: publicHostResolver,
          },
        }),
        {
          url: "https://example.com/report",
          canonicalUrl: "https://example.com/canonical-report",
          contentType: "text/html",
          title: "Enterprise AI Report",
          plainText: "Workflow redesign details.",
          contentLength: 26,
          fetchStatus: CONTENT_FETCH_STATUSES.FETCHED,
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns a structured failed result for unsupported content types", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (() =>
      Promise.resolve(
        new Response("%PDF-1.7", {
          status: 200,
          headers: { "content-type": "application/pdf" },
        }),
      )) as typeof fetch;

    try {
      assert.deepEqual(
        await fetchUrlContent({
          url: "https://example.com/report.pdf",
          fetchPolicy: {
            hostResolver: publicHostResolver,
          },
        }),
        {
          url: "https://example.com/report.pdf",
          contentType: "application/pdf",
          title: "",
          plainText: "",
          contentLength: 0,
          fetchStatus: CONTENT_FETCH_STATUSES.FAILED,
          error: {
            message: "Unsupported content type: application/pdf.",
            code: "unsupported_content_type",
          },
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
