import { LOGGING, OUTPUT } from "./constants/runtime.js";
import type { PipelineConfig } from "../framework/pipeline/types.js";

export type PipelineCliOptions = {
  configPath?: string;
  dryRun: boolean;
  limit?: number;
  pipelineId?: string;
  trace: boolean;
};

export function applyPipelineCliLimit(
  config: PipelineConfig,
  limit: number | undefined,
): PipelineConfig {
  if (!limit) {
    return config;
  }

  return {
    ...config,
    limits: {
      ...config.limits,
      limit,
      maxResults: limit,
    },
    metadata: {
      ...config.metadata,
      cliLimit: limit,
    },
  };
}

export async function runPipelineFromCliOptions(options: PipelineCliOptions): Promise<void> {
  if (options.trace) {
    process.env.LOG_LEVEL = LOGGING.DEBUG_LEVEL;
    process.env.LOG_PRETTY = process.env.LOG_PRETTY ?? "true";
  }

  const configPathOrId = options.configPath ?? options.pipelineId;
  if (!configPathOrId) {
    throw new Error("Pipeline ID or config path is required.");
  }

  const { loadPipelineConfig } = await import("../framework/pipeline/config.js");
  const loadConfig = (value: string) =>
    applyPipelineCliLimit(loadPipelineConfig(value), options.limit);

  if (options.dryRun) {
    const [{ loadSourceRegistry }, { validateConfiguredSourceIds }] = await Promise.all([
      import("./config/sourceRegistry.js"),
      import("../framework/pipeline/orchestrator.js"),
    ]);
    const config = loadConfig(configPathOrId);
    validateConfiguredSourceIds(config, loadSourceRegistry());
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          config,
        },
        null,
        OUTPUT.JSON_INDENT_SPACES,
      ),
    );
    return;
  }

  const [
    { loadSourceRegistry },
    { sqlitePipelineRunStore },
    { logger },
    { getDefaultModelClient },
    { registerBirbalPipelineComponents },
    { runPipeline },
  ] = await Promise.all([
    import("./config/sourceRegistry.js"),
    import("./db/pipelineRuns.js"),
    import("./logging/logger.js"),
    import("./model-providers/default.js"),
    import("./pipelines/register.js"),
    import("../framework/pipeline/orchestrator.js"),
  ]);

  registerBirbalPipelineComponents();
  const result = await runPipeline(configPathOrId, {
    loadConfig,
    loadSourceRegistry,
    logger,
    modelClient: getDefaultModelClient(),
    runStore: sqlitePipelineRunStore,
  });

  if (result.status === "failed") {
    process.exitCode = 1;
  }

  console.log(JSON.stringify(result, null, OUTPUT.JSON_INDENT_SPACES));
}
