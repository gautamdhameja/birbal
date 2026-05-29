// Purpose: Provides the top-level Birbal command-line interface.
// Scope: Routes agent and pipeline commands while reusing the existing runtime entry points.

import { pathToFileURL } from "node:url";

import { Command, InvalidArgumentError } from "commander";
import dotenv from "dotenv";

import { CLI, ENV_FILE_PATHS, LOGGING } from "./constants/runtime.js";
import { runAgent } from "./agent/run.js";
import { renderToolsForPrompt } from "./tools/registry.js";
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
    .option("--limit <number>", "limit candidate and output counts", parsePositiveInteger)
    .option("--config <path>", "load pipeline config from a file path");
}

async function runAgentCommand(
  taskParts: readonly string[],
  options: TraceOptions,
  program: Command,
): Promise<void> {
  const trace = traceEnabled(options, program);
  if (trace) {
    process.env.LOG_LEVEL = process.env.LOG_LEVEL?.trim() || LOGGING.DEBUG_LEVEL;
    process.env.LOG_PRETTY = process.env.LOG_PRETTY?.trim() || LOGGING.PRETTY_ENABLED_VALUE;
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

export async function runBirbalCli(args: readonly string[] = process.argv.slice(2)): Promise<void> {
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

  addPipelineOptions(
    program.command("daily").description("run the daily enterprise AI reading pipeline"),
  ).action(async (options: PipelineCommandOptions) => {
    await runPipelineFromCliOptions(pipelineOptions(options, "daily", program));
  });

  addPipelineOptions(
    program
      .command("use-cases")
      .alias("use_cases")
      .description("run the enterprise AI use-case scout pipeline"),
  ).action(async (options: PipelineCommandOptions) => {
    await runPipelineFromCliOptions(pipelineOptions(options, "use_cases", program));
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
    await runPipelineFromCliOptions(
      pipelineOptions(options, pipelineIdFromUseShortcut(target), program),
    );
  });

  program
    .argument("[task...]", "task for the agent")
    .action(async (taskParts: string[], options: TraceOptions) => {
      await runAgentCommand(taskParts, options, program);
    });

  await program.parseAsync(args, { from: "user" });
}

if (isMainModule()) {
  await runBirbalCli();
}
