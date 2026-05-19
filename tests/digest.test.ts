import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { DIGEST, SOURCES } from "../src/constants.js";
import { formatDigestDate, saveDigest, writeDigest } from "../src/daily/digest.js";
import type { ScoredCandidateItem } from "../src/daily/types.js";

function scoredItem(overrides: Partial<ScoredCandidateItem> = {}): ScoredCandidateItem {
  return {
    id: "test:https://example.com/item",
    source: SOURCES.ARXIV,
    title: "Example Item",
    url: "https://example.com/item",
    summary: "A practical summary about agent evaluation.",
    publishedAt: "2026-05-16T10:00:00Z",
    raw: {},
    score: {
      relevance: 8,
      technical_depth: 7,
      novelty: 6,
      practicality: 9,
      reason: "Useful technical detail.",
      finalScore: 7.75,
    },
    ...overrides,
  };
}

describe("Markdown digest writer", () => {
  it("formats digest dates", () => {
    assert.equal(formatDigestDate("2026-05-19"), "2026-05-19");
    assert.throws(() => formatDigestDate("2026/05/19"), /YYYY-MM-DD/);
  });

  it("renders scored items as Markdown", () => {
    const markdown = writeDigest([scoredItem()], "2026-05-19");

    assert.match(markdown, /^# Daily Reading Digest - 2026-05-19/);
    assert.match(markdown, /## 1\. Example Item/);
    assert.match(markdown, /- Source: arxiv/);
    assert.match(markdown, /- URL: https:\/\/example\.com\/item/);
    assert.match(markdown, /- Final score: 7\.75/);
    assert.match(markdown, /- Score reason: Useful technical detail\./);
    assert.match(markdown, /- Short summary: A practical summary about agent evaluation\./);
  });

  it("truncates long summaries", () => {
    const markdown = writeDigest(
      [scoredItem({ summary: "x".repeat(DIGEST.SUMMARY_MAX_LENGTH + 1) })],
      "2026-05-19",
    );

    assert.match(markdown, new RegExp(`x{${DIGEST.SUMMARY_MAX_LENGTH}}\\.\\.\\.`));
  });

  it("uses a summary fallback when no summary is available", () => {
    const markdown = writeDigest([scoredItem({ summary: "" })], "2026-05-19");

    assert.match(markdown, /- Short summary: No summary available\./);
  });

  it("escapes markdown text and rejects invalid digest URLs", () => {
    const markdown = writeDigest(
      [
        scoredItem({
          title: "[Injected](https://example.com)",
          url: "javascript:alert(1)",
          summary: "> fake quote",
        }),
      ],
      "2026-05-19",
    );

    assert.match(markdown, /## 1\. \\\[Injected\\\]\\\(https:\/\/example\.com\\\)/);
    assert.match(markdown, /- URL: Invalid URL/);
    assert.match(markdown, /- Short summary: \\> fake quote/);
  });

  it("saves digests under the digest directory", () => {
    const rootDirectory = mkdtempSync(join(tmpdir(), "birbal-digest-"));
    const digestPath = saveDigest("# Test\n", "2026-05-19", rootDirectory);

    assert.equal(digestPath, join(rootDirectory, DIGEST.DIRECTORY, "2026-05-19.md"));
    assert.equal(readFileSync(digestPath, "utf8"), "# Test\n");
  });
});
