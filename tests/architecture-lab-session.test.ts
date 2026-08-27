// Purpose: Proves the Architecture Case Lab's bounded, host-neutral session lifecycle.
// Scope: Covers U2 with scripted input and operation ports; no terminal or provider calls.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createArchitectureLabSession,
  type ArchitectureLabInput,
  type ArchitectureLabInputPort,
  type ArchitectureLabSessionOutput,
} from "../src/app/architecture-lab/session.js";
import {
  renderArchitectureChallenge,
  renderArchitectureReview,
  renderCaseBrief,
  renderProgress,
  renderRetry,
} from "../src/app/architecture-lab/render.js";
import { createArchitectureLabOperations } from "../src/app/architecture-lab/operations.js";
import type {
  ArchitectureChallenge,
  ArchitectureLabOperationError,
  ArchitectureLabOperations,
  ArchitectureReview,
  CaseBrief,
  GenerateChallengeRequest,
  GenerateReviewRequest,
  SourceDossier,
} from "../src/app/architecture-lab/types.js";

const brief: CaseBrief = {
  title: "AI support triage",
  problem: "Support queues delay urgent customer requests.",
  actors: ["customers", "support agents"],
  constraints: ["protect customer data", "escalate uncertain requests"],
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

const review: ArchitectureReview = {
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
};

const challenges: ArchitectureChallenge[] = [
  { dimension: "human_oversight", question: "When does a request reach a human?" },
  { dimension: "reliability", question: "How does the design recover after failure?" },
  { dimension: "evaluation", question: "How will you detect degraded outcomes?" },
];

type ScriptedInput = ArchitectureLabInputPort & {
  latch(outcome: Exclude<ArchitectureLabInput, { type: "line" }>): void;
};

function scriptedInput(events: ArchitectureLabInput[]): ScriptedInput {
  let terminalOutcome: Exclude<ArchitectureLabInput, { type: "line" }> | undefined;
  return {
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
    latch(outcome) {
      terminalOutcome = outcome;
    },
  };
}

type FakeOperations = ArchitectureLabOperations & {
  calls: {
    prepare: Array<{ caseName?: string }>;
    safety: string[];
    challenge: GenerateChallengeRequest[];
    review: GenerateReviewRequest[];
  };
};

function fakeOperations(overrides: Partial<ArchitectureLabOperations> = {}): FakeOperations {
  const calls: FakeOperations["calls"] = {
    prepare: [],
    safety: [],
    challenge: [],
    review: [],
  };
  let challengeIndex = 0;
  return {
    calls,
    async prepareCase(request) {
      calls.prepare.push(structuredClone(request));
      return { ok: true, value: structuredClone(brief) };
    },
    async checkOpeningSafety(request) {
      calls.safety.push(request.opening);
      return { ok: true, value: { safe: true, leakage: [], reason: "Problem framing only." } };
    },
    async generateChallenge(request) {
      calls.challenge.push(structuredClone(request));
      return {
        ok: true,
        value: structuredClone(challenges[challengeIndex++] ?? challenges.at(-1)!),
      };
    },
    async gatherArchitectureEvidence() {
      return {
        ok: true,
        value: {
          claims: [],
          sources: [
            {
              id: "support-study",
              title: "Support automation study",
              url: "https://research.example.org/support-study",
              publishedAt: "2026-01-10",
              excerpt: "Support workflows use explicit escalation.",
            },
          ],
          evidenceQuality: "sufficient",
        },
      };
    },
    async generateReview(request) {
      calls.review.push(structuredClone(request));
      return { ok: true, value: structuredClone(review) };
    },
    ...overrides,
  };
}

function runWith(
  events: ArchitectureLabInput[],
  operations = fakeOperations(),
  caseName: string | undefined = "AI support triage",
) {
  const outputs: ArchitectureLabSessionOutput[] = [];
  const input = scriptedInput(events);
  const session = createArchitectureLabSession({
    operations,
    input,
    onOutput: (output) => outputs.push(output),
  });
  return { input, operations, outputs, session, result: session.run({ caseName }) };
}

function operationFailure(phase: ArchitectureLabOperationError["phase"] = "challenge") {
  return {
    ok: false as const,
    error: {
      type: "architecture_lab_operation_error" as const,
      phase,
      code: "model_failed" as const,
      message: `The ${phase} model call failed.`,
    },
  };
}

describe("Architecture Case Lab renderer", () => {
  it("renders a source-linked opening without solution fields", () => {
    const rendered = renderCaseBrief(brief);

    assert.match(rendered, /^Architecture Case: AI support triage/m);
    assert.match(rendered, /^Problem:/m);
    assert.match(rendered, /^Actors:/m);
    assert.match(rendered, /^Constraints:/m);
    assert.match(rendered, /^Desired outcome:/m);
    assert.match(rendered, /^Evidence status: sufficient/m);
    assert.match(rendered, /\[support-study\].*https:\/\/research\.example\.org/m);
    assert.doesNotMatch(rendered, /reference architecture|vendor implementation/i);
  });

  it("keeps review evidence categories distinguishable through text alone", () => {
    const rendered = renderArchitectureReview(review);

    for (const heading of [
      "Strengths:",
      "Unresolved risks:",
      "Missing components:",
      "Supported facts:",
      "Architectural inference:",
      "Evaluative judgment:",
      "Evidence status:",
      "Alternatives:",
      "Next learning challenge:",
    ]) {
      assert.match(rendered, new RegExp(`^${heading}`, "m"));
    }
    assert.doesNotMatch(rendered, /\u001B\[/);
  });

  it("renders concise progress, challenge, and distinct retry messages", () => {
    assert.equal(renderProgress("case_research"), "Researching the architecture case...");
    assert.match(renderArchitectureChallenge(challenges[0]!, 1), /Round 1.*Human oversight/s);
    assert.match(renderRetry({ reason: "blank", limit: 8_000 }), /nonblank.*\/submit/i);
    assert.match(renderRetry({ reason: "turn_too_long", limit: 8_000 }), /8,000/);
    assert.match(renderRetry({ reason: "transcript_too_long", limit: 32_000 }), /32,000/);
    assert.match(renderRetry({ reason: "proposal_required" }), /proposal.*\/submit/i);
    assert.match(renderRetry({ reason: "draft_pending" }), /current draft.*\/submit/i);
  });
});

describe("Architecture Case Lab session", () => {
  it("uses the same learner-first opening for an automatically selected case", async () => {
    const run = runWith([{ type: "eof" }], fakeOperations(), "   ");

    assert.equal((await run.result).type, "exited");
    assert.deepEqual(run.operations.calls.prepare, [{}]);
    assert.equal(
      run.outputs.some((output) => output.type === "case_brief"),
      true,
    );
  });

  it("composes U1 case extraction with the renderer without exposing dossier implementation text", async () => {
    const dossier: SourceDossier = {
      caseName: "Support triage",
      problem: "Support queues delay urgent requests.",
      actors: ["customers", "support agents"],
      constraints: ["protect customer data"],
      desiredOutcome: {
        claim: "Reduce response delay.",
        sourceIds: ["source-1"],
      },
      sources: [
        {
          id: "source-1",
          title: "Implementation-heavy case study",
          url: "https://research.example.org/case",
          publishedAt: "2026-01-10",
          excerpt:
            "The vendor implementation used VendorFlow, a vector database, a router, and a reviewer in that order.",
        },
      ],
    };
    const completions = [
      JSON.stringify({
        ...brief,
        title: "Support triage",
        problem: dossier.problem,
        actors: dossier.actors,
        constraints: dossier.constraints,
        desiredOutcome: dossier.desiredOutcome,
        sources: dossier.sources.map(({ excerpt: _excerpt, ...source }) => source),
      }),
      JSON.stringify({
        safe: true,
        leakage: [],
        reason: "The rendered opening contains no implementation details.",
      }),
    ];
    const operations = createArchitectureLabOperations({
      now: () => new Date("2026-08-27T12:00:00.000Z"),
      research: async () => ({ ok: true, value: dossier }),
      completeFn: async () => completions.shift() ?? "",
    });
    const outputs: ArchitectureLabSessionOutput[] = [];
    const session = createArchitectureLabSession({
      operations,
      input: scriptedInput([{ type: "eof" }]),
      onOutput: (output) => outputs.push(output),
    });

    assert.equal((await session.run({ caseName: "Support triage" })).type, "exited");
    const opening = outputs.find((output) => output.type === "case_brief")?.content ?? "";
    assert.doesNotMatch(opening, /VendorFlow|vector database|router|reviewer/i);
  });

  it("fails closed when an operation returns an unsafe opening as a successful value", async () => {
    const operations = fakeOperations({
      async checkOpeningSafety() {
        return {
          ok: true,
          value: {
            safe: false,
            leakage: ["complete_solution"],
            reason: "The opening prescribes a complete solution.",
          },
        };
      },
    });
    const run = runWith([], operations);

    const result = await run.result;

    assert.equal(result.type, "failed");
    assert.equal(
      run.outputs.some((output) => output.type === "case_brief"),
      false,
    );
  });

  it("accumulates a multiline proposal until /submit and reaches a sourced review on /finish", async () => {
    const run = runWith([
      { type: "line", line: "A routing boundary classifies requests." },
      { type: "line", line: "Uncertain requests go to a human." },
      { type: "line", line: "/submit" },
      { type: "line", line: "/finish" },
    ]);

    const result = await run.result;

    assert.equal(result.type, "completed");
    assert.equal(run.operations.calls.challenge.length, 1);
    assert.equal(run.operations.calls.review.length, 1);
    assert.deepEqual(run.operations.calls.review[0]?.transcript, [
      {
        role: "learner",
        phase: "proposal",
        content: "A routing boundary classifies requests.\nUncertain requests go to a human.",
      },
      {
        role: "birbal",
        phase: "challenge",
        content: "When does a request reach a human?",
      },
    ]);
    assert.deepEqual(
      run.outputs.filter((output) => output.type === "progress").map((output) => output.phase),
      ["case_research", "challenge", "architecture_evidence", "review"],
    );
  });

  it("stops after three answered challenges and cannot request a fourth", async () => {
    const run = runWith([
      { type: "line", line: "proposal" },
      { type: "line", line: "/submit" },
      { type: "line", line: "answer one" },
      { type: "line", line: "/submit" },
      { type: "line", line: "answer two" },
      { type: "line", line: "/submit" },
      { type: "line", line: "answer three" },
      { type: "line", line: "/submit" },
    ]);

    assert.equal((await run.result).type, "completed");
    assert.deepEqual(
      run.operations.calls.challenge.map((request) => request.round),
      [1, 2, 3],
    );
    assert.equal(run.operations.calls.review.length, 1);
  });

  it("reprompts for blank, oversized, early-finish, and pending-draft input without model calls", async () => {
    const run = runWith([
      { type: "line", line: "/finish" },
      { type: "line", line: "/submit" },
      { type: "line", line: "x".repeat(8_001) },
      { type: "line", line: "valid proposal" },
      { type: "line", line: "/finish" },
      { type: "line", line: "/submit" },
      { type: "line", line: "/exit" },
    ]);

    assert.equal((await run.result).type, "exited");
    assert.equal(run.operations.calls.challenge.length, 1);
    assert.equal(run.operations.calls.review.length, 0);
    assert.deepEqual(
      run.outputs.filter((output) => output.type === "retry").map((output) => output.reason),
      ["proposal_required", "blank", "turn_too_long", "draft_pending"],
    );
  });

  it("accepts the transcript boundary and rejects one character over before generation", async () => {
    const boundaryOperations = fakeOperations({
      async generateChallenge(request) {
        boundaryOperations.calls.challenge.push(structuredClone(request));
        return {
          ok: true,
          value: { dimension: "state", question: "q".repeat(23_998) + "?" },
        };
      },
    });
    const accepted = runWith(
      [
        { type: "line", line: "p".repeat(8_000) },
        { type: "line", line: "/submit" },
        { type: "line", line: "a" },
        { type: "line", line: "/submit" },
      ],
      boundaryOperations,
    );

    const result = await accepted.result;

    assert.equal(result.type, "failed");
    assert.equal(boundaryOperations.calls.challenge.length, 2);
    assert.equal(
      boundaryOperations.calls.challenge[1]?.transcript.reduce(
        (sum, turn) => sum + turn.content.length,
        0,
      ),
      32_000,
    );

    const overOperations = fakeOperations({
      async generateChallenge(request) {
        overOperations.calls.challenge.push(structuredClone(request));
        return {
          ok: true,
          value: { dimension: "state", question: "q".repeat(23_998) + "?" },
        };
      },
    });
    const rejected = runWith(
      [
        { type: "line", line: "p".repeat(8_000) },
        { type: "line", line: "/submit" },
        { type: "line", line: "aa" },
        { type: "line", line: "/submit" },
        { type: "line", line: "/exit" },
      ],
      overOperations,
    );

    assert.equal((await rejected.result).type, "exited");
    assert.equal(overOperations.calls.challenge.length, 1);
    assert.ok(
      rejected.outputs.some(
        (output) => output.type === "retry" && output.reason === "transcript_too_long",
      ),
    );
  });

  it("maps EOF and input failures from both learner-waiting states", async () => {
    for (const terminalEvent of [{ type: "eof" as const }, { type: "input_error" as const }]) {
      const beforeProposal = runWith([terminalEvent]);
      assert.equal(
        (await beforeProposal.result).type,
        terminalEvent.type === "eof" ? "exited" : "failed",
      );

      const afterChallenge = runWith([
        { type: "line", line: "proposal" },
        { type: "line", line: "/submit" },
        terminalEvent,
      ]);
      assert.equal(
        (await afterChallenge.result).type,
        terminalEvent.type === "eof" ? "exited" : "failed",
      );
    }
  });

  it("maps SIGINT from both learner-waiting states to interrupted", async () => {
    const beforeProposal = runWith([{ type: "interrupted" }]);
    assert.equal((await beforeProposal.result).type, "interrupted");

    const afterChallenge = runWith([
      { type: "line", line: "proposal" },
      { type: "line", line: "/submit" },
      { type: "interrupted" },
    ]);
    assert.equal((await afterChallenge.result).type, "interrupted");
  });

  it("lets interruption and input failure discard an in-flight result", async () => {
    for (const terminalEvent of [
      { type: "interrupted" as const },
      { type: "input_error" as const },
    ]) {
      let input!: ScriptedInput;
      const operations = fakeOperations({
        async prepareCase() {
          await Promise.resolve();
          input.latch(terminalEvent);
          return { ok: true, value: structuredClone(brief) };
        },
      });
      const run = runWith([], operations);
      input = run.input;

      const result = await run.result;

      assert.equal(result.type, terminalEvent.type === "interrupted" ? "interrupted" : "failed");
      assert.equal(operations.calls.safety.length, 0);
      assert.equal(
        run.outputs.some((output) => output.type === "case_brief"),
        false,
      );
    }
  });

  it("lets EOF discard setup and challenge results but not a completed final review", async () => {
    let setupInput!: ScriptedInput;
    const setupOperations = fakeOperations({
      async prepareCase() {
        await Promise.resolve();
        setupInput.latch({ type: "eof" });
        return { ok: true, value: structuredClone(brief) };
      },
    });
    const setup = runWith([], setupOperations);
    setupInput = setup.input;
    assert.equal((await setup.result).type, "exited");

    let challengeInput!: ScriptedInput;
    const challengeOperations = fakeOperations({
      async generateChallenge() {
        await Promise.resolve();
        challengeInput.latch({ type: "eof" });
        return { ok: true, value: structuredClone(challenges[0]!) };
      },
    });
    const challenge = runWith(
      [
        { type: "line", line: "proposal" },
        { type: "line", line: "/submit" },
      ],
      challengeOperations,
    );
    challengeInput = challenge.input;
    assert.equal((await challenge.result).type, "exited");

    let reviewInput!: ScriptedInput;
    const reviewOperations = fakeOperations({
      async generateReview() {
        await Promise.resolve();
        reviewInput.latch({ type: "eof" });
        return { ok: true, value: structuredClone(review) };
      },
    });
    const final = runWith(
      [
        { type: "line", line: "proposal" },
        { type: "line", line: "/submit" },
        { type: "line", line: "/finish" },
      ],
      reviewOperations,
    );
    reviewInput = final.input;
    assert.equal((await final.result).type, "completed");
  });

  it("terminates on an operation failure and cannot restart the same instance", async () => {
    const operations = fakeOperations({
      async generateChallenge() {
        return operationFailure();
      },
    });
    const run = runWith(
      [
        { type: "line", line: "proposal" },
        { type: "line", line: "/submit" },
      ],
      operations,
    );

    const first = await run.result;
    const second = await run.session.run({ caseName: "different case" });

    assert.equal(first.type, "failed");
    assert.equal(second, first);
    assert.equal(operations.calls.prepare.length, 1);
  });

  it("creates fresh transcript and round state for every session", async () => {
    const operations = fakeOperations();
    const first = runWith(
      [
        { type: "line", line: "first proposal" },
        { type: "line", line: "/submit" },
        { type: "line", line: "/exit" },
      ],
      operations,
    );
    await first.result;

    const second = runWith(
      [
        { type: "line", line: "second proposal" },
        { type: "line", line: "/submit" },
        { type: "line", line: "/finish" },
      ],
      operations,
    );
    await second.result;

    assert.deepEqual(
      operations.calls.challenge.map((call) => call.round),
      [1, 1],
    );
    assert.equal(operations.calls.challenge[1]?.transcript[0]?.content, "second proposal");
    assert.doesNotMatch(JSON.stringify(operations.calls.challenge[1]), /first proposal/);
  });

  it("rejects an oversized case before calling an operation", async () => {
    const run = runWith([], fakeOperations(), "x".repeat(501));

    const result = await run.result;

    assert.equal(result.type, "failed");
    assert.equal(run.operations.calls.prepare.length, 0);
  });
});
