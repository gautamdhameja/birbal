import { pathToFileURL } from "node:url";

import { Command } from "commander";
import dotenv from "dotenv";

import { CLI, ENV_FILE_PATHS, LOGGING } from "./constants/runtime.js";

type TraceOptions = {
  trace?: boolean;
};

dotenv.config({ path: ENV_FILE_PATHS, quiet: true });

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint ? import.meta.url === pathToFileURL(entryPoint).href : false;
}

function configureTraceLogging(trace: boolean): void {
  if (!trace) {
    return;
  }

  process.env.LOG_LEVEL = process.env.LOG_LEVEL?.trim() || LOGGING.DEBUG_LEVEL;
  process.env.LOG_PRETTY = process.env.LOG_PRETTY?.trim() || LOGGING.PRETTY_ENABLED_VALUE;
}

async function runAgentCommand(
  taskParts: readonly string[],
  options: TraceOptions,
  program: Command,
): Promise<void> {
  const trace = Boolean(options.trace ?? program.opts<TraceOptions>().trace);
  configureTraceLogging(trace);

  const { runAgent } = await import("./agent/run.js");
  if (trace) {
    const { toolRegistry } = await import("./tools/registry.js");
    console.error(toolRegistry.renderForPrompt());
  }

  const task = taskParts.join(" ").trim() || CLI.DEFAULT_TASK;
  console.log(await runAgent(task));
}

export async function runBirbalCli(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  const program = new Command()
    .name("birbal")
    .description("Local research agent that returns source-linked reading lists")
    .option("--trace", "enable debug tracing")
    .showHelpAfterError();

  program
    .command("agent")
    .description("research a topic and return a reading list")
    .argument("[task...]", "research task")
    .option("--trace", "enable debug tracing")
    .action(async (taskParts: string[], options: TraceOptions) => {
      await runAgentCommand(taskParts, options, program);
    });

  program
    .argument("[task...]", "research task")
    .action(async (taskParts: string[], options: TraceOptions) => {
      await runAgentCommand(taskParts, options, program);
    });

  await program.parseAsync(
    args.filter((arg) => arg !== "--"),
    { from: "user" },
  );
}

if (isMainModule()) {
  await runBirbalCli();
}
