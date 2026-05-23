import { pathToFileURL } from "node:url";

import { Command, InvalidArgumentError } from "commander";
import dotenv from "dotenv";

import { ENV_FILE_PATHS, OUTPUT } from "./constants/runtime.js";
import type { PipelineConfig } from "./framework/pipeline/types.js";

type CliOptions = {
  configPath?: string;
  dryRun: boolean;
  limit?: number;
  pipelineId?: string;
  trace: boolean;
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

function parseCliArgs(args: readonly string[]): CliOptions {
  const program = new Command()
    .name("run-pipeline")
    .argument("[pipelineId]", "pipeline ID to run")
    .option("--trace", "enable debug tracing")
    .option("--dry-run", "print resolved config without running")
    .option("--limit <number>", "limit candidate and output counts", parsePositiveInteger)
    .option("--config <path>", "load pipeline config from a file path")
    .showHelpAfterError();

  program.parse(args, { from: "user" });
  const parsedOptions = program.opts<{
    config?: string;
    dryRun?: boolean;
    limit?: number;
    trace?: boolean;
  }>();
  const pipelineId = program.args[0];
  const options: CliOptions = {
    configPath: parsedOptions.config,
    dryRun: Boolean(parsedOptions.dryRun),
    limit: parsedOptions.limit,
    pipelineId,
    trace: Boolean(parsedOptions.trace),
  };

  if (!options.pipelineId && !options.configPath) {
    throw new Error("Usage: npm run run-pipeline -- <pipelineId> [--config path] [--limit n]");
  }

  return options;
}

function applyLimit(config: PipelineConfig, limit: number | undefined): PipelineConfig {
  if (!limit) {
    return config;
  }

  return {
    ...config,
    contentFetchPolicy: {
      ...config.contentFetchPolicy,
      maxItems: limit,
    },
    limits: {
      ...config.limits,
      limit,
      maxCandidates: Math.min(config.limits.maxCandidates ?? limit, limit),
      maxResults: limit,
    },
    metadata: {
      ...config.metadata,
      cliLimit: limit,
    },
  };
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.trace) {
    process.env.LOG_LEVEL = "debug";
    process.env.LOG_PRETTY = process.env.LOG_PRETTY ?? "true";
  }

  const configPathOrId = options.configPath ?? options.pipelineId;
  if (!configPathOrId) {
    throw new Error("Pipeline ID or config path is required.");
  }

  const { loadPipelineConfig } = await import("./framework/pipeline/config.js");
  const loadConfig = (value: string) => applyLimit(loadPipelineConfig(value), options.limit);

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          config: loadConfig(configPathOrId),
        },
        null,
        OUTPUT.JSON_INDENT_SPACES,
      ),
    );
    return;
  }

  const [{ registerDefaultPipelineComponents }, { runPipeline }] = await Promise.all([
    import("./framework/pipeline/defaultComponents.js"),
    import("./framework/pipeline/runner.js"),
  ]);

  registerDefaultPipelineComponents();
  const result = await runPipeline(configPathOrId, {
    loadConfig,
  });

  if (result.status === "failed") {
    process.exitCode = 1;
  }

  console.log(JSON.stringify(result, null, OUTPUT.JSON_INDENT_SPACES));
}

if (isMainModule()) {
  await main();
}
