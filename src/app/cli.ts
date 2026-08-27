import { pathToFileURL } from "node:url";

import { Command } from "commander";
import dotenv from "dotenv";

import { CLI, ENV_FILE_PATHS, LOGGING } from "./constants/runtime.js";
import type { BirbalRuntimeLoader } from "./runtime/types.js";

type TraceOptions = {
  trace?: boolean;
};

export type CliDependencies = {
  loadRuntime?: BirbalRuntimeLoader;
  writeOutput?: (message: string) => void;
  writeError?: (message: string) => void;
};

dotenv.config({ path: ENV_FILE_PATHS, quiet: true });

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint ? import.meta.url === pathToFileURL(entryPoint).href : false;
}

export function configureTraceLogging(trace: boolean): void {
  if (!trace) {
    return;
  }

  process.env.LOG_LEVEL = LOGGING.DEBUG_LEVEL;
  process.env.LOG_PRETTY = process.env.LOG_PRETTY?.trim() || LOGGING.PRETTY_ENABLED_VALUE;
}

async function loadDefaultRuntime() {
  const { createDefaultRuntime } = await import("./runtime/default.js");
  return createDefaultRuntime();
}

async function runAgentCommand(
  taskParts: readonly string[],
  options: TraceOptions,
  program: Command,
  dependencies: CliDependencies,
): Promise<void> {
  const trace = Boolean(options.trace ?? program.opts<TraceOptions>().trace);
  configureTraceLogging(trace);

  const runtime = await (dependencies.loadRuntime ?? loadDefaultRuntime)();
  if (trace) {
    (dependencies.writeError ?? console.error)(runtime.renderToolsForPrompt());
  }

  const task = taskParts.join(" ").trim() || CLI.DEFAULT_TASK;
  (dependencies.writeOutput ?? console.log)(await runtime.runAgent(task));
}

export async function runBirbalCli(
  args: readonly string[] = process.argv.slice(2),
  dependencies: CliDependencies = {},
): Promise<void> {
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
      await runAgentCommand(taskParts, options, program, dependencies);
    });

  program
    .argument("[task...]", "research task")
    .action(async (taskParts: string[], options: TraceOptions) => {
      await runAgentCommand(taskParts, options, program, dependencies);
    });

  await program.parseAsync(
    args.filter((arg) => arg !== "--"),
    { from: "user" },
  );
}

if (isMainModule()) {
  await runBirbalCli();
}
