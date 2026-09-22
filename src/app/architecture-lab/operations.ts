import { createAgentHarness } from "../../framework/agent/harnessOrchestrator.js";
import { FRAMEWORK_AGENT } from "../../framework/agent/constants.js";
import {
  createJsonStringCodec,
  FrameworkAgentFinalResponseSchema,
  FrameworkAgentToolCallResponseSchema,
  parseJsonAgentResponseWithSchema,
} from "../../framework/agent/protocol.js";
import type { AgentLogger, AgentResponse, ToolRunner } from "../../framework/agent/types.js";
import { parseStrictJson } from "../../framework/llm/json.js";
import { completeStructuredWithRepair } from "../../framework/llm/repair.js";
import type { ModelClient, ModelCompleteOptions } from "../../framework/llm/types.js";
import { createStructuredModelCompletionOptions } from "../model-providers/response-format.js";
import { ARCHITECTURE_LAB } from "./constants.js";
import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import {
  assessSourceDossier,
  resolveReviewSources,
  validateArchitectureEvidence,
  validateCaseBriefEvidence,
  validateReviewEvidence,
} from "./evidence.js";
import {
  buildArchitectureEvidenceResearchRequest,
  buildCaseBriefMessages,
  buildCaseResearchRequest,
  buildChallengeMessages,
  buildOpeningSafetyMessages,
  buildReviewMessages,
  createArchitectureLabSystemPromptBuilder,
} from "./prompts.js";
import { createResearchProvenanceLedger } from "./provenance.js";
import {
  ArchitectureChallengeSchema,
  ArchitectureEvidenceSchema,
  ArchitectureReviewSchema,
  CaseBriefSchema,
  OpeningSafetyCheckSchema,
  SourceDossierSchema,
} from "./schemas.js";
import type {
  ArchitectureChallenge,
  ArchitectureEvidence,
  ArchitectureLabOperationError,
  ArchitectureLabOperations,
  ArchitectureLabOperationsDependencies,
  ArchitectureLabPhase,
  ArchitectureLabResearchOperation,
  ArchitectureLabResearchRequest,
  ArchitectureLabResult,
  ArchitectureLabSystemPromptDependencies,
  ArchitectureReview,
  CaseBrief,
  CaseSelection,
  GatherArchitectureEvidenceRequest,
  GenerateChallengeRequest,
  GenerateReviewRequest,
  OpeningSafetyCheck,
  OpeningSafetyRequest,
  PrepareCaseRequest,
  SourceDossier,
} from "./types.js";
import type { DebugWarnLogger } from "../../framework/logging/debug-warn.js";
import { z } from "zod";

type ResearchRunnerDependencies = {
  modelClient: ModelClient;
  toolRunner: ToolRunner;
  renderToolsForPrompt(): string;
  logger?: AgentLogger;
  prompt?: ArchitectureLabSystemPromptDependencies;
  createResponseSchema?(finalAnswerSchema: z.ZodType<string>): z.ZodType<AgentResponse>;
};

type ResearchOperationPhase = Extract<
  ArchitectureLabPhase,
  "case_research" | "architecture_evidence"
>;

function researchOperationPhase(
  phase: ArchitectureLabResearchRequest["phase"],
): ResearchOperationPhase {
  return phase === "case_setup" ? "case_research" : "architecture_evidence";
}

function failure(
  phase: ArchitectureLabPhase,
  code: ArchitectureLabOperationError["code"],
  message: string,
  repairAttempted?: boolean,
): ArchitectureLabResult<never> {
  return {
    ok: false,
    error: {
      type: "architecture_lab_operation_error",
      phase,
      code,
      message,
      ...(repairAttempted === undefined ? {} : { repairAttempted }),
    },
  };
}

async function completePhase<T>({
  phase,
  traceLabel,
  messages,
  schema,
  modelOptions,
  completeFn,
  logger,
}: {
  phase: ArchitectureLabPhase;
  traceLabel: string;
  messages: Parameters<typeof completeStructuredWithRepair<T>>[0]["messages"];
  schema: z.ZodType<T>;
  modelOptions: ModelCompleteOptions;
  completeFn: ModelClient["complete"];
  logger?: DebugWarnLogger;
}): Promise<ArchitectureLabResult<T>> {
  try {
    const result = await completeStructuredWithRepair({
      messages,
      schema,
      completeFn,
      completeOptions: {
        ...modelOptions,
        traceLabel,
      },
      logger,
    });
    if (!result.ok) {
      return failure(
        phase,
        "invalid_model_output",
        `The ${phase} response did not match its required schema after repair.`,
        result.error.repairAttempted,
      );
    }
    return { ok: true, value: result.value };
  } catch {
    return failure(phase, "model_failed", `The ${phase} model call failed.`);
  }
}

function parseResearchAnswer(
  raw: string,
  request: ArchitectureLabResearchRequest,
): ArchitectureLabResult<SourceDossier | ArchitectureEvidence> {
  const phase = researchOperationPhase(request.phase);
  let parsed: unknown;
  try {
    parsed = parseStrictJson(raw);
  } catch {
    return failure(phase, "invalid_research_output", "Lab research returned invalid JSON.");
  }
  const schema = request.phase === "case_setup" ? SourceDossierSchema : ArchitectureEvidenceSchema;
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return failure(
      phase,
      "invalid_research_output",
      `Lab research did not match the ${request.phase} schema.`,
    );
  }
  return { ok: true, value: result.data };
}

