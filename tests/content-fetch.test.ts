// Purpose: Tests content fetch behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CONTENT_FETCH_STATUSES } from "../src/constants/candidates.js";
import { fetchUrlContent } from "../src/framework/content/fetchUrl.js";

const publicHostResolver = async () => [{ address: "93.184.216.34", family: 4 as const }];

describe("framework URL content fetcher", () => {
  it("fetches and extracts HTML content into a generic result", async () => {
    const transport = async (input: string | URL): Promise<Response> => {
      assert.equal(String(input), "https://example.com/report");

      return new Response(
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
      );
    };

    assert.deepEqual(
      await fetchUrlContent({
        url: "https://example.com/report",
        maxChars: 1000,
        fetchPolicy: {
          hostResolver: publicHostResolver,
          transport,
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
  });

  it("returns a structured failed result for unsupported content types", async () => {
    assert.deepEqual(
      await fetchUrlContent({
        url: "https://example.com/report.pdf",
        fetchPolicy: {
          hostResolver: publicHostResolver,
          transport: async () =>
            new Response("%PDF-1.7", {
              status: 200,
              headers: { "content-type": "application/pdf" },
            }),
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
  });

  it("revalidates host DNS during the actual content fetch connection", async () => {
    let resolutionCount = 0;
    const rebindingResolver = async () => {
      resolutionCount += 1;
      return resolutionCount === 1
        ? [{ address: "93.184.216.34", family: 4 as const }]
        : [{ address: "127.0.0.1", family: 4 as const }];
    };

    const result = await fetchUrlContent({
      url: "https://example.com/report",
      fetchPolicy: {
        hostResolver: rebindingResolver,
        retries: 0,
      },
    });

    assert.equal(result.fetchStatus, CONTENT_FETCH_STATUSES.FAILED);
    assert.match(result.error?.message ?? "", /URL host is not safe/);
    assert.equal(resolutionCount, 2);
  });
});
