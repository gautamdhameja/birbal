import { Command } from "commander";
import dotenv from "dotenv";

import { CLI, ENV_FILE_PATHS, LOGGING } from "./constants/runtime.js";

dotenv.config({ path: ENV_FILE_PATHS, quiet: true });

const program = new Command()
  .name("birbal")
  .argument("[task...]", "task for the agent")
  .option(CLI.TRACE_FLAG, "enable debug tracing")
  .showHelpAfterError();

program.parse(process.argv);

const options = program.opts<{ trace?: boolean }>();
const traceEnabled = Boolean(options.trace);
const task = program.args.join(" ").trim() || CLI.DEFAULT_TASK;

if (traceEnabled) {
  process.env.LOG_LEVEL = process.env.LOG_LEVEL?.trim() || LOGGING.DEBUG_LEVEL;
  process.env.LOG_PRETTY = process.env.LOG_PRETTY?.trim() || LOGGING.PRETTY_ENABLED_VALUE;
}

const { runAgent } = await import("./agent/run.js");
const { renderToolsForPrompt } = await import("./tools/registry.js");

if (traceEnabled) {
  console.error(renderToolsForPrompt());
}

const answer = await runAgent(task);

console.log(answer);
