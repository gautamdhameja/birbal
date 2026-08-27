import {
  renderArchitectureChallenge,
  renderArchitectureLabFailure,
  renderArchitectureReview,
  renderCaseBrief,
  renderProgress,
  renderRetry,
  type ArchitectureLabProgressPhase,
  type ArchitectureLabRetry,
} from "./render.js";
import { ARCHITECTURE_LAB_SESSION_LIMITS } from "./constants.js";
import type {
  ArchitectureChallenge,
  ArchitectureLabInput,
  ArchitectureLabInputPort,
  ArchitectureLabOperationError,
  ArchitectureLabOperations,
  ArchitectureLabResult,
  ArchitectureReview,
  CaseBrief,
  LabTranscriptTurn,
} from "./types.js";

export { ARCHITECTURE_LAB_SESSION_LIMITS } from "./constants.js";
export type {
  ArchitectureLabInput,
  ArchitectureLabInputPort,
  ArchitectureLabTerminalInput,
} from "./types.js";

export type ArchitectureLabSessionState =
  | "idle"
  | "preparing"
  | "awaiting_proposal"
  | "generating_challenge"
  | "awaiting_answer"
  | "generating_review"
  | "completed"
  | "exited"
  | "interrupted"
  | "failed";

export type ArchitectureLabSessionOutput =
  | {
      type: "progress";
      phase: ArchitectureLabProgressPhase;
      content: string;
    }
  | {
      type: "case_brief";
      brief: CaseBrief;
      content: string;
    }
  | {
      type: "challenge";
      challenge: ArchitectureChallenge;
      round: number;
      content: string;
    }
  | ({ type: "retry"; content: string } & ArchitectureLabRetry);

export type ArchitectureLabSessionFailure = {
  code: "case_name_too_long" | "input_failed" | "transcript_too_long" | "operation_failed";
  message: string;
  operation?: ArchitectureLabOperationError;
};

export type ArchitectureLabSessionResult =
  | { type: "completed"; review: ArchitectureReview; output: string }
  | { type: "exited" }
  | { type: "interrupted" }
  | { type: "failed"; error: ArchitectureLabSessionFailure; output: string };

export type ArchitectureLabSession = {
  run(request?: { caseName?: string }): Promise<ArchitectureLabSessionResult>;
  getState(): ArchitectureLabSessionState;
};

type ArchitectureLabSessionDependencies = {
  operations: ArchitectureLabOperations;
  input: ArchitectureLabInputPort;
  onOutput?: (output: ArchitectureLabSessionOutput) => void;
};

type WaitingState = "awaiting_proposal" | "awaiting_answer";

function transcriptLength(transcript: readonly LabTranscriptTurn[]): number {
  return transcript.reduce((total, turn) => total + turn.content.length, 0);
}

function isCommand(line: string, command: "/submit" | "/finish" | "/exit"): boolean {
  return line.trim().toLowerCase() === command;
}

