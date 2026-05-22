import { DIGEST } from "../constants/digest.js";
import { DAILY_READING } from "../constants/daily.js";
import { SCORING } from "../constants/scoring.js";
import { CONTENT_FETCH_STATUSES } from "../constants/candidates.js";
import { loadSourceRegistry } from "../config/sourceRegistry.js";
import type { SourceRegistry } from "../config/sourceRegistry.js";
import { fetchUrlText } from "../url-text/client.js";
import type { FetchUrlTextResult } from "../url-text/client.js";
import {
  getItemByUrl,
  getScore,
  initDb,
  listTopScoredItemsByIds,
  upsertItem,
  upsertScore,
} from "../db/items.js";
import { logger } from "../logging/logger.js";
import { loadPreferences } from "../memory/preferences.js";
import type { UserPreferences } from "../memory/types.js";
import { classifyCandidateCategory, fallbackCategoryFromScore } from "./classification.js";
import { saveDigest, writeDigest } from "./digest.js";
import { selectDigestItems } from "./digestSelection.js";
import { collectDailyCandidateResult } from "./pipeline.js";
import type { DailyCollectionError } from "./pipeline.js";
import { scoreItem } from "./scoring.js";
import type { CandidateCategory, CandidateItem, ItemScore, ScoredCandidateItem } from "./types.js";

type CandidateToScore = {
  candidate: CandidateItem;
  itemId: string;
};

export type DailyRunResult = {
  collected: number;
  new: number;
  alreadyExisted: number;
  sourcesUsed: string[];
  scored: number;
  alreadyScored: number;
  sourceErrors: DailyCollectionError[];
  scoreErrors: Array<{ url: string; error: string }>;
  classificationErrors: Array<{ url: string; error: string }>;
  urlTextFetched: number;
  urlTextErrors: Array<{ url: string; error: string }>;
  digestPath: string | null;
  topScores: ScoredCandidateItem[];
  failed: boolean;
};

type DailyRunDependencies = {
  collectCandidates(
    sourceRegistry: SourceRegistry,
    dailyMix: UserPreferences["dailyMix"],
    enableAcademicFallback: boolean,
  ): Promise<{
    candidates: CandidateItem[];
    errors: DailyCollectionError[];
    sourcesUsed: string[];
  }>;
  getItemByUrl(url: string): CandidateItem | null;
  getScore(itemId: string): ItemScore | null;
  initDb(): unknown;
  listTopScoredItemsByIds(itemIds: readonly string[], limit: number): ScoredCandidateItem[];
  loadPreferences(): UserPreferences;
  loadSourceRegistry(): SourceRegistry;
  now(): Date;
  saveDigest(markdown: string, date: Date): string;
  scoreItem(candidate: CandidateItem, preferences: UserPreferences): Promise<ItemScore>;
  fetchUrlText(url: string): Promise<FetchUrlTextResult>;
  classifyCandidateCategory(candidate: CandidateItem, score: ItemScore): Promise<CandidateCategory>;
  upsertItem(candidate: CandidateItem): void;
  upsertScore(itemId: string, score: ItemScore): void;
  writeDigest(items: ScoredCandidateItem[], date: Date): string;
};

