import type { ModelClient } from "../../framework/llm/types.js";
import type { DebugWarnLogger } from "../../framework/logging/debug-warn.js";
import type { z } from "zod";

import type { ARCHITECTURE_LAB } from "./constants.js";
import type {
  ArchitectureChallengeSchema,
  ArchitectureEvidenceClaimSchema,
  ArchitectureEvidenceSchema,
  ArchitectureReviewSchema,
  CaseBriefSchema,
  CaseBriefSourceSchema,
  CitedClaimSchema,
  DesignDimensionSchema,
  EvidenceQualitySchema,
  EvidenceSourceSchema,
  LabTranscriptTurnSchema,
  LeakageCategorySchema,
  OpeningSafetyCheckSchema,
  SourceDossierSchema,
  SupportedFactSchema,
} from "./schemas.js";

export type CaseSelection = "learner" | "automatic";
export type EvidenceQuality = z.infer<typeof EvidenceQualitySchema>;
type ArchitectureLabTraceLabels = typeof ARCHITECTURE_LAB.TRACE_LABELS;
export type ArchitectureLabPhase = Lowercase<keyof ArchitectureLabTraceLabels>;
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;
export type CitedClaim = z.infer<typeof CitedClaimSchema>;
export type SourceDossier = z.infer<typeof SourceDossierSchema>;
export type CaseBriefSource = z.infer<typeof CaseBriefSourceSchema>;
export type CaseBrief = z.infer<typeof CaseBriefSchema>;
export type LeakageCategory = z.infer<typeof LeakageCategorySchema>;
export type OpeningSafetyCheck = z.infer<typeof OpeningSafetyCheckSchema>;
export type DesignDimension = z.infer<typeof DesignDimensionSchema>;
export type ArchitectureChallenge = z.infer<typeof ArchitectureChallengeSchema>;
export type LabTranscriptTurn = z.infer<typeof LabTranscriptTurnSchema>;
export type ArchitectureEvidenceClaim = z.infer<typeof ArchitectureEvidenceClaimSchema>;
export type ArchitectureEvidence = z.infer<typeof ArchitectureEvidenceSchema>;
export type SupportedFact = z.infer<typeof SupportedFactSchema>;
export type ArchitectureReview = z.infer<typeof ArchitectureReviewSchema>;

export type ArchitectureLabInput =
  | { type: "line"; line: string }
  | { type: "eof" }
  | { type: "interrupted" }
  | { type: "input_error" };

export type ArchitectureLabTerminalInput = Exclude<ArchitectureLabInput, { type: "line" }>;

export type ArchitectureLabInputPort = {
  read(): Promise<ArchitectureLabInput>;
  getTerminalOutcome(): ArchitectureLabTerminalInput | undefined;
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
