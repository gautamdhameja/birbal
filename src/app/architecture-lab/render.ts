import type {
  ArchitectureChallenge,
  ArchitectureLabProgressPhase,
  ArchitectureLabRetry,
  ArchitectureLabSessionFailure,
  ArchitectureReview,
  CaseBrief,
} from "./types.js";
import { ARCHITECTURE_LAB_SESSION_LIMITS } from "./constants.js";

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

function sanitizeTerminalOutput(value: string): string {
  return [...value]
    .filter((character) => !isUnsafeTerminalCodePoint(character.codePointAt(0)!))
    .join("");
}

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

  return sanitizeTerminalOutput(
    [
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
    ].join("\n"),
  );
}

export function renderArchitectureChallenge(
  challenge: ArchitectureChallenge,
  round: number,
): string {
  return sanitizeTerminalOutput(
    [
      `Challenge — Round ${round} — ${formatDimension(challenge.dimension)}`,
      challenge.question,
      "",
      "Enter your answer, then enter /submit on its own line. Use /finish for a review or /exit to leave.",
    ].join("\n"),
  );
}

export function renderArchitectureReview(review: ArchitectureReview): string {
  const facts = review.supportedFacts.map((fact) => `${fact.claim} [${fact.sourceIds.join(", ")}]`);
  const sources = review.sources.map(
    (source) => `[${source.id}] ${source.title} (${source.publishedAt}): ${source.url}`,
  );
  return sanitizeTerminalOutput(
    [
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
      "Sources:",
      list(sources),
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
    ].join("\n"),
  );
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
      return `The response was not submitted because the session transcript would exceed ${retry.limit.toLocaleString("en-US")} characters. The draft was cleared; enter a shorter response and /submit, or use /finish.`;
    case "proposal_required":
      return "Submit a nonblank architecture proposal with /submit before requesting a review.";
    case "draft_pending":
      return "The current draft is not submitted. Enter /submit before using /finish.";
  }
}

export function renderArchitectureLabFailure(
  error: Pick<ArchitectureLabSessionFailure, "code" | "operation">,
): string {
  switch (error.code) {
    case "case_name_too_long":
      return sanitizeTerminalOutput(
        `The case name exceeds the ${ARCHITECTURE_LAB_SESSION_LIMITS.caseNameCharacters} character limit.`,
      );
    case "input_failed":
      return sanitizeTerminalOutput(
        "Terminal input failed. Start a fresh lab session to try again.",
      );
    case "transcript_too_long":
      return sanitizeTerminalOutput(
        "The generated challenge would exceed the session transcript limit.",
      );
    case "operation_failed":
      return sanitizeTerminalOutput(
        error.operation?.message ?? "The Architecture Case Lab operation failed.",
      );
  }
}