export function createArchitectureLabSession({
  operations,
  input,
  onOutput = () => {},
}: ArchitectureLabSessionDependencies): ArchitectureLabSession {
  let state: ArchitectureLabSessionState = "idle";
  let runPromise: Promise<ArchitectureLabSessionResult> | undefined;
  let caseBrief: CaseBrief | undefined;
  const transcript: LabTranscriptTurn[] = [];
  let round = 0;
  let draftLines: string[] = [];

  function finish(result: ArchitectureLabSessionResult): ArchitectureLabSessionResult {
    state = result.type;
    return result;
  }

  function emit(output: ArchitectureLabSessionOutput): void {
    onOutput(structuredClone(output));
  }

  function progress(phase: ArchitectureLabProgressPhase): void {
    emit({ type: "progress", phase, content: renderProgress(phase) });
  }

  function retry(retryValue: ArchitectureLabRetry): void {
    emit({ type: "retry", ...retryValue, content: renderRetry(retryValue) });
  }

  function failed(
    code: ArchitectureLabSessionFailure["code"],
    operation?: ArchitectureLabOperationError,
  ): ArchitectureLabSessionResult {
    const failureShape = { code, ...(operation ? { operation } : {}) };
    const message = renderArchitectureLabFailure(failureShape);
    return finish({
      type: "failed",
      error: { ...failureShape, message },
      output: message,
    });
  }

  async function callOperationSafely<T>(
    call: () => Promise<ArchitectureLabResult<T>>,
    fallbackError: ArchitectureLabOperationError,
  ): Promise<ArchitectureLabResult<T>> {
    try {
      return await call();
    } catch {
      return { ok: false, error: fallbackError };
    }
  }

  function terminalAfterOperation(options: {
    eofWins: boolean;
  }): ArchitectureLabSessionResult | undefined {
    const outcome = input.getTerminalOutcome();
    if (outcome?.type === "input_error") {
      return failed("input_failed");
    }
    if (outcome?.type === "interrupted") {
      return finish({ type: "interrupted" });
    }
    if (outcome?.type === "eof" && options.eofWins) {
      return finish({ type: "exited" });
    }
    return undefined;
  }

  async function readInput(): Promise<ArchitectureLabInput> {
    try {
      return await input.read();
    } catch {
      return { type: "input_error" };
    }
  }

  function handleTerminalInput(
    event: ArchitectureLabInput,
  ): ArchitectureLabSessionResult | undefined {
    switch (event.type) {
      case "line":
        return undefined;
      case "eof":
        return finish({ type: "exited" });
      case "interrupted":
        return finish({ type: "interrupted" });
      case "input_error":
        return failed("input_failed");
    }
  }

  function appendDraft(line: string): void {
    const separatorLength = draftLines.length === 0 ? 0 : 1;
    const nextLength = draftLines.join("\n").length + separatorLength + line.length;
    if (nextLength > ARCHITECTURE_LAB_SESSION_LIMITS.turnCharacters) {
      retry({
        reason: "turn_too_long",
        limit: ARCHITECTURE_LAB_SESSION_LIMITS.turnCharacters,
      });
      return;
    }
    draftLines.push(line);
  }

  function takeDraft(): string | undefined {
    const content = draftLines.join("\n").trim();
    if (!content) {
      retry({ reason: "blank", limit: ARCHITECTURE_LAB_SESSION_LIMITS.turnCharacters });
      draftLines = [];
      return undefined;
    }
    if (
      transcriptLength(transcript) + content.length >
      ARCHITECTURE_LAB_SESSION_LIMITS.transcriptCharacters
    ) {
      draftLines = [];
      retry({
        reason: "transcript_too_long",
        limit: ARCHITECTURE_LAB_SESSION_LIMITS.transcriptCharacters,
      });
      return undefined;
    }
    draftLines = [];
    return content;
  }

  async function awaitCommittedTurn(
    waitingState: WaitingState,
  ): Promise<
    { type: "turn"; content: string } | { type: "finish" } | ArchitectureLabSessionResult
  > {
    state = waitingState;
    while (true) {
      const event = await readInput();
      const terminal = handleTerminalInput(event);
      if (terminal) {
        return terminal;
      }
      if (event.type !== "line") {
        continue;
      }
      if (isCommand(event.line, "/exit")) {
        return finish({ type: "exited" });
      }
      if (isCommand(event.line, "/finish")) {
        if (draftLines.length > 0) {
          retry({ reason: "draft_pending" });
          continue;
        }
        if (waitingState === "awaiting_proposal") {
          retry({ reason: "proposal_required" });
          continue;
        }
        return { type: "finish" };
      }
      if (isCommand(event.line, "/submit")) {
        const content = takeDraft();
        if (content !== undefined) {
          return { type: "turn", content };
        }
        continue;
      }
      appendDraft(event.line);
    }
  }

  async function callPrepareCase(caseName?: string) {
    return callOperationSafely(
      () => operations.prepareCase({ ...(caseName ? { caseName } : {}) }),
      {
        type: "architecture_lab_operation_error",
        phase: "case_research",
        code: "research_failed",
        message: "Lab research failed.",
      },
    );
  }

  async function callOpeningSafety(opening: string) {
    return callOperationSafely(() => operations.checkOpeningSafety({ opening }), {
      type: "architecture_lab_operation_error",
      phase: "opening_safety",
      code: "model_failed",
      message: "The opening_safety model call failed.",
    });
  }

  async function generateChallenge(): Promise<ArchitectureLabSessionResult | undefined> {
    const activeBrief = caseBrief;
    if (!activeBrief) {
      throw new Error("Architecture Lab invariant violated: challenge without a case brief.");
    }
    state = "generating_challenge";
    progress("challenge");
    const nextRound = round + 1;
    const result = await callOperationSafely(
      () =>
        operations.generateChallenge({
          brief: structuredClone(activeBrief),
          transcript: structuredClone(transcript),
          round: nextRound,
        }),
      {
        type: "architecture_lab_operation_error",
        phase: "challenge",
        code: "model_failed",
        message: "The challenge model call failed.",
      },
    );
    const terminal = terminalAfterOperation({ eofWins: true });
    if (terminal) {
      return terminal;
    }
    if (!result.ok) {
      return failed("operation_failed", result.error);
    }
    const challenge = structuredClone(result.value);
    if (
      transcriptLength(transcript) + challenge.question.length >
      ARCHITECTURE_LAB_SESSION_LIMITS.transcriptCharacters
    ) {
      return failed("transcript_too_long");
    }
    round = nextRound;
    transcript.push({
      role: "birbal",
      phase: "challenge",
      dimension: challenge.dimension,
      content: challenge.question,
    });
    emit({
      type: "challenge",
      challenge,
      round,
      content: renderArchitectureChallenge(challenge, round),
    });
    return undefined;
  }

  async function generateReview(): Promise<ArchitectureLabSessionResult> {
    const activeBrief = caseBrief;
    if (!activeBrief) {
      throw new Error("Architecture Lab invariant violated: review without a case brief.");
    }
    state = "generating_review";
    progress("architecture_evidence");
    const reviewContext = {
      brief: structuredClone(activeBrief),
      transcript: structuredClone(transcript),
    };
    const evidenceResult = await callOperationSafely(
      () =>
        operations.gatherArchitectureEvidence({
          brief: structuredClone(reviewContext.brief),
          transcript: structuredClone(reviewContext.transcript),
        }),
      {
        type: "architecture_lab_operation_error",
        phase: "architecture_evidence",
        code: "research_failed",
        message: "Architecture evidence research failed.",
      },
    );
    const afterEvidence = terminalAfterOperation({ eofWins: false });
    if (afterEvidence) {
      return afterEvidence;
    }
    if (!evidenceResult.ok) {
      return failed("operation_failed", evidenceResult.error);
    }

    progress("review");
    const reviewResult = await callOperationSafely(
      () =>
        operations.generateReview({
          ...reviewContext,
          evidence: structuredClone(evidenceResult.value),
        }),
      {
        type: "architecture_lab_operation_error",
        phase: "review",
        code: "model_failed",
        message: "The review model call failed.",
      },
    );
    const afterReview = terminalAfterOperation({ eofWins: false });
    if (afterReview) {
      return afterReview;
    }
    if (!reviewResult.ok) {
      return failed("operation_failed", reviewResult.error);
    }
    const completedReview = structuredClone(reviewResult.value);
    return finish({
      type: "completed",
      review: completedReview,
      output: renderArchitectureReview(completedReview),
    });
  }

  async function execute(request: { caseName?: string }): Promise<ArchitectureLabSessionResult> {
    const caseName = request.caseName?.trim();
    if (caseName && caseName.length > ARCHITECTURE_LAB_SESSION_LIMITS.caseNameCharacters) {
      return failed("case_name_too_long");
    }

    state = "preparing";
    progress("case_research");
    const prepared = await callPrepareCase(caseName);
    const afterPreparation = terminalAfterOperation({ eofWins: true });
    if (afterPreparation) {
      return afterPreparation;
    }
    if (!prepared.ok) {
      return failed("operation_failed", prepared.error);
    }

    const candidateBrief = structuredClone(prepared.value);
    const opening = renderCaseBrief(candidateBrief);
    const safety = await callOpeningSafety(opening);
    const afterSafety = terminalAfterOperation({ eofWins: true });
    if (afterSafety) {
      return afterSafety;
    }
    if (!safety.ok) {
      return failed("operation_failed", safety.error);
    }
    if (!safety.value.safe) {
      return failed("operation_failed", {
        type: "architecture_lab_operation_error",
        phase: "opening_safety",
        code: "unsafe_opening",
        message: `Rendered opening failed the leakage gate: ${safety.value.reason}`,
      });
    }

    caseBrief = candidateBrief;
    emit({ type: "case_brief", brief: structuredClone(caseBrief), content: opening });

    const proposal = await awaitCommittedTurn("awaiting_proposal");
    if (proposal.type !== "turn") {
      return proposal.type === "finish" ? failed("input_failed") : proposal;
    }
    transcript.push({ role: "learner", phase: "proposal", content: proposal.content });

    const firstChallengeTerminal = await generateChallenge();
    if (firstChallengeTerminal) {
      return firstChallengeTerminal;
    }

    while (true) {
      const answer = await awaitCommittedTurn("awaiting_answer");
      if (answer.type === "finish") {
        return generateReview();
      }
      if (answer.type !== "turn") {
        return answer;
      }
      transcript.push({ role: "learner", phase: "answer", content: answer.content });

      if (round >= ARCHITECTURE_LAB_SESSION_LIMITS.challengeRounds) {
        return generateReview();
      }
      const challengeTerminal = await generateChallenge();
      if (challengeTerminal) {
        return challengeTerminal;
      }
    }
  }

  return {
    run(request = {}) {
      runPromise ??= execute(request);
      return runPromise;
    },
    getState() {
      return state;
    },
  };
}
