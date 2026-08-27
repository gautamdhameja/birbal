import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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
  it("does not load dotenv or mutate the environment when imported", () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "birbal-cli-import-"));
    writeFileSync(join(temporaryDirectory, ".env"), "BIRBAL_IMPORT_SENTINEL=loaded\n");

    try {
      const script = [
        `await import(${JSON.stringify(pathToFileURL(resolve("src/app/cli.ts")).href)});`,
        'process.stdout.write(process.env.BIRBAL_IMPORT_SENTINEL ?? "unset");',
      ].join("\n");
      const { BIRBAL_IMPORT_SENTINEL: _sentinel, ...environment } = process.env;
      const result = spawnSync(
        process.execPath,
        ["--import", import.meta.resolve("tsx"), "--input-type=module", "--eval", script],
        { cwd: temporaryDirectory, encoding: "utf8", env: environment },
      );

      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "unset");
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("launches through the packaged binary after source files move", () => {
    const result = runBinary(["--help"]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Usage: birbal/);
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

  it("passes trace to one injected runtime without mutating logging environment", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const runtimeOptions: Array<{ trace?: boolean }> = [];
    let runtimeLoads = 0;
    let renderedTools = 0;
    let receivedTask = "";

    const before = { level: process.env.LOG_LEVEL, pretty: process.env.LOG_PRETTY };
    await runBirbalCli(["agent", "dependency", "boundaries", "--trace"], {
      loadEnvironment() {},
      loadRuntime: async (options) => {
        runtimeOptions.push(options ?? {});
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

    assert.equal(runtimeLoads, 1);
    assert.deepEqual(runtimeOptions, [{ trace: true }]);
    assert.deepEqual({ level: process.env.LOG_LEVEL, pretty: process.env.LOG_PRETTY }, before);
    assert.equal(renderedTools, 1);
    assert.equal(receivedTask, "dependency boundaries");
    assert.deepEqual(stderr, ["name: fake_runtime_tool"]);
    assert.deepEqual(stdout, ["fake runtime answer"]);
  });

  it("does not leak trace settings into a later CLI invocation", async () => {
    const runtimeOptions: Array<{ trace?: boolean }> = [];
    const loadRuntime = async (options?: { trace?: boolean }) => {
      runtimeOptions.push(options ?? {});
      return {
        renderToolsForPrompt: () => "tools",
        runAgent: async () => "answer",
      };
    };
    const dependencies = {
      loadEnvironment() {},
      loadRuntime,
      writeOutput() {},
      writeError() {},
    };

    await runBirbalCli(["agent", "first", "--trace"], dependencies);
    await runBirbalCli(["agent", "second"], dependencies);

    assert.deepEqual(runtimeOptions, [{ trace: true }, { trace: false }]);
  });

  it("exposes only the research agent workflow", () => {
    const topLevelHelp = runCli(["--help"]);

    assert.equal(topLevelHelp.status, 0, topLevelHelp.stderr);
    assert.match(topLevelHelp.stdout, /agent/);
    assert.match(topLevelHelp.stdout, /research/);
    assert.doesNotMatch(topLevelHelp.stdout, /daily|digest|newsletter|pipeline|use-cases/i);
  });
});
