import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

function runCli(args: readonly string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "src/app/cli.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

describe("CLI module loading", () => {
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

  it("keeps full, search, and process shortcut commands registered", () => {
    const topLevelHelp = runCli(["--help"]);
    const useCaseHelp = runCli(["use-cases", "--help"]);

    assert.equal(topLevelHelp.status, 0, topLevelHelp.stderr);
    assert.match(topLevelHelp.stdout, /use-cases-process/);
    assert.match(topLevelHelp.stdout, /use-cases-search/);
    assert.match(topLevelHelp.stdout, /use-cases-full/);
    assert.equal(useCaseHelp.status, 0, useCaseHelp.stderr);
    assert.match(useCaseHelp.stdout, /search/);
    assert.match(useCaseHelp.stdout, /process/);
  });
});
