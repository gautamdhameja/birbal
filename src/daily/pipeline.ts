import { searchArxiv } from "../arxiv/client.js";
import type { ArxivPaper } from "../arxiv/client.js";
import { searchHackerNews } from "../hackernews/client.js";
import type { HackerNewsStory } from "../hackernews/client.js";
import { DAILY_TOPICS } from "./topics.js";
import type { CandidateItem } from "./types.js";

const MAX_RESULTS_PER_TOPIC = 5;
const MAX_CANDIDATES = 20;

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();

  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

export function toArxivCandidate(paper: ArxivPaper): CandidateItem {
  const url = normalizeUrl(paper.url);

  return {
    id: `arxiv:${url}`,
    source: "arxiv",
    title: paper.title,
    url,
    summary: paper.summary,
    publishedAt: paper.published,
    raw: paper,
  };
}

export function toHackerNewsCandidate(story: HackerNewsStory): CandidateItem {
  const url = normalizeUrl(story.url);

  return {
    id: `hackernews:${url}`,
    source: "hackernews",
    title: story.title,
    url,
    summary: "",
    publishedAt: story.created_at,
    raw: story,
  };
}

function dedupeByUrl(candidates: CandidateItem[]): CandidateItem[] {
  const seen = new Set<string>();
  const deduped: CandidateItem[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.url)) {
      continue;
    }

    seen.add(candidate.url);
    deduped.push(candidate);
  }

  return deduped;
}

function toTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function compareCandidates(left: CandidateItem, right: CandidateItem): number {
  const publishedOrder = toTimestamp(right.publishedAt) - toTimestamp(left.publishedAt);
  if (publishedOrder !== 0) {
    return publishedOrder;
  }

  const sourceOrder = left.source.localeCompare(right.source);
  if (sourceOrder !== 0) {
    return sourceOrder;
  }

  return left.title.localeCompare(right.title);
}

export function rankDailyCandidates(
  candidates: CandidateItem[],
  maxCandidates = MAX_CANDIDATES,
): CandidateItem[] {
  return dedupeByUrl([...candidates].sort(compareCandidates)).slice(0, maxCandidates);
}

export async function collectDailyCandidates(): Promise<CandidateItem[]> {
  const candidates: CandidateItem[] = [];

  for (const topic of DAILY_TOPICS) {
    const [arxivResults, hackerNewsResults] = await Promise.all([
      searchArxiv({ query: topic, maxResults: MAX_RESULTS_PER_TOPIC }),
      searchHackerNews({ query: topic, maxResults: MAX_RESULTS_PER_TOPIC }),
    ]);

    candidates.push(...arxivResults.map(toArxivCandidate));
    candidates.push(...hackerNewsResults.map(toHackerNewsCandidate));
  }

  return rankDailyCandidates(candidates);
}
