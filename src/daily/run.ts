import { pathToFileURL } from "node:url";

import dotenv from "dotenv";

import { ENV_FILE_PATHS, OUTPUT, SCORING } from "../constants.js";
import { initDb, itemExistsByUrl, upsertItem } from "../db/items.js";
import { collectDailyCandidateResult } from "./pipeline.js";
import { rankScoredCandidates, scoreItem } from "./scoring.js";
import type { CandidateItem, ScoredCandidateItem } from "./types.js";

dotenv.config({ path: ENV_FILE_PATHS, quiet: true });

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint ? import.meta.url === pathToFileURL(entryPoint).href : false;
}

if (isMainModule()) {
  initDb();

  const { candidates, errors } = await collectDailyCandidateResult();
  const newCandidates: CandidateItem[] = [];
  const scoredCandidates: ScoredCandidateItem[] = [];
  const scoreErrors: Array<{ url: string; error: string }> = [];
  let alreadyExisted = 0;

  for (const candidate of candidates) {
    if (itemExistsByUrl(candidate.url)) {
      alreadyExisted += 1;
      continue;
    }

    upsertItem(candidate);
    newCandidates.push(candidate);
  }

  for (const candidate of newCandidates) {
    try {
      scoredCandidates.push({
        ...candidate,
        score: await scoreItem(candidate, SCORING.DEFAULT_PREFERENCES),
      });
    } catch (error) {
      scoreErrors.push({
        url: candidate.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        collected: candidates.length,
        new: newCandidates.length,
        alreadyExisted,
        sourceErrors: errors,
        scoreErrors,
        topScores: rankScoredCandidates(scoredCandidates),
      },
      null,
      OUTPUT.JSON_INDENT_SPACES,
    ),
  );
}
