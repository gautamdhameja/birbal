import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

describe("CLI module loading", () => {
  it("does not initialize logging before trace options can be applied", () => {
    const script = [
      'await import("./src/cli.ts");',
      'process.env.LOG_LEVEL = "debug";',
      'const { logger } = await import("./src/logging/logger.ts");',
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
});
