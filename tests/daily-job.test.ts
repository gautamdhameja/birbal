import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  CANDIDATE_CATEGORIES,
  CONTENT_FETCH_STATUSES,
  SOURCE_REGISTRY,
  SOURCES,
} from "../src/constants.js";
import { getItemByUrl, getScore, initDb, upsertItem, upsertScore } from "../src/db/items.js";
import { getRecentRuns } from "../src/framework/pipeline/runs.js";
import { runDailyReading } from "../src/daily/job.js";
import type { CandidateItem, ItemScore } from "../src/daily/types.js";
import type { SourceRegistry } from "../src/config/sourceRegistry.js";
import type { UserPreferences } from "../src/memory/types.js";

function dbPath(): string {
  return join(mkdtempSync(join(tmpdir(), "birbal-daily-job-")), "agent.db");
}

function candidate(overrides: Partial<CandidateItem> = {}): CandidateItem {
  return {
    id: "arxiv:https://example.com/item",
    sourceId: SOURCES.ARXIV,
    sourceName: "arXiv",
    sourceType: SOURCE_REGISTRY.SOURCE_TYPES.ACADEMIC_FALLBACK,
    title: "Example Item",
    url: "https://example.com/item",
    summary: "summary",
    publishedAt: "2026-05-16T10:00:00Z",
    discoveredAt: "2026-05-16T11:00:00Z",
    contentFetchStatus: CONTENT_FETCH_STATUSES.NOT_FETCHED,
    raw: {},
    ...overrides,
  };
}

function score(overrides: Partial<ItemScore> = {}): ItemScore {
  return {
    enterpriseRelevance: 4,
    workflowRedesignDepth: 4,
    realUseCaseSpecificity: 4,
    deploymentFdeRelevance: 4,
    businessOutcomeClarity: 4,
    technicalImplementationUsefulness: 4,
    recency: 4,
    nonGenericInsight: 4,
    rejected: false,
    reason: "Useful.",
    finalScore: 7,
    ...overrides,
  };
}

function preferences(): UserPreferences {
  return {
    interests: ["LLM agents"],
    avoid: [],
    preferredDifficulty: "advanced",
    enableAcademicFallback: false,
    minFinalScoreForDigest: 3.4,
    maxItemsPerSource: 2,
    dailyMix: {
      arxiv: 1,
      hackernews: 0,
    },
  };
}

function sourceRegistry(): SourceRegistry {
  return {
    sources: [
      {
        id: SOURCES.HACKER_NEWS,
        name: "Hacker News",
        domains: ["news.ycombinator.com"],
        priority: 1,
        sourceType: "community",
        searchQueries: ["LLM agents"],
        enabled: true,
      },
    ],
  };
}

function fetchedText() {
  return {
    url: "https://example.com/item",
    title: "Fetched title",
    plainText: "Fetched article text.",
    detectedPaywall: false,
    contentLength: 21,
  };
}