export function createArchitectureLabResearchRunner({
  modelClient,
  toolRunner,
  renderToolsForPrompt,
  logger,
  prompt,
  createResponseSchema = (finalAnswerSchema) =>
    FrameworkAgentFinalResponseSchema.extend({ answer: finalAnswerSchema }).or(
      FrameworkAgentToolCallResponseSchema,
    ),
}: ResearchRunnerDependencies): ArchitectureLabResearchOperation {
  const buildSystemPrompt = createArchitectureLabSystemPromptBuilder(prompt);
  const legacyResponseSchema = createResponseSchema(z.string());
  const caseSetupResponseSchema = createResponseSchema(createJsonStringCodec(SourceDossierSchema));
  const architectureEvidenceResponseSchema = createResponseSchema(
    createJsonStringCodec(ArchitectureEvidenceSchema),
  );
  const modelOptions = {
    caseSetup: createStructuredModelCompletionOptions({
      name: "architecture_lab_case_research_response",
      schema: caseSetupResponseSchema,
    }),
    architectureEvidence: createStructuredModelCompletionOptions({
      name: "architecture_lab_evidence_research_response",
      schema: architectureEvidenceResponseSchema,
    }),
  };
  return async (request) => {
    const provenance = createResearchProvenanceLedger();
    const traceLabel =
      request.phase === "case_setup"
        ? ARCHITECTURE_LAB.TRACE_LABELS.CASE_RESEARCH
        : ARCHITECTURE_LAB.TRACE_LABELS.ARCHITECTURE_EVIDENCE;
    const responseModelOptions =
      request.phase === "case_setup" ? modelOptions.caseSetup : modelOptions.architectureEvidence;
    const responseSchema =
      responseModelOptions.response_format?.type === MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_SCHEMA
        ? request.phase === "case_setup"
          ? caseSetupResponseSchema
          : architectureEvidenceResponseSchema
        : legacyResponseSchema;
    const runResearch = createAgentHarness({
      modelClient,
      toolRunner,
      renderToolsForPrompt,
      buildSystemPrompt,
      parseResponse: (raw) =>
        parseJsonAgentResponseWithSchema(raw, responseSchema, {
          maxResponseChars: FRAMEWORK_AGENT.MAX_RESPONSE_CHARS,
        }),
      logger,
      hooks: {
        afterToolCall: ({ result }) => provenance.recordToolResult(result),
      },
      defaultMaxSteps: ARCHITECTURE_LAB.RESEARCH_MAX_STEPS,
      maxParseRepairAttempts: 1,
      modelOptions: {
        ...responseModelOptions,
        traceLabel,
      },
    });
    const task =
      request.phase === "case_setup"
        ? buildCaseResearchRequest(request)
        : buildArchitectureEvidenceResearchRequest(request);
    try {
      const parsed = parseResearchAnswer(await runResearch(task), request);
      if (!parsed.ok) {
        return parsed;
      }
      const missingSourceIds = provenance.missingSourceIds(parsed.value.sources);
      if (missingSourceIds.length > 0) {
        return failure(
          researchOperationPhase(request.phase),
          "invalid_evidence",
          `Lab research cited sources not returned by research tools: ${missingSourceIds.join(", ")}.`,
        );
      }
      return parsed;
    } catch {
      return failure(
        researchOperationPhase(request.phase),
        "research_failed",
        "Lab research failed.",
      );
    }
  };
}

async function callResearch(
  research: ArchitectureLabResearchOperation,
  request: ArchitectureLabResearchRequest,
): Promise<ArchitectureLabResult<SourceDossier | ArchitectureEvidence>> {
  try {
    return await research(request);
  } catch {
    return failure(
      researchOperationPhase(request.phase),
      "research_failed",
      "Lab research failed.",
    );
  }
}

