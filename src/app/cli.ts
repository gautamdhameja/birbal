import { pathToFileURL } from "node:url";

import { Command } from "commander";
import dotenv from "dotenv";

import { ARCHITECTURE_LAB_SESSION_LIMITS } from "./architecture-lab/constants.js";
import { CLI, ENV_FILE_PATHS } from "./constants/runtime.js";
import type { TerminalInputPort } from "./terminal/types.js";
import type { BirbalRuntimeLoader, BirbalRuntimeOptions } from "./runtime/types.js";

type TraceOptions = {
  trace?: boolean;
};

const LAB_TERMINAL_QUEUE_MAX_CHARACTERS =
  ARCHITECTURE_LAB_SESSION_LIMITS.transcriptCharacters +
  ARCHITECTURE_LAB_SESSION_LIMITS.turnCharacters;

export type CliExitStatus = 0 | 1 | 130;

function assertNever(value: never): never {
  throw new Error("Unexpected Architecture Case Lab result.", { cause: value });
}

export type CliDependencies = {
  loadEnvironment?: () => void;
  loadRuntime?: BirbalRuntimeLoader;
  loadTerminalInput?: () => TerminalInputPort | Promise<TerminalInputPort>;
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

async function loadDefaultTerminalInput(): Promise<TerminalInputPort> {
  const { createReadlineTerminalInput } = await import("./terminal/readline.js");
  return createReadlineTerminalInput({
    input: process.stdin,
    interactionOutput: process.stderr,
    maxQueuedCharacters: LAB_TERMINAL_QUEUE_MAX_CHARACTERS,
  });
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

async function runLabCommand(
  caseParts: readonly string[],
  options: TraceOptions,
  program: Command,
  dependencies: CliDependencies,
): Promise<CliExitStatus> {
  const writeOutput = dependencies.writeOutput ?? console.log;
  const writeError = dependencies.writeError ?? console.error;
  let input: TerminalInputPort | undefined;

  try {
    input = await (dependencies.loadTerminalInput ?? loadDefaultTerminalInput)();
    const trace = Boolean(options.trace ?? program.opts<TraceOptions>().trace);
    const runtime = await (dependencies.loadRuntime ?? loadDefaultRuntime)({ trace });
    if (trace) {
      writeError(runtime.renderToolsForPrompt());
    }

    const session = runtime.createLabSession({
      input,
      onOutput: (output) => writeError(output.content),
    });
    const caseName = caseParts.join(" ").trim();
    const result = await session.run(caseName ? { caseName } : {});

    switch (result.type) {
      case "completed":
        writeOutput(result.output);
        return 0;
      case "exited":
        return 0;
      case "interrupted":
        return 130;
      case "failed":
        writeError(result.output);
        return 1;
    }
    return assertNever(result);
  } catch {
    writeError("The Architecture Case Lab failed. Start a fresh lab session to try again.");
    return 1;
  } finally {
    input?.close();
  }
}

export async function runBirbalCli(
  args: readonly string[] = process.argv.slice(2),
  dependencies: CliDependencies = {},
): Promise<CliExitStatus> {
  (dependencies.loadEnvironment ?? loadDefaultEnvironment)();
  let status: CliExitStatus = 0;
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
    .command("lab")
    .description("practice an architecture case and receive a sourced review")
    .argument("[case...]", "architecture case")
    .option("--trace", "enable debug tracing")
    .action(async (caseParts: string[], options: TraceOptions) => {
      status = await runLabCommand(caseParts, options, program, dependencies);
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
  return status;
}

if (isMainModule()) {
  process.exitCode = await runBirbalCli();
}
