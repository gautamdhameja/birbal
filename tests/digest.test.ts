import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  CANDIDATE_CATEGORIES,
  CONTENT_FETCH_STATUSES,
  DIGEST,
  SOURCE_REGISTRY,
  SOURCES,
} from "../src/constants.js";
import { formatDigestDate, saveDigest, writeDigest } from "../src/daily/digest.js";
import type { ScoredCandidateItem } from "../src/daily/types.js";

function scoredItem(overrides: Partial<ScoredCandidateItem> = {}): ScoredCandidateItem {
  return {
    id: "test:https://example.com/item",
    sourceId: SOURCES.ARXIV,
    sourceName: "arXiv",
    sourceType: SOURCE_REGISTRY.SOURCE_TYPES.ACADEMIC_FALLBACK,
    title: "Example Item",
    url: "https://example.com/item",
    summary: "A practical summary about agent evaluation.",
    contentText:
      "A bank redesigned an onboarding workflow with human in the loop review. The system uses RAG and API integration. The rollout tracked productivity and cycle time.",
    publishedAt: "2026-05-16T10:00:00Z",
    discoveredAt: "2026-05-16T11:00:00Z",
    contentFetchStatus: CONTENT_FETCH_STATUSES.NOT_FETCHED,
    category: CANDIDATE_CATEGORIES.WORKFLOW_REDESIGN,
    raw: {},
    score: {
      enterpriseRelevance: 4,
      workflowRedesignDepth: 4,
      realUseCaseSpecificity: 4,
      deploymentFdeRelevance: 4,
      businessOutcomeClarity: 4,
      technicalImplementationUsefulness: 4,
      recency: 4,
      nonGenericInsight: 4,
      rejected: false,
      reason: "Useful technical detail.",
      finalScore: 4,
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
    assert.match(markdown, /- Source: arXiv/);
    assert.match(markdown, /- Link: https:\/\/example\.com\/item/);
    assert.match(markdown, /- Publish date: 2026-05-16/);
    assert.match(markdown, /- Category: workflow redesign/);
    assert.match(markdown, /- Score: 4\.00/);
    assert.match(markdown, /- 5-line summary:/);
    assert.match(
      markdown,
      /  - A bank redesigned an onboarding workflow with human in the loop review\./,
    );
    assert.match(markdown, /  - The system uses RAG and API integration\./);
    assert.match(markdown, /  - The rollout tracked productivity and cycle time\./);
    assert.match(markdown, /  - Not specified in the source\./);
    assert.match(
      markdown,
      /- Enterprise workflow affected: Core workflow and operating model design\./,
    );
    assert.match(markdown, /- Why it matters: Useful technical detail\./);
    assert.match(
      markdown,
      /- Human role change: Humans move toward review, exception handling, and quality control\./,
    );
    assert.match(
      markdown,
      /- System integration needed: Application, data, and tool integrations are likely required\./,
    );
    assert.match(
      markdown,
      /- ROI or business metric: Productivity, efficiency, or cycle-time improvement is the likely metric\./,
    );
    assert.match(
      markdown,
      /- Relevance to Gautam's positioning: Useful for positioning around workflow redesign, operating model change, and adoption\./,
    );
  });

  it("truncates long summaries", () => {
    const markdown = writeDigest(
      [scoredItem({ contentText: undefined, summary: "x".repeat(DIGEST.SUMMARY_MAX_LENGTH + 1) })],
      "2026-05-19",
    );

    assert.match(markdown, new RegExp(`x{${DIGEST.SUMMARY_MAX_LENGTH}}\\.\\.\\.`));
  });

  it("uses a summary fallback when no summary is available", () => {
    const markdown = writeDigest(
      [scoredItem({ contentText: undefined, summary: "" })],
      "2026-05-19",
    );

    assert.match(markdown, /  - No summary available\./);
  });

  it("escapes markdown text and rejects invalid digest URLs", () => {
    const markdown = writeDigest(
      [
        scoredItem({
          title: "[Injected](https://example.com)",
          url: "javascript:alert(1)",
          contentText: undefined,
          summary: "> fake quote",
        }),
      ],
      "2026-05-19",
    );

    assert.match(markdown, /## 1\. \\\[Injected\\\]\\\(https:\/\/example\.com\\\)/);
    assert.match(markdown, /- Link: Invalid URL/);
    assert.match(markdown, /  - \\> fake quote/);
  });

  it("saves digests under the digest directory", () => {
    const rootDirectory = mkdtempSync(join(tmpdir(), "birbal-digest-"));
    const digestPath = saveDigest("# Test\n", "2026-05-19", rootDirectory);

    assert.equal(digestPath, join(rootDirectory, DIGEST.DIRECTORY, "2026-05-19.md"));
    assert.equal(readFileSync(digestPath, "utf8"), "# Test\n");
  });
});
