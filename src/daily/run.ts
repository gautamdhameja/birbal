import { pathToFileURL } from "node:url";

import dotenv from "dotenv";

import { DAILY_READING } from "../constants/daily.js";
import { ENV_FILE_PATHS, OUTPUT } from "../constants/runtime.js";
import { runDailyReading } from "./job.js";

dotenv.config({ path: ENV_FILE_PATHS, quiet: true });

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint ? import.meta.url === pathToFileURL(entryPoint).href : false;
}

if (isMainModule()) {
  const result = await runDailyReading(
    {},
    {
      traceSelection: process.argv.includes(DAILY_READING.TRACE_SELECTION_FLAG),
    },
  );
  const { failed, ...output } = result;

  if (failed) {
    process.exitCode = 1;
  }

  console.log(JSON.stringify(output, null, OUTPUT.JSON_INDENT_SPACES));
}
