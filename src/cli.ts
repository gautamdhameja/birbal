// Purpose: Provides the top-level Birbal command-line interface.
// Scope: Routes agent and pipeline commands while reusing the existing runtime entry points.

import { pathToFileURL } from "node:url";

import { Command, InvalidArgumentError, type OptionValues } from "commander";
import dotenv from "dotenv";

import { CLI, ENV_FILE_PATHS, LOGGING } from "./constants/runtime.js";
import { runPipelineFromCliOptions } from "./runPipeline.js";
import type { PipelineCliOptions } from "./runPipeline.js";

type TraceOptions = {
  trace?: boolean;
};

type PipelineCommandOptions = TraceOptions & {
  config?: string;
  dryRun?: boolean;
  limit?: number;
};

type EvalCommandOptions = {
  json?: boolean;
  suite?: string[];
};

type UseCaseProcessCommandOptions = PipelineCommandOptions & {
  snapshot?: string;
};

dotenv.config({ path: ENV_FILE_PATHS, quiet: true });

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint ? import.meta.url === pathToFileURL(entryPoint).href : false;
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError("must be a positive integer.");
  }

  return parsed;
}

function traceEnabled(options: TraceOptions, program: Command): boolean {
  const globalOptions = program.opts<TraceOptions>();
  return Boolean(options.trace ?? globalOptions.trace);
}

function configureTraceLogging(trace: boolean, forceDebugLevel = false): void {
  if (!trace) {
    return;
  }

  process.env.LOG_LEVEL = forceDebugLevel
    ? LOGGING.DEBUG_LEVEL
    : process.env.LOG_LEVEL?.trim() || LOGGING.DEBUG_LEVEL;
  process.env.LOG_PRETTY = process.env.LOG_PRETTY?.trim() || LOGGING.PRETTY_ENABLED_VALUE;
}

function pipelineOptions(
  options: PipelineCommandOptions,
  pipelineId: string | undefined,
  program: Command,
): PipelineCliOptions {
  const globalOptions = program.opts<TraceOptions>();
  return {
    configPath: options.config,
    dryRun: Boolean(options.dryRun),
    limit: options.limit,
    pipelineId,
    trace: Boolean(options.trace ?? globalOptions.trace),
  };
}

function addPipelineOptions(command: Command): Command {
  return command
    .option("--trace", "enable debug tracing")
    .option("--dry-run", "print resolved config without running")
    .option("--limit <number>", "limit final output count", parsePositiveInteger)
    .option("--config <path>", "load pipeline config from a file path");
}

function commandOptions<TOptions extends OptionValues>(
  optionsOrCommand: TOptions | Command,
  command?: Command,
): TOptions {
  const inheritedOptions = command?.optsWithGlobals<TOptions>() ?? {};
  const localOptions =
    optionsOrCommand instanceof Command
      ? optionsOrCommand.optsWithGlobals<TOptions>()
      : optionsOrCommand;

  return {
    ...inheritedOptions,
    ...localOptions,
  } as TOptions;
}

function dryRunEnabled(options: PipelineCommandOptions): boolean {
  return Boolean(options.dryRun) || process.argv.includes("--dry-run");
}

async function runAgentCommand(
  taskParts: readonly string[],
  options: TraceOptions,
  program: Command,
): Promise<void> {
  const trace = traceEnabled(options, program);
  configureTraceLogging(trace);

  const { runAgent } = await import("./agent/run.js");
  if (trace) {
    const { renderToolsForPrompt } = await import("./tools/registry.js");
    console.error(renderToolsForPrompt());
  }

  const task = taskParts.join(" ").trim() || CLI.DEFAULT_TASK;
  console.log(await runAgent(task));
}

function pipelineIdFromUseShortcut(target: string): string {
  const normalizedTarget = target.trim().toLowerCase().replaceAll("_", "-");
  if (
    normalizedTarget === "cases" ||
    normalizedTarget === "case" ||
    normalizedTarget === "use-cases"
  ) {
    return "use_cases";
  }

  if (normalizedTarget === "daily") {
    return "daily";
  }

  throw new InvalidArgumentError(`unknown pipeline shortcut: ${target}`);
}

async function runUseCasesCommand(
  options: PipelineCommandOptions,
  program: Command,
): Promise<void> {
  const trace = traceEnabled(options, program);
  configureTraceLogging(trace, true);
  const { runUseCaseAdaptivePipelineCommand } = await import("./pipelines/useCases/commands.js");
  await runUseCaseAdaptivePipelineCommand({
    configPath: options.config,
    dryRun: dryRunEnabled(options),
    limit: options.limit,
    trace,
  });
}

async function runUseCaseSearchCommand(options: PipelineCommandOptions): Promise<void> {
  const { runUseCaseSearchSnapshotCommand } = await import("./pipelines/useCases/commands.js");
  await runUseCaseSearchSnapshotCommand({
    configPath: options.config,
    limit: options.limit,
  });
}

async function runUseCaseProcessCommand(
  options: UseCaseProcessCommandOptions,
  program: Command,
): Promise<void> {
  const trace = traceEnabled(options, program);
  configureTraceLogging(trace, true);
  const { runUseCaseProcessSnapshotCommand } = await import("./pipelines/useCases/commands.js");
  await runUseCaseProcessSnapshotCommand({
    configPath: options.config,
    dryRun: dryRunEnabled(options),
    limit: options.limit,
    snapshotId: options.snapshot,
    trace,
  });
}

