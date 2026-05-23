import { pathToFileURL } from "node:url";

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

const CLI_FLAGS = {
  CONFIG: "--config",
  DRY_RUN: "--dry-run",
  LIMIT: "--limit",
  TRACE: "--trace",
} as const;

dotenv.config({ path: ENV_FILE_PATHS, quiet: true });

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint ? import.meta.url === pathToFileURL(entryPoint).href : false;
}

function parsePositiveInteger(value: string | undefined, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer.`);
  }

  return parsed;
}

function parseCliArgs(args: readonly string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    trace: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === CLI_FLAGS.TRACE) {
      options.trace = true;
      continue;
    }

    if (arg === CLI_FLAGS.DRY_RUN) {
      options.dryRun = true;
      continue;
    }

    if (arg === CLI_FLAGS.LIMIT) {
      options.limit = parsePositiveInteger(args[index + 1], CLI_FLAGS.LIMIT);
      index += 1;
      continue;
    }

    if (arg === CLI_FLAGS.CONFIG) {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`${CLI_FLAGS.CONFIG} requires a path.`);
      }

      options.configPath = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown flag: ${arg}`);
    }

    if (options.pipelineId) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }

    options.pipelineId = arg;
  }

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