export function createArchitectureLabOperations({
  research,
  completeFn,
  now = () => new Date(),
  logger,
}: ArchitectureLabOperationsDependencies): ArchitectureLabOperations {
  const modelOptions = {
    caseBrief: createStructuredModelCompletionOptions({
      name: "architecture_lab_case_brief",
      schema: CaseBriefSchema,
    }),
    openingSafety: createStructuredModelCompletionOptions({
      name: "architecture_lab_opening_safety",
      schema: OpeningSafetyCheckSchema,
    }),
    challenge: createStructuredModelCompletionOptions({
      name: "architecture_lab_challenge",
      schema: ArchitectureChallengeSchema,
    }),
    review: createStructuredModelCompletionOptions({
      name: "architecture_lab_review",
      schema: ArchitectureReviewSchema,
    }),
  };

  async function prepareCase(
    request: PrepareCaseRequest,
  ): Promise<ArchitectureLabResult<CaseBrief>> {
    const caseName = request.caseName?.trim();
    const selection: CaseSelection = caseName ? "learner" : "automatic";
    const researchResult = await callResearch(research, {
      phase: "case_setup",
      selection,
      ...(caseName ? { caseName } : {}),
    });
    if (!researchResult.ok) {
      return researchResult;
    }
    const parsedDossier = SourceDossierSchema.safeParse(researchResult.value);
    if (!parsedDossier.success) {
      return failure(
        "case_research",
        "invalid_research_output",
        "Case research did not return a source dossier.",
      );
    }
    const dossierAssessment = assessSourceDossier(parsedDossier.data, selection, now());
    if (!dossierAssessment.ok) {
      return failure(
        "case_research",
        selection === "automatic" ? "insufficient_evidence" : "invalid_evidence",
        dossierAssessment.message,
      );
    }

    const briefResult = await completePhase({
      phase: "case_brief",
      traceLabel: ARCHITECTURE_LAB.TRACE_LABELS.CASE_BRIEF,
      messages: buildCaseBriefMessages({ dossier: parsedDossier.data, selection }),
      schema: CaseBriefSchema,
      modelOptions: modelOptions.caseBrief,
      completeFn,
      logger,
    });
    if (!briefResult.ok) {
      return briefResult;
    }
    const briefAssessment = validateCaseBriefEvidence(
      briefResult.value,
      parsedDossier.data,
      selection,
      now(),
    );
    if (!briefAssessment.ok) {
      return failure("case_brief", "invalid_evidence", briefAssessment.message);
    }
    return {
      ok: true,
      value: {
        ...briefResult.value,
        evidenceQuality:
          dossierAssessment.quality === "limited" || briefAssessment.quality === "limited"
            ? "limited"
            : "sufficient",
      },
    };
  }

  async function checkOpeningSafety(
    request: OpeningSafetyRequest,
  ): Promise<ArchitectureLabResult<OpeningSafetyCheck>> {
    const result = await completePhase({
      phase: "opening_safety",
      traceLabel: ARCHITECTURE_LAB.TRACE_LABELS.OPENING_SAFETY,
      messages: buildOpeningSafetyMessages(request.opening),
      schema: OpeningSafetyCheckSchema,
      modelOptions: modelOptions.openingSafety,
      completeFn,
      logger,
    });
    if (!result.ok) {
      return result;
    }
    if (!result.value.safe) {
      return failure(
        "opening_safety",
        "unsafe_opening",
        `Rendered opening failed the leakage gate: ${result.value.reason}`,
      );
    }
    return result;
  }

  async function generateChallenge(
    request: GenerateChallengeRequest,
  ): Promise<ArchitectureLabResult<ArchitectureChallenge>> {
    return completePhase({
      phase: "challenge",
      traceLabel: ARCHITECTURE_LAB.TRACE_LABELS.CHALLENGE,
      messages: buildChallengeMessages(request),
      schema: ArchitectureChallengeSchema,
      modelOptions: modelOptions.challenge,
      completeFn,
      logger,
    });
  }

  async function gatherArchitectureEvidence(
    request: GatherArchitectureEvidenceRequest,
  ): Promise<ArchitectureLabResult<ArchitectureEvidence>> {
    const researchResult = await callResearch(research, {
      phase: "architecture_evidence",
      brief: structuredClone(request.brief),
      transcript: structuredClone(request.transcript),
    });
    if (!researchResult.ok) {
      return researchResult;
    }
    const parsedEvidence = ArchitectureEvidenceSchema.safeParse(researchResult.value);
    if (!parsedEvidence.success) {
      return failure(
        "architecture_evidence",
        "invalid_research_output",
        "Post-attempt research did not return architecture evidence.",
      );
    }
    const assessment = validateArchitectureEvidence(parsedEvidence.data);
    if (!assessment.ok) {
      return failure("architecture_evidence", "invalid_evidence", assessment.message);
    }
    return { ok: true, value: parsedEvidence.data };
  }

  async function generateReview(
    request: GenerateReviewRequest,
  ): Promise<ArchitectureLabResult<ArchitectureReview>> {
    const reviewResult = await completePhase({
      phase: "review",
      traceLabel: ARCHITECTURE_LAB.TRACE_LABELS.REVIEW,
      messages: buildReviewMessages(request),
      schema: ArchitectureReviewSchema,
      modelOptions: modelOptions.review,
      completeFn,
      logger,
    });
    if (!reviewResult.ok) {
      return reviewResult;
    }
    const assessment = validateReviewEvidence(reviewResult.value, request.brief, request.evidence);
    if (!assessment.ok) {
      return failure("review", "invalid_evidence", assessment.message);
    }
    const sources = resolveReviewSources(reviewResult.value, request.brief, request.evidence);
    if (assessment.quality === "sufficient" && sources.length === 0) {
      return failure(
        "review",
        "invalid_evidence",
        "A sufficient review must resolve at least one cited source.",
      );
    }
    return {
      ok: true,
      value: {
        ...reviewResult.value,
        evidenceQuality: assessment.quality,
        sources,
      },
    };
  }

  return {
    prepareCase,
    checkOpeningSafety,
    generateChallenge,
    gatherArchitectureEvidence,
    generateReview,
  };
}
