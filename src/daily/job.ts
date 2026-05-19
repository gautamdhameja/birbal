import { DIGEST } from "../constants/digest.js";
import { SCORING } from "../constants/scoring.js";
import {
  getItemByUrl,
  getScore,
  initDb,
  listTopScoredItemsByIds,
  upsertItem,
  upsertScore,
} from "../db/items.js";
import { loadPreferences } from "../memory/preferences.js";
import type { UserPreferences } from "../memory/types.js";
import { saveDigest, writeDigest } from "./digest.js";
import { collectDailyCandidateResult } from "./pipeline.js";
import type { DailyCollectionError } from "./pipeline.js";
import { scoreItem } from "./scoring.js";
import type { CandidateItem, ItemScore, ScoredCandidateItem } from "./types.js";

type CandidateToScore = {
  candidate: CandidateItem;
  itemId: string;
};

export type DailyRunResult = {
  collected: number;
  new: number;
  alreadyExisted: number;
  scored: number;
  alreadyScored: number;
  sourceErrors: DailyCollectionError[];
  scoreErrors: Array<{ url: string; error: string }>;
  digestPath: string | null;
  topScores: ScoredCandidateItem[];
  failed: boolean;
};

type DailyRunDependencies = {
  collectCandidates(
    topics: readonly string[],
    dailyMix: UserPreferences["dailyMix"],
  ): Promise<{ candidates: CandidateItem[]; errors: DailyCollectionError[] }>;
  getItemByUrl(url: string): CandidateItem | null;
  getScore(itemId: string): ItemScore | null;
  initDb(): unknown;
  listTopScoredItemsByIds(itemIds: readonly string[], limit: number): ScoredCandidateItem[];
  loadPreferences(): UserPreferences;
  now(): Date;
  saveDigest(markdown: string, date: Date): string;
  scoreItem(candidate: CandidateItem, preferences: UserPreferences): Promise<ItemScore>;
  upsertItem(candidate: CandidateItem): void;
  upsertScore(itemId: string, score: ItemScore): void;
  writeDigest(items: ScoredCandidateItem[], date: Date): string;
};

const defaultDependencies: DailyRunDependencies = {
  collectCandidates: collectDailyCandidateResult,
  getItemByUrl,
  getScore,
  initDb,
  listTopScoredItemsByIds,
  loadPreferences,
  now: () => new Date(),
  saveDigest,
  scoreItem,
  upsertItem,
  upsertScore,
  writeDigest,
};

function shouldFailDailyRun(
  candidates: CandidateItem[],
  candidatesToScore: CandidateToScore[],
  scored: number,
  digestItems: ScoredCandidateItem[],
): boolean {
  return (
    candidates.length === 0 ||
    digestItems.length === 0 ||
    (candidatesToScore.length > 0 && scored === 0)
  );
}

export async function runDailyReading(
  dependencies: Partial<DailyRunDependencies> = {},
): Promise<DailyRunResult> {
  const deps = {
    ...defaultDependencies,
    ...dependencies,
  };

  deps.initDb();

  const preferences = deps.loadPreferences();
  const { candidates, errors } = await deps.collectCandidates(
    preferences.interests,
    preferences.dailyMix,
  );
  const newCandidates: CandidateItem[] = [];
  const candidatesToScore: CandidateToScore[] = [];
  const currentRunItemIds: string[] = [];
  const scoreErrors: Array<{ url: string; error: string }> = [];
  let alreadyExisted = 0;
  let alreadyScored = 0;
  let scored = 0;

  for (const candidate of candidates) {
    const existingItem = deps.getItemByUrl(candidate.url);
    if (existingItem) {
      alreadyExisted += 1;
    } else {
      newCandidates.push(candidate);
    }

    deps.upsertItem(candidate);
    const persistedItem = deps.getItemByUrl(candidate.url) ?? candidate;
    currentRunItemIds.push(persistedItem.id);

    if (deps.getScore(persistedItem.id)) {
      alreadyScored += 1;
    } else {
      candidatesToScore.push({
        candidate,
        itemId: persistedItem.id,
      });
    }
  }

  for (const { candidate, itemId } of candidatesToScore) {
    try {
      deps.upsertScore(itemId, await deps.scoreItem(candidate, preferences));
      scored += 1;
    } catch (error) {
      scoreErrors.push({
        url: candidate.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const today = deps.now();
  const uniqueCurrentRunItemIds = [...new Set(currentRunItemIds)];
  const digestItems = deps.listTopScoredItemsByIds(uniqueCurrentRunItemIds, DIGEST.TOP_ITEMS);
  const digestPath =
    digestItems.length > 0 ? deps.saveDigest(deps.writeDigest(digestItems, today), today) : null;
  const topScores = deps.listTopScoredItemsByIds(uniqueCurrentRunItemIds, SCORING.TOP_RESULTS);
  const failed = shouldFailDailyRun(candidates, candidatesToScore, scored, digestItems);

  return {
    collected: candidates.length,
    new: newCandidates.length,
    alreadyExisted,
    scored,
    alreadyScored,
    sourceErrors: errors,
    scoreErrors,
    digestPath,
    topScores,
    failed,
  };
}