function registerUseCaseSearchAction(command: Command): Command {
  return command.action(
    async (optionsOrCommand: PipelineCommandOptions | Command, actionCommand?: Command) => {
      await runUseCaseSearchCommand(
        commandOptions<PipelineCommandOptions>(optionsOrCommand, actionCommand),
      );
    },
  );
}

function registerUseCaseProcessCommand(command: Command, program: Command): Command {
  return addPipelineOptions(command)
    .option("--snapshot <id>", "search snapshot id, or latest", "latest")
    .action(
      async (optionsOrCommand: UseCaseProcessCommandOptions | Command, actionCommand?: Command) => {
        await runUseCaseProcessCommand(
          commandOptions<UseCaseProcessCommandOptions>(optionsOrCommand, actionCommand),
          program,
        );
      },
    );
}

async function runEvalsCommand(options: EvalCommandOptions): Promise<void> {
  try {
    const { renderBirbalEvalResult, runBirbalEvals } = await import("./evals/run.js");
    const result = await runBirbalEvals({
      suiteIds: options.suite ?? [],
    });

    console.log(renderBirbalEvalResult(result, { json: Boolean(options.json) }));
    if (result.status === "failed") {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export async function runBirbalCli(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  const normalizedArgs = args.filter((arg) => arg !== "--");
  const program = new Command()
    .name("birbal")
    .description("Local agent harness and enterprise AI research scout")
    .option("--trace", "enable debug tracing")
    .showHelpAfterError();

  program
    .command("agent")
    .description("run the JSON agent harness")
    .argument("[task...]", "task for the agent")
    .option("--trace", "enable debug tracing")
    .action(async (taskParts: string[], options: TraceOptions) => {
      await runAgentCommand(taskParts, options, program);
    });

  program
    .command("evals")
    .description("run deterministic Birbal eval suites")
    .option("--json", "print the full eval result as JSON")
    .option("--suite <id>", "run one eval suite by ID", (value, previous: string[] = []) => [
      ...previous,
      value,
    ])
    .action(async (options: EvalCommandOptions) => {
      await runEvalsCommand(options);
    });

  addPipelineOptions(
    program.command("daily").description("run the daily enterprise AI reading pipeline"),
  ).action(async (optionsOrCommand: PipelineCommandOptions | Command) => {
    const options = commandOptions<PipelineCommandOptions>(optionsOrCommand);
    await runPipelineFromCliOptions(pipelineOptions(options, "daily", program));
  });

  const useCasesCommand = addPipelineOptions(
    program.command("use-cases").alias("use_cases").description("run the full use-case pipeline"),
  ).action(async (optionsOrCommand: PipelineCommandOptions | Command) => {
    const options = commandOptions<PipelineCommandOptions>(optionsOrCommand);
    await runUseCasesCommand(options, program);
  });

  registerUseCaseSearchAction(
    useCasesCommand
      .command("search")
      .description("run only use-case web search and store a reusable snapshot")
      .option("--limit <number>", "limit search snapshot candidate count", parsePositiveInteger)
      .option("--config <path>", "load pipeline config from a file path"),
  );

  registerUseCaseProcessCommand(
    useCasesCommand
      .command("process")
      .description("run model processing from a stored use-case search snapshot"),
    program,
  );

  registerUseCaseProcessCommand(
    program
      .command("use-cases-process")
      .description("run use-case model processing from a stored search snapshot"),
    program,
  );

  registerUseCaseSearchAction(
    addPipelineOptions(
      program
        .command("use-cases-search")
        .description("shortcut for use-cases search snapshot creation"),
    ),
  );

  addPipelineOptions(
    program
      .command("use-cases-full")
      .description("explicit full use-case run including web search"),
  ).action(async (optionsOrCommand: PipelineCommandOptions | Command) => {
    const options = commandOptions<PipelineCommandOptions>(optionsOrCommand);
    await runUseCasesCommand(options, program);
  });

  addPipelineOptions(
    program
      .command("pipeline")
      .alias("run-pipeline")
      .description("run a configured pipeline by ID")
      .argument("[pipelineId]", "pipeline ID to run"),
  ).action(async (pipelineId: string | undefined, options: PipelineCommandOptions) => {
    await runPipelineFromCliOptions(pipelineOptions(options, pipelineId, program));
  });

  addPipelineOptions(
    program
      .command("use")
      .description('shortcut form, for example "birbal use cases"')
      .argument("<target>", "pipeline shortcut target"),
  ).action(async (target: string, options: PipelineCommandOptions) => {
    const pipelineId = pipelineIdFromUseShortcut(target);
    if (pipelineId === "use_cases") {
      await runUseCasesCommand(options, program);
      return;
    }

    await runPipelineFromCliOptions(pipelineOptions(options, pipelineId, program));
  });

  program
    .argument("[task...]", "task for the agent")
    .action(async (taskParts: string[], options: TraceOptions) => {
      await runAgentCommand(taskParts, options, program);
    });

  await program.parseAsync(normalizedArgs, { from: "user" });
}

if (isMainModule()) {
  await runBirbalCli();
}