const defaultDependencies: DailyRunDependencies = {
  collectCandidates: (sourceRegistry, dailyMix, enableAcademicFallback) =>
    collectDailyCandidateResult(sourceRegistry, {
      dailyMix,
      enableAcademicFallback,
    }),
  getItemByUrl,
  getScore,
  initDb,
  listTopScoredItemsByIds,
  loadPreferences,
  loadSourceRegistry,
  now: () => new Date(),
  saveDigest,
  scoreItem,
  fetchUrlText: (url) => fetchUrlText({ url }),
  classifyCandidateCategory,
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

async function classifyShortlistedItems(
  items: ScoredCandidateItem[],
  classify: DailyRunDependencies["classifyCandidateCategory"],
): Promise<{
  items: ScoredCandidateItem[];
  errors: Array<{ url: string; error: string }>;
}> {
  const classifiedItems: ScoredCandidateItem[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  for (const item of items) {
    let category: CandidateCategory;
    try {
      category = await classify(item, item.score);
    } catch (error) {
      errors.push({
        url: item.url,
        error: error instanceof Error ? error.message : String(error),
      });
      category = fallbackCategoryFromScore(item.score);
    }

    classifiedItems.push({
      ...item,
      category,
    });
  }

  return {
    items: classifiedItems,
    errors,
  };
}

async function enrichShortlistedItemsWithUrlText(
  items: ScoredCandidateItem[],
  fetchText: DailyRunDependencies["fetchUrlText"],
): Promise<{
  items: ScoredCandidateItem[];
  fetched: number;
  errors: Array<{ url: string; error: string }>;
}> {
  const enrichedItems: ScoredCandidateItem[] = [];
  const errors: Array<{ url: string; error: string }> = [];
  let fetched = 0;

  for (const item of items) {
    try {
      const extracted = await fetchText(item.url);
      fetched += 1;
      enrichedItems.push({
        ...item,
        title: item.title || extracted.title,
        summary: extracted.plainText || item.summary,
        contentText: extracted.plainText,
        contentFetchStatus: extracted.detectedPaywall
          ? CONTENT_FETCH_STATUSES.PAYWALLED
          : CONTENT_FETCH_STATUSES.FETCHED,
        raw: {
          item: item.raw,
          extractedText: extracted,
        },
      });
    } catch (error) {
      errors.push({
        url: item.url,
        error: error instanceof Error ? error.message : String(error),
      });
      enrichedItems.push({
        ...item,
        contentFetchStatus: CONTENT_FETCH_STATUSES.FAILED,
      });
    }
  }

  return {
    items: enrichedItems,
    fetched,
    errors,
  };
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
  const sourceRegistry = deps.loadSourceRegistry();
  const { candidates, errors, sourcesUsed } = await deps.collectCandidates(
    sourceRegistry,
    preferences.dailyMix,
    preferences.enableAcademicFallback,
  );

  logger.info(
    {
      event: DAILY_READING.LOG_EVENTS.SOURCES_USED,
      sourcesUsed,
      enableAcademicFallback: preferences.enableAcademicFallback,
    },
    DAILY_READING.LOG_MESSAGES.SOURCES_USED,
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
  const digestCandidatePool = deps.listTopScoredItemsByIds(
    uniqueCurrentRunItemIds,
    Math.max(DIGEST.TOP_ITEMS, SCORING.TOP_RESULTS),
  );
  const {
    items: enrichedDigestItems,
    fetched: urlTextFetched,
    errors: urlTextErrors,
  } = await enrichShortlistedItemsWithUrlText(digestCandidatePool, deps.fetchUrlText);
  const { items: classifiedDigestItems, errors: classificationErrors } =
    await classifyShortlistedItems(enrichedDigestItems, deps.classifyCandidateCategory);
  for (const item of classifiedDigestItems) {
    deps.upsertItem(item);
  }
  const selectedDigestItems = selectDigestItems(classifiedDigestItems, preferences);
  const digestPath =
    selectedDigestItems.length > 0
      ? deps.saveDigest(deps.writeDigest(selectedDigestItems, today), today)
      : null;
  const topScores = deps.listTopScoredItemsByIds(uniqueCurrentRunItemIds, SCORING.TOP_RESULTS);
  const failed = shouldFailDailyRun(candidates, candidatesToScore, scored, selectedDigestItems);

  return {
    collected: candidates.length,
    new: newCandidates.length,
    alreadyExisted,
    sourcesUsed,
    scored,
    alreadyScored,
    sourceErrors: errors,
    scoreErrors,
    classificationErrors,
    urlTextFetched,
    urlTextErrors,
    digestPath,
    topScores,
    failed,
  };
}
