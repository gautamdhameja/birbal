import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";

import { createArchitectureLabSession } from "../src/app/architecture-lab/session.js";
import type {
  ArchitectureLabInputPort,
  ArchitectureLabOperations,
  ArchitectureReview,
  CaseBrief,
} from "../src/app/architecture-lab/types.js";
import { runBirbalCli } from "../src/app/cli.js";
import { CLI } from "../src/app/constants/runtime.js";
import { createReadlineTerminalInput } from "../src/app/terminal/readline.js";
import type {
  ReadlineInterfaceLike,
  TerminalInputOutcome,
  TerminalInputPort,
  TerminalInputTerminalOutcome,
} from "../src/app/terminal/types.js";

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

function unavailableLabSession(): never {
  throw new Error("the research workflow must not create a lab session");
}

const labBrief: CaseBrief = {
  title: "AI support triage",
  problem: "Support queues delay urgent customer requests.",
  actors: ["customers", "support agents"],
  constraints: ["protect customer data"],
  desiredOutcome: {
    claim: "Reduce response delay without lowering resolution quality.",
    sourceIds: ["support-study"],
  },
  evidenceQuality: "sufficient",
  sources: [
    {
      id: "support-study",
      title: "Support automation study",
      url: "https://research.example.org/support-study",
      publishedAt: "2026-01-10",
    },
  ],
};

const labReview: ArchitectureReview = {
  strengths: ["The proposal includes explicit human escalation."],
  unresolvedRisks: ["Recovery behavior is unspecified."],
  missingComponents: ["An evaluation plan"],
  alternatives: ["Use a durable queue before classification."],
  supportedFacts: [
    {
      claim: "Comparable workflows use explicit escalation controls.",
      sourceIds: ["support-study"],
    },
  ],
  inferences: ["A durable queue may reduce lost work."],
  judgments: ["The oversight boundary is the strongest choice."],
  nextChallenge: "Specify recovery semantics for an interrupted request.",
  evidenceQuality: "sufficient",
  sources: labBrief.sources,
};

function fakeLabOperations(
  overrides: Partial<ArchitectureLabOperations> = {},
): ArchitectureLabOperations {
  return {
    async prepareCase() {
      return { ok: true, value: structuredClone(labBrief) };
    },
    async checkOpeningSafety() {
      return { ok: true, value: { safe: true, leakage: [], reason: "Problem framing only." } };
    },
    async generateChallenge() {
      return {
        ok: true,
        value: { dimension: "reliability", question: "How does the design recover?" },
      };
    },
    async gatherArchitectureEvidence() {
      return { ok: true, value: { claims: [], sources: [], evidenceQuality: "limited" } };
    },
    async generateReview() {
      return { ok: true, value: structuredClone(labReview) };
    },
    ...overrides,
  };
}

type TestInput = TerminalInputPort & {
  closeCalls: number;
  latch(outcome: TerminalInputTerminalOutcome): void;
};

class CliReadlineInterface extends EventEmitter implements ReadlineInterfaceLike {
  close(): void {
    this.emit("close");
  }
}

function testInput(events: TerminalInputOutcome[] = []): TestInput {
  let terminalOutcome: TerminalInputTerminalOutcome | undefined;
  return {
    closeCalls: 0,
    async read() {
      const event = events.shift() ?? { type: "eof" as const };
      if (event.type !== "line") {
        terminalOutcome = event;
      }
      return event;
    },
    getTerminalOutcome() {
      return terminalOutcome;
    },
    discardBufferedLines() {},
    latch(outcome) {
      terminalOutcome = outcome;
    },
    close() {
      this.closeCalls += 1;
    },
  };
}

