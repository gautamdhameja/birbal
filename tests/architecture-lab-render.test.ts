import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  renderArchitectureChallenge,
  renderArchitectureLabFailure,
  renderArchitectureReview,
  renderCaseBrief,
} from "../src/app/architecture-lab/render.js";
import type {
  ArchitectureChallenge,
  ArchitectureReview,
  CaseBrief,
} from "../src/app/architecture-lab/types.js";

function isUnsafeTerminalCodePoint(codePoint: number): boolean {
  return (
    codePoint <= 0x08 ||
    (codePoint >= 0x0b && codePoint <= 0x1f) ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    codePoint === 0x061c ||
    codePoint === 0x200e ||
    codePoint === 0x200f ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069)
  );
}

const CONTROL_PAYLOAD = [
  "visible",
  "\u001b]52;c;SGVsbG8=\u0007",
  "\u001b[31mred",
  "before\rafter",
  "left\u202Eright\u2069",
].join(" ");

function assertTerminalSafe(rendered: string): void {
  assert.equal(
    [...rendered].some((character) => isUnsafeTerminalCodePoint(character.codePointAt(0)!)),
    false,
  );
  assert.match(rendered, /visible/);
}

describe("Architecture Case Lab terminal rendering", () => {
  it("sanitizes case, source, challenge, review, and failure payloads", () => {
    const source = {
      id: "source-1",
      title: `Source ${CONTROL_PAYLOAD}`,
      url: `https://example.com/${CONTROL_PAYLOAD}`,
      publishedAt: "2026-08-27",
    };
    const brief: CaseBrief = {
      title: `Case ${CONTROL_PAYLOAD}`,
      problem: `Problem with preserved\tcontext ${CONTROL_PAYLOAD}`,
      actors: [`Actor ${CONTROL_PAYLOAD}`],
      constraints: [`Constraint ${CONTROL_PAYLOAD}`],
      desiredOutcome: { claim: `Outcome ${CONTROL_PAYLOAD}`, sourceIds: [source.id] },
      evidenceQuality: "limited",
      sources: [source],
    };
    const challenge: ArchitectureChallenge = {
      dimension: "safety",
      question: `How is this contained ${CONTROL_PAYLOAD}?`,
    };
    const review: ArchitectureReview = {
      strengths: [`Strength ${CONTROL_PAYLOAD}`],
      unresolvedRisks: [`Risk ${CONTROL_PAYLOAD}`],
      missingComponents: [`Missing ${CONTROL_PAYLOAD}`],
      alternatives: [`Alternative ${CONTROL_PAYLOAD}`],
      supportedFacts: [{ claim: `Fact ${CONTROL_PAYLOAD}`, sourceIds: [source.id] }],
      inferences: [`Inference ${CONTROL_PAYLOAD}`],
      judgments: [`Judgment ${CONTROL_PAYLOAD}`],
      nextChallenge: `Next ${CONTROL_PAYLOAD}`,
      evidenceQuality: "limited",
      sources: [source],
    };
    const failure = renderArchitectureLabFailure({
      code: "operation_failed",
      operation: {
        type: "architecture_lab_operation_error",
        phase: "review",
        code: "model_failed",
        message: `Failure ${CONTROL_PAYLOAD}`,
      },
    });

    const renderedCase = renderCaseBrief(brief);
    for (const rendered of [
      renderedCase,
      renderArchitectureChallenge(challenge, 1),
      renderArchitectureReview(review),
      failure,
    ]) {
      assertTerminalSafe(rendered);
    }
    assert.match(renderedCase, /Problem with preserved\tcontext/);
    assert.match(renderedCase, /\nSources:\n/);
  });
});
