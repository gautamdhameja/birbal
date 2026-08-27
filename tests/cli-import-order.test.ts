import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

import { runBirbalCli } from "../src/app/cli.js";

function runCli(args: readonly string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "src/app/cli.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function runBinary(args: readonly string[]) {
  return spawnSync(process.execPath, ["bin/birbal.js", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

describe("CLI module loading", () => {
  it("launches through the packaged binary after source files move", () => {
    const result = runBinary(["--help"]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Usage: birbal/);
  });

  it("does not initialize logging before trace options can be applied", () => {
    const script = [
      'await import("./src/app/cli.ts");',
      'process.env.LOG_LEVEL = "debug";',
      'const { logger } = await import("./src/app/logging/logger.ts");',
      "process.stdout.write(logger.level);",
    ].join("\n");
    const { LOG_LEVEL: _logLevel, LOG_PRETTY: _logPretty, ...environment } = process.env;

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: environment,
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "debug");
  });

  it("creates fresh loggers from the current runtime configuration", () => {
    const script = [
      'const { createAppLogger } = await import("./src/app/logging/logger.ts");',
      'process.env.LOG_LEVEL = "info";',
      "const first = createAppLogger();",
      'process.env.LOG_LEVEL = "debug";',
      "const second = createAppLogger();",
      "process.stdout.write(`${first.level},${second.level}`);",
    ].join("\n");
    const { LOG_LEVEL: _logLevel, LOG_PRETTY: _logPretty, ...environment } = process.env;

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: environment,
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "info,debug");
  });

  it("forces debug logging when trace is enabled", () => {
    const script = [
      'process.env.LOG_LEVEL = "info";',
      'const { configureTraceLogging } = await import("./src/app/cli.ts");',
      "configureTraceLogging(true);",
      'process.stdout.write(process.env.LOG_LEVEL ?? "");',
    ].join("\n");

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: process.env,
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "debug");
  });

  it("uses one injected runtime for trace rendering and the agent action", async () => {
    const originalLogLevel = process.env.LOG_LEVEL;
    const originalLogPretty = process.env.LOG_PRETTY;
    const stdout: string[] = [];
    const stderr: string[] = [];
    let runtimeLoads = 0;
    let renderedTools = 0;
    let receivedTask = "";

    try {
      await runBirbalCli(["agent", "dependency", "boundaries", "--trace"], {
        loadRuntime: async () => {
          runtimeLoads += 1;
          return {
            renderToolsForPrompt: () => {
              renderedTools += 1;
              return "name: fake_runtime_tool";
            },
            runAgent: async (task) => {
              receivedTask = task;
              return "fake runtime answer";
            },
          };
        },
        writeOutput: (message) => stdout.push(message),
        writeError: (message) => stderr.push(message),
      });
    } finally {
      if (originalLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = originalLogLevel;
      }
      if (originalLogPretty === undefined) {
        delete process.env.LOG_PRETTY;
      } else {
        process.env.LOG_PRETTY = originalLogPretty;
      }
    }

    assert.equal(runtimeLoads, 1);
    assert.equal(renderedTools, 1);
    assert.equal(receivedTask, "dependency boundaries");
    assert.deepEqual(stderr, ["name: fake_runtime_tool"]);
    assert.deepEqual(stdout, ["fake runtime answer"]);
  });

  it("exposes only the research agent workflow", () => {
    const topLevelHelp = runCli(["--help"]);

    assert.equal(topLevelHelp.status, 0, topLevelHelp.stderr);
    assert.match(topLevelHelp.stdout, /agent/);
    assert.match(topLevelHelp.stdout, /research/);
    assert.doesNotMatch(topLevelHelp.stdout, /daily|digest|newsletter|pipeline|use-cases/i);
  });
});