describe("daily reading job", () => {
  it("scores using the persisted item ID when an existing URL has a different candidate ID", async () => {
    const path = dbPath();
    const existingItem = candidate({
      id: "hackernews:https://example.com/item",
      sourceId: SOURCES.HACKER_NEWS,
      sourceName: "Hacker News",
      sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
    });
    const currentCandidate = candidate();

    initDb(path);
    upsertItem(existingItem);

    const result = await runDailyReading({
      initDb: () => initDb(path),
      loadPreferences: preferences,
      loadSourceRegistry: sourceRegistry,
      collectCandidates: async () => ({
        candidates: [currentCandidate],
        errors: [],
        sourcesUsed: [SOURCES.HACKER_NEWS],
      }),
      scoreItem: async () => score(),
      fetchUrlText: async () => fetchedText(),
      classifyCandidateCategory: async () => CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE,
      saveDigest: () => "digest.md",
    });

    assert.equal(result.failed, false);
    assert.deepEqual(result.classificationErrors, []);
    assert.deepEqual(result.scoreErrors, []);
    assert.notEqual(getScore(existingItem.id), null);
    assert.equal(result.topScores[0]?.id, existingItem.id);
    assert.equal(getRecentRuns("daily", 1)[0]?.status, "success");
  });

  it("ranks the digest from current run items instead of all historical scores", async () => {
    const path = dbPath();
    const oldItem = candidate({
      id: "arxiv:https://example.com/old",
      title: "Old",
      url: "https://example.com/old",
    });
    const currentCandidate = candidate({
      id: "arxiv:https://example.com/current",
      title: "Current",
      url: "https://example.com/current",
    });

    initDb(path);
    upsertItem(oldItem);
    upsertScore(oldItem.id, score({ finalScore: 10 }));

    const result = await runDailyReading({
      initDb: () => initDb(path),
      loadPreferences: preferences,
      loadSourceRegistry: sourceRegistry,
      collectCandidates: async () => ({
        candidates: [currentCandidate],
        errors: [],
        sourcesUsed: [SOURCES.HACKER_NEWS],
      }),
      scoreItem: async () => score({ finalScore: 5 }),
      fetchUrlText: async () => fetchedText(),
      classifyCandidateCategory: async () => CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE,
      saveDigest: () => "digest.md",
    });

    assert.equal(result.failed, false);
    assert.deepEqual(
      result.topScores.map((item) => item.id),
      [currentCandidate.id],
    );
  });

  it("marks the run as failed when no candidates are collected", async () => {
    const path = dbPath();
    const result = await runDailyReading({
      initDb: () => initDb(path),
      loadPreferences: preferences,
      loadSourceRegistry: sourceRegistry,
      collectCandidates: async () => ({
        candidates: [],
        errors: [],
        sourcesUsed: [SOURCES.HACKER_NEWS],
      }),
    });

    assert.equal(result.failed, true);
    assert.equal(result.digestPath, null);
    assert.equal(getRecentRuns("daily", 1)[0]?.status, "failed");
  });

  it("uses a fallback category when digest classification fails", async () => {
    const path = dbPath();
    const currentCandidate = candidate();
    let digestMarkdown = "";

    const result = await runDailyReading({
      initDb: () => initDb(path),
      loadPreferences: preferences,
      loadSourceRegistry: sourceRegistry,
      collectCandidates: async () => ({
        candidates: [currentCandidate],
        errors: [],
        sourcesUsed: [SOURCES.HACKER_NEWS],
      }),
      scoreItem: async () =>
        score({
          enterpriseRelevance: 2,
          workflowRedesignDepth: 2,
          realUseCaseSpecificity: 2,
          deploymentFdeRelevance: 5,
          businessOutcomeClarity: 2,
          technicalImplementationUsefulness: 2,
          nonGenericInsight: 2,
        }),
      fetchUrlText: async () => fetchedText(),
      classifyCandidateCategory: async () => {
        throw new Error("classification failed");
      },
      saveDigest: (markdown) => {
        digestMarkdown = markdown;
        return "digest.md";
      },
    });

    assert.equal(result.failed, false);
    assert.deepEqual(result.classificationErrors, [
      {
        url: currentCandidate.url,
        error: "classification failed",
      },
    ]);
    assert.equal(
      getItemByUrl(currentCandidate.url)?.category,
      CANDIDATE_CATEGORIES.FDE_CUSTOMER_DEPLOYMENT,
    );
    assert.match(digestMarkdown, /Category: fde customer deployment/);
  });

  it("passes academic fallback preference into candidate collection and reports sources used", async () => {
    const path = dbPath();
    let receivedEnableAcademicFallback = true;
    let receivedSourceRegistry: SourceRegistry | null = null;

    const result = await runDailyReading({
      initDb: () => initDb(path),
      loadSourceRegistry: sourceRegistry,
      loadPreferences: () => ({
        ...preferences(),
        enableAcademicFallback: false,
      }),
      collectCandidates: async (registry, _dailyMix, enableAcademicFallback) => {
        receivedSourceRegistry = registry;
        receivedEnableAcademicFallback = enableAcademicFallback;
        return { candidates: [], errors: [], sourcesUsed: [SOURCES.HACKER_NEWS] };
      },
    });

    assert.equal(receivedEnableAcademicFallback, false);
    assert.deepEqual(receivedSourceRegistry, sourceRegistry());
    assert.deepEqual(result.sourcesUsed, [SOURCES.HACKER_NEWS]);
  });

  it("fetches URL text only for shortlisted digest items", async () => {
    const path = dbPath();
    const firstCandidate = candidate({
      id: "arxiv:https://example.com/first",
      url: "https://example.com/first",
      title: "First",
    });
    const secondCandidate = candidate({
      id: "arxiv:https://example.com/second",
      url: "https://example.com/second",
      title: "Second",
    });
    const fetchedUrls: string[] = [];
    let digestMarkdown = "";

    const result = await runDailyReading({
      initDb: () => initDb(path),
      loadPreferences: preferences,
      loadSourceRegistry: sourceRegistry,
      collectCandidates: async () => ({
        candidates: [firstCandidate, secondCandidate],
        errors: [],
        sourcesUsed: [SOURCES.HACKER_NEWS],
      }),
      scoreItem: async (item) =>
        score({
          finalScore: item.url.endsWith("/first") ? 9 : 8,
        }),
      fetchUrlText: async (url) => {
        fetchedUrls.push(url);
        return {
          url,
          title: "Fetched title",
          plainText: `Fetched article text for ${url}.`,
          detectedPaywall: false,
          contentLength: 42,
        };
      },
      classifyCandidateCategory: async () => CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE,
      saveDigest: (markdown) => {
        digestMarkdown = markdown;
        return "digest.md";
      },
    });

    assert.equal(result.failed, false);
    assert.equal(result.urlTextFetched, 2);
    assert.deepEqual(result.urlTextErrors, []);
    assert.deepEqual(fetchedUrls, ["https://example.com/first", "https://example.com/second"]);
    assert.match(digestMarkdown, /Fetched article text for https:\/\/example\.com\/first\./);
    assert.equal(getItemByUrl("https://example.com/first")?.contentFetchStatus, "fetched");
    assert.equal(
      getItemByUrl("https://example.com/first")?.contentText,
      "Fetched article text for https://example.com/first.",
    );
    assert.equal(
      getItemByUrl("https://example.com/first")?.category,
      CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE,
    );
  });
});
