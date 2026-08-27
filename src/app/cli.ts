import { pathToFileURL } from "node:url";

import { Command } from "commander";
import dotenv from "dotenv";

import { CLI, ENV_FILE_PATHS } from "./constants/runtime.js";
import type { BirbalRuntimeLoader, BirbalRuntimeOptions } from "./runtime/types.js";

type TraceOptions = {
  trace?: boolean;
};

export type CliDependencies = {
  loadEnvironment?: () => void;
  loadRuntime?: BirbalRuntimeLoader;
  writeOutput?: (message: string) => void;
  writeError?: (message: string) => void;
};

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint ? import.meta.url === pathToFileURL(entryPoint).href : false;
}

function loadDefaultEnvironment(): void {
  dotenv.config({ path: ENV_FILE_PATHS, quiet: true });
}

async function loadDefaultRuntime(options?: BirbalRuntimeOptions) {
  const { createDefaultRuntime } = await import("./runtime/default.js");
  return createDefaultRuntime(options);
}

async function runAgentCommand(
  taskParts: readonly string[],
  options: TraceOptions,
  program: Command,
  dependencies: CliDependencies,
): Promise<void> {
  const trace = Boolean(options.trace ?? program.opts<TraceOptions>().trace);

  const runtime = await (dependencies.loadRuntime ?? loadDefaultRuntime)({ trace });
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
  (dependencies.loadEnvironment ?? loadDefaultEnvironment)();
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
