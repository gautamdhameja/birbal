import type {
  ArchitectureChallenge,
  ArchitectureLabOperationError,
  ArchitectureReview,
  CaseBrief,
} from "./types.js";
import { ARCHITECTURE_LAB_SESSION_LIMITS } from "./constants.js";

export type ArchitectureLabProgressPhase =
  | "case_research"
  | "challenge"
  | "architecture_evidence"
  | "review";

export type ArchitectureLabRetry =
  | { reason: "blank"; limit: number }
  | { reason: "turn_too_long"; limit: number }
  | { reason: "transcript_too_long"; limit: number }
  | { reason: "proposal_required" }
  | { reason: "draft_pending" };

function list(items: readonly string[]): string {
  return items.length === 0 ? "- None identified." : items.map((item) => `- ${item}`).join("\n");
}

function formatDimension(dimension: ArchitectureChallenge["dimension"]): string {
  return dimension.replaceAll("_", " ").replace(/^./, (first) => first.toUpperCase());
}

export function renderCaseBrief(brief: CaseBrief): string {
  const actors = list(brief.actors);
  const constraints = list(brief.constraints);
  const sources = brief.sources
    .map((source) => `- [${source.id}] ${source.title} (${source.publishedAt}): ${source.url}`)
    .join("\n");

  return [
    `Architecture Case: ${brief.title}`,
    "",
    "Problem:",
    brief.problem,
    "",
    "Actors:",
    actors,
    "",
    "Constraints:",
    constraints,
    "",
    "Desired outcome:",
    `${brief.desiredOutcome.claim} [${brief.desiredOutcome.sourceIds.join(", ")}]`,
    "",
    `Evidence status: ${brief.evidenceQuality}`,
    "",
    "Sources:",
    sources,
    "",
    "Propose an architecture, then enter /submit on its own line.",
  ].join("\n");
}

export function renderArchitectureChallenge(
  challenge: ArchitectureChallenge,
  round: number,
): string {
  return [
    `Challenge — Round ${round} — ${formatDimension(challenge.dimension)}`,
    challenge.question,
    "",
    "Enter your answer, then enter /submit on its own line. Use /finish for a review or /exit to leave.",
  ].join("\n");
}

export function renderArchitectureReview(review: ArchitectureReview): string {
  const facts = review.supportedFacts.map((fact) => `${fact.claim} [${fact.sourceIds.join(", ")}]`);
  return [
    "Architecture Review",
    "",
    "Strengths:",
    list(review.strengths),
    "",
    "Unresolved risks:",
    list(review.unresolvedRisks),
    "",
    "Missing components:",
    list(review.missingComponents),
    "",
    "Supported facts:",
    list(facts),
    "",
    "Architectural inference:",
    list(review.inferences),
    "",
    "Evaluative judgment:",
    list(review.judgments),
    "",
    `Evidence status: ${review.evidenceQuality}`,
    "",
    "Alternatives:",
    list(review.alternatives),
    "",
    "Next learning challenge:",
    review.nextChallenge,
  ].join("\n");
}

export function renderProgress(phase: ArchitectureLabProgressPhase): string {
  switch (phase) {
    case "case_research":
      return "Researching the architecture case...";
    case "challenge":
      return "Preparing a focused architecture challenge...";
    case "architecture_evidence":
      return "Researching post-attempt architecture evidence...";
    case "review":
      return "Preparing the sourced architecture review...";
  }
}

export function renderRetry(retry: ArchitectureLabRetry): string {
  switch (retry.reason) {
    case "blank":
      return `Enter a nonblank response, then /submit (maximum ${retry.limit.toLocaleString("en-US")} characters).`;
    case "turn_too_long":
      return `The current draft exceeds the ${retry.limit.toLocaleString("en-US")} character turn limit. Shorten it before /submit.`;
    case "transcript_too_long":
      return `The session transcript would exceed ${retry.limit.toLocaleString("en-US")} characters. Shorten the current draft or use /finish.`;
    case "proposal_required":
      return "Submit a nonblank architecture proposal with /submit before requesting a review.";
    case "draft_pending":
      return "The current draft is not submitted. Enter /submit before using /finish.";
  }
}

export function renderArchitectureLabFailure(error: {
  code: "case_name_too_long" | "input_failed" | "transcript_too_long" | "operation_failed";
  operation?: ArchitectureLabOperationError;
}): string {
  switch (error.code) {
    case "case_name_too_long":
      return `The case name exceeds the ${ARCHITECTURE_LAB_SESSION_LIMITS.caseNameCharacters} character limit.`;
    case "input_failed":
      return "Terminal input failed. Start a fresh lab session to try again.";
    case "transcript_too_long":
      return "The generated challenge would exceed the session transcript limit.";
    case "operation_failed":
      return error.operation?.message ?? "The Architecture Case Lab operation failed.";
  }
}
