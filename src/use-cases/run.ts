import { pathToFileURL } from "node:url";

import dotenv from "dotenv";

import { ENV_FILE_PATHS, OUTPUT } from "../constants/runtime.js";
import { USE_CASES } from "../constants/use-cases.js";
import { saveUseCaseReport, writeUseCaseReport } from "./markdown.js";
import { runProductionUseCaseScout } from "./pipeline.js";

dotenv.config({ path: ENV_FILE_PATHS, quiet: true });

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint ? import.meta.url === pathToFileURL(entryPoint).href : false;
}

function parseMaxResults(args: readonly string[]): number | undefined {
  const flagIndex = args.indexOf("--max-results");
  if (flagIndex === -1) {
    return undefined;
  }

  const value = args[flagIndex + 1];
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(USE_CASES.ERRORS.INVALID_MAX_RESULTS);
  }

  return parsed;
}

if (isMainModule()) {
  const maxResults = parseMaxResults(process.argv.slice(2));
  const result = await runProductionUseCaseScout({}, { maxResults });
  const reportPath = saveUseCaseReport(writeUseCaseReport(result.results, new Date()), new Date());
  const { failed, ...output } = result;

  if (failed) {
    process.exitCode = 1;
  }

  console.log(JSON.stringify({ ...output, reportPath }, null, OUTPUT.JSON_INDENT_SPACES));
}
