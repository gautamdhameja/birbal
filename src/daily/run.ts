import { pathToFileURL } from "node:url";

import dotenv from "dotenv";

import { ENV_FILE_PATHS, OUTPUT } from "../constants.js";
import { initDb, itemExistsByUrl, upsertItem } from "../db/items.js";
import { collectDailyCandidateResult } from "./pipeline.js";

dotenv.config({ path: ENV_FILE_PATHS, quiet: true });

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint ? import.meta.url === pathToFileURL(entryPoint).href : false;
}

if (isMainModule()) {
  initDb();

  const { candidates, errors } = await collectDailyCandidateResult();
  let newItems = 0;
  let alreadyExisted = 0;

  for (const candidate of candidates) {
    if (itemExistsByUrl(candidate.url)) {
      alreadyExisted += 1;
      continue;
    }

    upsertItem(candidate);
    newItems += 1;
  }

  console.log(
    JSON.stringify(
      {
        collected: candidates.length,
        new: newItems,
        alreadyExisted,
        sourceErrors: errors,
      },
      null,
      OUTPUT.JSON_INDENT_SPACES,
    ),
  );
}
