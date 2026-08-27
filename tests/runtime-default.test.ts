// Purpose: Covers the production application's default composition decisions.
// Scope: Exercises runtime option mapping through narrow injected boundary ports.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LOGGING } from "../src/app/constants/runtime.js";
import { createDefaultRuntime } from "../src/app/runtime/default.js";
import type { AppLoggingOptions } from "../src/app/logging/types.js";

describe("default runtime composition", () => {
  it("maps trace options to logger options without mutating process configuration", () => {
    const loggingOptions: AppLoggingOptions[] = [];
    const hadLogLevel = Object.hasOwn(process.env, "LOG_LEVEL");
    const hadLogPretty = Object.hasOwn(process.env, "LOG_PRETTY");
    const originalLogLevel = process.env.LOG_LEVEL;
    const originalLogPretty = process.env.LOG_PRETTY;
    const sentinelLogLevel = "sentinel-level";
    const sentinelLogPretty = "sentinel-pretty";
    const dependencies = {
      createLogger(options: AppLoggingOptions = {}) {
        assert.equal(process.env.LOG_LEVEL, sentinelLogLevel);
        assert.equal(process.env.LOG_PRETTY, sentinelLogPretty);
        loggingOptions.push(options);
        return {
          debug() {},
          warn() {},
        };
      },
    };
    try {
      process.env.LOG_LEVEL = sentinelLogLevel;
      process.env.LOG_PRETTY = sentinelLogPretty;

      createDefaultRuntime({ trace: true }, dependencies);
      createDefaultRuntime({ trace: false }, dependencies);
      createDefaultRuntime(undefined, dependencies);

      assert.deepEqual(loggingOptions, [{ level: LOGGING.DEBUG_LEVEL, pretty: true }, {}, {}]);
      assert.equal(process.env.LOG_LEVEL, sentinelLogLevel);
      assert.equal(process.env.LOG_PRETTY, sentinelLogPretty);
    } finally {
      if (hadLogLevel) {
        process.env.LOG_LEVEL = originalLogLevel as string;
      } else {
        delete process.env.LOG_LEVEL;
      }
      if (hadLogPretty) {
        process.env.LOG_PRETTY = originalLogPretty as string;
      } else {
        delete process.env.LOG_PRETTY;
      }
    }
  });

  it("creates fresh lab sessions without sharing invocation state", async () => {
    const runtime = createDefaultRuntime(undefined, {
      createLogger: () => ({ debug() {}, warn() {} }),
    });
    const input = {
      async read() {
        return { type: "eof" as const };
      },
      getTerminalOutcome() {
        return undefined;
      },
    };

    const first = runtime.createLabSession({ input });
    const second = runtime.createLabSession({ input });

    assert.notEqual(first, second);
    assert.equal(first.getState(), "idle");
    assert.equal(second.getState(), "idle");

    const oversizedCase = "x".repeat(501);
    assert.equal((await first.run({ caseName: oversizedCase })).type, "failed");
    assert.equal(first.getState(), "failed");
    assert.equal(second.getState(), "idle");
  });
});
