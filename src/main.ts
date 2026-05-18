import dotenv from "dotenv";

import { CLI, ENV_FILE_PATHS, LOGGING } from "./constants.js";

dotenv.config({ path: ENV_FILE_PATHS, quiet: true });

const args = process.argv.slice(2);
const traceEnabled = args.includes(CLI.TRACE_FLAG);
const task = args.filter((arg) => arg !== CLI.TRACE_FLAG).join(" ").trim() || CLI.DEFAULT_TASK;

if (traceEnabled) {
  process.env.LOG_LEVEL = process.env.LOG_LEVEL?.trim() || LOGGING.DEFAULT_LEVEL;
  process.env.LOG_PRETTY = process.env.LOG_PRETTY?.trim() || LOGGING.PRETTY_ENABLED_VALUE;
}

const { runAgent } = await import("./agent/run.js");
const { renderToolsForPrompt } = await import("./tools/registry.js");

const toolsText = renderToolsForPrompt();

console.log(toolsText);

const answer = await runAgent(task);

console.log(answer);
