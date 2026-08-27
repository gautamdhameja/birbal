import type { ModelClient } from "../../framework/llm/types.js";
import type { DebugWarnLogger } from "../../framework/logging/debug-warn.js";

export type CaseSelection = "learner" | "automatic";
export type EvidenceQuality = "sufficient" | "limited";
export type ArchitectureLabPhase =
  | "case_research"
  | "case_brief"
  | "opening_safety"
  | "challenge"
  | "architecture_evidence"
  | "review";

export type EvidenceSource = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  excerpt: string;
};

export type CitedClaim = {
  claim: string;
  sourceIds: string[];
};

export type SourceDossier = {
  caseName: string;
  problem: string;
  actors: string[];
  constraints: string[];
  desiredOutcome: CitedClaim;
  sources: EvidenceSource[];
};

export type CaseBriefSource = Omit<EvidenceSource, "excerpt">;

export type CaseBrief = {
  title: string;
  problem: string;
  actors: string[];
  constraints: string[];
  desiredOutcome: CitedClaim;
  evidenceQuality: EvidenceQuality;
  sources: CaseBriefSource[];
};

export type LeakageCategory = "reference_design" | "vendor_implementation" | "complete_solution";

export type OpeningSafetyCheck =
  | {
      safe: true;
      leakage: [];
      reason: string;
    }
  | {
      safe: false;
      leakage: LeakageCategory[];
      reason: string;
    };

export type DesignDimension =
  | "control_flow"
  | "tool_boundaries"
  | "state"
  | "safety"
  | "evaluation"
  | "reliability"
  | "human_oversight";

export type ArchitectureChallenge = {
  dimension: DesignDimension;
  question: string;
};

export type LabTranscriptTurn = {
  role: "learner" | "birbal";
  phase: "proposal" | "challenge" | "answer";
  content: string;
};

export type ArchitectureEvidenceClaim = {
  id: string;
  claim: string;
  sourceIds: string[];
};

export type ArchitectureEvidence = {
  claims: ArchitectureEvidenceClaim[];
  sources: EvidenceSource[];
  evidenceQuality: EvidenceQuality;
};

export type SupportedFact = {
  claim: string;
  sourceIds: string[];
};

export type ArchitectureReview = {
  strengths: string[];
  unresolvedRisks: string[];
  missingComponents: string[];
  alternatives: string[];
  supportedFacts: SupportedFact[];
  inferences: string[];
  judgments: string[];
  nextChallenge: string;
  evidenceQuality: EvidenceQuality;
};

export type CaseResearchRequest = {
  phase: "case_setup";
  selection: CaseSelection;
  caseName?: string;
};

export type ArchitectureEvidenceResearchRequest = {
  phase: "architecture_evidence";
  brief: CaseBrief;
  transcript: LabTranscriptTurn[];
};

export type ArchitectureLabResearchRequest =
  | CaseResearchRequest
  | ArchitectureEvidenceResearchRequest;

export type ArchitectureLabOperationErrorCode =
  | "research_failed"
  | "invalid_research_output"
  | "insufficient_evidence"
  | "invalid_evidence"
  | "model_failed"
  | "invalid_model_output"
  | "unsafe_opening";

export type ArchitectureLabOperationError = {
  type: "architecture_lab_operation_error";
  phase: ArchitectureLabPhase;
  code: ArchitectureLabOperationErrorCode;
  message: string;
  repairAttempted?: boolean;
};

export type ArchitectureLabResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ArchitectureLabOperationError };

export type ArchitectureLabResearchResult = ArchitectureLabResult<
  SourceDossier | ArchitectureEvidence
>;

export type ArchitectureLabResearchOperation = (
  request: ArchitectureLabResearchRequest,
) => Promise<ArchitectureLabResearchResult>;

export type PrepareCaseRequest = {
  caseName?: string;
};

export type OpeningSafetyRequest = {
  opening: string;
};

export type GenerateChallengeRequest = {
  brief: CaseBrief;
  transcript: LabTranscriptTurn[];
  round: number;
};

export type GenerateReviewRequest = {
  brief: CaseBrief;
  transcript: LabTranscriptTurn[];
};

export type PrepareCaseResult = ArchitectureLabResult<CaseBrief>;
export type OpeningSafetyResult = ArchitectureLabResult<OpeningSafetyCheck>;
export type ChallengeResult = ArchitectureLabResult<ArchitectureChallenge>;
export type ArchitectureEvidenceResult = ArchitectureLabResult<ArchitectureEvidence>;
export type ReviewResult = ArchitectureLabResult<ArchitectureReview>;

export type ArchitectureLabOperations = {
  prepareCase(request: PrepareCaseRequest): Promise<PrepareCaseResult>;
  checkOpeningSafety(request: OpeningSafetyRequest): Promise<OpeningSafetyResult>;
  generateChallenge(request: GenerateChallengeRequest): Promise<ChallengeResult>;
  gatherArchitectureEvidence(request: GenerateReviewRequest): Promise<ArchitectureEvidenceResult>;
  generateReview(request: GenerateReviewRequest): Promise<ReviewResult>;
};

export type ArchitectureLabOperationsDependencies = {
  research: ArchitectureLabResearchOperation;
  completeFn: ModelClient["complete"];
  now?: () => Date;
  logger?: DebugWarnLogger;
};