function labRuntime(
  operations: ArchitectureLabOperations,
  onSession?: (session: ReturnType<typeof createArchitectureLabSession>) => void,
  onRequest?: (request: { caseName?: string }) => void,
) {
  return {
    renderToolsForPrompt: () => "unused tools",
    runAgent: async () => "unused reading list",
    createLabSession: ({
      input,
      onOutput,
    }: {
      input: ArchitectureLabInputPort;
      onOutput?: Parameters<typeof createArchitectureLabSession>[0]["onOutput"];
    }) => {
      const session = createArchitectureLabSession({ operations, input, onOutput });
      onSession?.(session);
      return {
        ...session,
        run(request: { caseName?: string } = {}) {
          onRequest?.(request);
          return session.run(request);
        },
      };
    },
  };
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
          createLabSession: unavailableLabSession,
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

  it("keeps default and explicit agent invocations non-interactive and reading-list-shaped", async () => {
    for (const args of [[], ["agent"]]) {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const receivedTasks: string[] = [];
      let runtimeLoads = 0;
      let inputAdapterLoads = 0;

      await runBirbalCli(args, {
        loadEnvironment() {},
        loadRuntime: async () => {
          runtimeLoads += 1;
          return {
            createLabSession: unavailableLabSession,
            renderToolsForPrompt: () => "unused tools",
            runAgent: async (task) => {
              receivedTasks.push(task);
              return "reading-list result";
            },
          };
        },
        loadTerminalInput: async () => {
          inputAdapterLoads += 1;
          throw new Error("research commands must not create an input adapter");
        },
        writeOutput: (message) => stdout.push(message),
        writeError: (message) => stderr.push(message),
      });

      assert.equal(runtimeLoads, 1);
      assert.equal(inputAdapterLoads, 0);
      assert.deepEqual(receivedTasks, [CLI.DEFAULT_TASK]);
      assert.deepEqual(stdout, ["reading-list result"]);
      assert.deepEqual(stderr, []);
    }
  });

  it("does not leak trace settings into a later CLI invocation", async () => {
    const runtimeOptions: Array<{ trace?: boolean }> = [];
    const loadRuntime = async (options?: { trace?: boolean }) => {
      runtimeOptions.push(options ?? {});
      return {
        createLabSession: unavailableLabSession,
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

  it("routes named and automatic lab cases to distinct sessions", async () => {
    const caseNames: Array<string | undefined> = [];
    const sessions: object[] = [];
    const inputs = [testInput([{ type: "eof" }]), testInput([{ type: "eof" }])];
    const runtime = labRuntime(
      fakeLabOperations(),
      (session) => sessions.push(session),
      (request) => caseNames.push(request.caseName),
    );

    for (const args of [["lab", "AI", "support", "triage"], ["lab"]]) {
      const input = inputs.shift()!;
      const status = await runBirbalCli(args, {
        loadEnvironment() {},
        loadRuntime: async () => runtime,
        loadTerminalInput: async () => input,
        writeOutput() {},
        writeError() {},
      });

      assert.equal(status, 0);
      assert.equal(input.closeCalls, 1);
    }

    assert.deepEqual(caseNames, ["AI support triage", undefined]);
    assert.equal(sessions.length, 2);
    assert.notEqual(sessions[0], sessions[1]);
  });

  it("writes only a completed review to stdout and closes the adapter", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const input = testInput([
      { type: "line", line: "Use a queue and a human escalation path." },
      { type: "line", line: "/submit" },
      { type: "line", line: "/finish" },
    ]);

    const status = await runBirbalCli(["lab", "support", "triage"], {
      loadEnvironment() {},
      loadRuntime: async () => labRuntime(fakeLabOperations()),
      loadTerminalInput: async () => input,
      writeOutput: (message) => stdout.push(message),
      writeError: (message) => stderr.push(message),
    });

    assert.equal(status, 0);
    assert.equal(input.closeCalls, 1);
    assert.equal(stdout.length, 1);
    assert.match(stdout[0]!, /^Architecture Review/m);
    assert.equal(
      stderr.some((message) => /Architecture Case:/m.test(message)),
      true,
    );
    assert.equal(
      stderr.some((message) => /Challenge — Round 1/m.test(message)),
      true,
    );
    assert.equal(
      stderr.some((message) => /Architecture Review/m.test(message)),
      false,
    );
  });

  it("maps terminal and phase outcomes to status, channels, and cleanup", async () => {
    const scenarios = [
      { outcome: { type: "eof" as const }, status: 0, stderr: /Researching/ },
      { outcome: { type: "interrupted" as const }, status: 130, stderr: /Researching/ },
      {
        outcome: { type: "input_error" as const, error: new Error("input broke") },
        status: 1,
        stderr: /Terminal input failed/,
      },
    ];

    for (const scenario of scenarios) {
      const input = testInput([scenario.outcome]);
      const stdout: string[] = [];
      const stderr: string[] = [];
      const status = await runBirbalCli(["lab"], {
        loadEnvironment() {},
        loadRuntime: async () => labRuntime(fakeLabOperations()),
        loadTerminalInput: async () => input,
        writeOutput: (message) => stdout.push(message),
        writeError: (message) => stderr.push(message),
      });

      assert.equal(status, scenario.status);
      assert.deepEqual(stdout, []);
      assert.equal(input.closeCalls, 1);
      assert.match(stderr.join("\n"), scenario.stderr);
    }
  });

  it("honors active-operation terminal precedence and final-review EOF semantics", async () => {
    const activeScenarios = [
      {
        terminal: { type: "eof" as const },
        operationResult: { ok: true as const, value: structuredClone(labBrief) },
        status: 0,
        error: undefined,
      },
      {
        terminal: { type: "interrupted" as const },
        operationResult: {
          ok: false as const,
          error: {
            type: "architecture_lab_operation_error" as const,
            phase: "case_research" as const,
            code: "research_failed" as const,
            message: "operation result must lose",
          },
        },
        status: 130,
        error: undefined,
      },
      {
        terminal: { type: "input_error" as const, error: new Error("input broke") },
        operationResult: {
          ok: false as const,
          error: {
            type: "architecture_lab_operation_error" as const,
            phase: "case_research" as const,
            code: "research_failed" as const,
            message: "operation result must lose",
          },
        },
        status: 1,
        error: /Terminal input failed/,
      },
    ];

    for (const scenario of activeScenarios) {
      const input = testInput();
      const stdout: string[] = [];
      const stderr: string[] = [];
      const operations = fakeLabOperations({
        async prepareCase() {
          input.latch(scenario.terminal);
          return scenario.operationResult;
        },
      });

      const status = await runBirbalCli(["lab"], {
        loadEnvironment() {},
        loadRuntime: async () => labRuntime(operations),
        loadTerminalInput: async () => input,
        writeOutput: (message) => stdout.push(message),
        writeError: (message) => stderr.push(message),
      });

      assert.equal(status, scenario.status);
      assert.deepEqual(stdout, []);
      assert.equal(input.closeCalls, 1);
      assert.doesNotMatch(stderr.join("\n"), /operation result must lose/);
      if (scenario.error) {
        assert.match(stderr.join("\n"), scenario.error);
      }
    }

    const challengeInput = testInput([
      { type: "line", line: "Use a durable queue." },
      { type: "line", line: "/submit" },
    ]);
    const challengeStdout: string[] = [];
    const challengeStderr: string[] = [];
    const challengeOperations = fakeLabOperations({
      async generateChallenge() {
        challengeInput.latch({ type: "eof" });
        return {
          ok: true,
          value: { dimension: "reliability", question: "This result must be discarded." },
        };
      },
    });

    const challengeStatus = await runBirbalCli(["lab"], {
      loadEnvironment() {},
      loadRuntime: async () => labRuntime(challengeOperations),
      loadTerminalInput: async () => challengeInput,
      writeOutput: (message) => challengeStdout.push(message),
      writeError: (message) => challengeStderr.push(message),
    });

    assert.equal(challengeStatus, 0);
    assert.deepEqual(challengeStdout, []);
    assert.doesNotMatch(challengeStderr.join("\n"), /This result must be discarded/);
    assert.equal(challengeInput.closeCalls, 1);

    const reviewInput = testInput([
      { type: "line", line: "Use a durable queue." },
      { type: "line", line: "/submit" },
      { type: "line", line: "/finish" },
    ]);
    const reviewStdout: string[] = [];
    const reviewOperations = fakeLabOperations({
      async generateReview() {
        reviewInput.latch({ type: "eof" });
        return { ok: true, value: structuredClone(labReview) };
      },
    });

    const reviewStatus = await runBirbalCli(["lab"], {
      loadEnvironment() {},
      loadRuntime: async () => labRuntime(reviewOperations),
      loadTerminalInput: async () => reviewInput,
      writeOutput: (message) => reviewStdout.push(message),
      writeError() {},
    });

    assert.equal(reviewStatus, 0);
    assert.equal(reviewStdout.length, 1);
    assert.match(reviewStdout[0]!, /^Architecture Review/m);
    assert.equal(reviewInput.closeCalls, 1);
  });

  it("lets SIGINT replace EOF while a lab operation is active", async () => {
    const readlineInterface = new CliReadlineInterface();
    const interruptSignalSource = new EventEmitter();
    const input = createReadlineTerminalInput({
      input: new PassThrough(),
      interactionOutput: new PassThrough(),
      maxQueuedCharacters: 1_024,
      interruptSignalSource,
      createInterface: () => readlineInterface,
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    const operations = fakeLabOperations({
      async prepareCase() {
        readlineInterface.emit("close");
        interruptSignalSource.emit("SIGINT");
        return { ok: true, value: structuredClone(labBrief) };
      },
    });

    const status = await runBirbalCli(["lab"], {
      loadEnvironment() {},
      loadRuntime: async () => labRuntime(operations),
      loadTerminalInput: async () => input,
      writeOutput: (message) => stdout.push(message),
      writeError: (message) => stderr.push(message),
    });

    assert.equal(status, 130);
    assert.deepEqual(stdout, []);
    assert.doesNotMatch(stderr.join("\n"), /Architecture Case:/);
    assert.deepEqual(input.getTerminalOutcome(), { type: "interrupted" });
    assert.equal(interruptSignalSource.listenerCount("SIGINT"), 0);
  });

  it("reports one actionable phase failure and still closes the adapter", async () => {
    const input = testInput();
    const stdout: string[] = [];
    const stderr: string[] = [];
    const operations = fakeLabOperations({
      async prepareCase() {
        return {
          ok: false,
          error: {
            type: "architecture_lab_operation_error",
            phase: "case_research",
            code: "research_failed",
            message: "Could not ground an architecture case. Try a named case.",
          },
        };
      },
    });

    const status = await runBirbalCli(["lab"], {
      loadEnvironment() {},
      loadRuntime: async () => labRuntime(operations),
      loadTerminalInput: async () => input,
      writeOutput: (message) => stdout.push(message),
      writeError: (message) => stderr.push(message),
    });

    assert.equal(status, 1);
    assert.deepEqual(stdout, []);
    assert.equal(
      stderr.filter(
        (message) => message === "Could not ground an architecture case. Try a named case.",
      ).length,
      1,
    );
    assert.equal(input.closeCalls, 1);
  });

  it("reports an unexpected startup failure and still closes the adapter", async () => {
    const input = testInput();
    const stdout: string[] = [];
    const stderr: string[] = [];

    const status = await runBirbalCli(["lab"], {
      loadEnvironment() {},
      loadRuntime: async () => {
        throw new Error(`provider failed ${String.fromCharCode(27)}[31msecret detail`);
      },
      loadTerminalInput: async () => input,
      writeOutput: (message) => stdout.push(message),
      writeError: (message) => stderr.push(message),
    });

    assert.equal(status, 1);
    assert.deepEqual(stdout, []);
    assert.deepEqual(stderr, [
      "The Architecture Case Lab failed. Start a fresh lab session to try again.",
    ]);
    assert.doesNotMatch(stderr.join("\n"), /provider failed|secret detail/);
    assert.equal(stderr.join("\n").includes(String.fromCharCode(27)), false);
    assert.equal(input.closeCalls, 1);
  });

  it("completes after three answered challenges without generating a fourth", async () => {
    const input = testInput([
      { type: "line", line: "Initial proposal" },
      { type: "line", line: "/submit" },
      { type: "line", line: "First answer" },
      { type: "line", line: "/submit" },
      { type: "line", line: "Second answer" },
      { type: "line", line: "/submit" },
      { type: "line", line: "Third answer" },
      { type: "line", line: "/submit" },
    ]);
    const rounds: number[] = [];
    const stdout: string[] = [];
    const operations = fakeLabOperations({
      async generateChallenge(request) {
        rounds.push(request.round);
        return {
          ok: true,
          value: { dimension: "reliability", question: `Question ${request.round}` },
        };
      },
    });

    const status = await runBirbalCli(["lab"], {
      loadEnvironment() {},
      loadRuntime: async () => labRuntime(operations),
      loadTerminalInput: async () => input,
      writeOutput: (message) => stdout.push(message),
      writeError() {},
    });

    assert.equal(status, 0);
    assert.deepEqual(rounds, [1, 2, 3]);
    assert.equal(stdout.length, 1);
    assert.match(stdout[0]!, /^Architecture Review/m);
    assert.equal(input.closeCalls, 1);
  });

  it("returns from a piped EOF lab invocation without retaining an input handle", () => {
    const script = [
      'const { runBirbalCli } = await import("./src/app/cli.ts");',
      "const status = await runBirbalCli(['lab'], {",
      "  loadEnvironment() {},",
      "  loadRuntime: async () => ({",
      "    createLabSession: ({ input }) => ({",
      "      getState: () => 'idle',",
      "      run: async () => (await input.read()).type === 'eof' ? ({ type: 'exited' }) : ({ type: 'failed', error: { code: 'input_failed', message: 'unexpected input' }, output: 'unexpected input' }),",
      "    }),",
      "    renderToolsForPrompt: () => '',",
      "    runAgent: async () => '',",
      "  }),",
      "  writeOutput() {},",
      "  writeError() {},",
      "});",
      "process.exitCode = status;",
    ].join("\n");
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      { cwd: process.cwd(), encoding: "utf8", input: "", timeout: 5_000 },
    );

    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
  });

  it("lists the lab alongside the existing research workflow", () => {
    const topLevelHelp = runCli(["--help"]);

    assert.equal(topLevelHelp.status, 0, topLevelHelp.stderr);
    assert.match(
      topLevelHelp.stdout,
      /Local AI agent for source-linked research and architecture learning/,
    );
    assert.match(topLevelHelp.stdout, /agent/);
    assert.match(topLevelHelp.stdout, /lab/);
    assert.match(topLevelHelp.stdout, /research/);
    assert.doesNotMatch(topLevelHelp.stdout, /daily|digest|newsletter|pipeline|use-cases/i);
  });
});
