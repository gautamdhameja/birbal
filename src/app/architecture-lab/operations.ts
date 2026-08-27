import { createAgentHarness } from "../../framework/agent/harnessOrchestrator.js";
import { FRAMEWORK_AGENT } from "../../framework/agent/constants.js";
import { parseJsonAgentResponse } from "../../framework/agent/protocol.js";
import type { AgentLogger, ToolRunner } from "../../framework/agent/types.js";
import { parseStrictJson } from "../../framework/llm/json.js";
import { completeStructuredWithRepair } from "../../framework/llm/repair.js";
import type { ModelClient } from "../../framework/llm/types.js";
import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import { ARCHITECTURE_LAB } from "./constants.js";
import {
  assessSourceDossier,
  validateArchitectureEvidence,
  validateCaseBriefEvidence,
  validateReviewEvidence,
} from "./evidence.js";
import {
  buildArchitectureEvidenceResearchRequest,
  buildArchitectureLabSystemPrompt,
  buildCaseBriefMessages,
  buildCaseResearchRequest,
  buildChallengeMessages,
  buildOpeningSafetyMessages,
  buildReviewMessages,
  type ArchitectureLabSystemPromptDependencies,
} from "./prompts.js";
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
  ArchitectureReview,
  CaseBrief,
  CaseSelection,
  GenerateChallengeRequest,
  GenerateReviewRequest,
  OpeningSafetyCheck,
  OpeningSafetyRequest,
  PrepareCaseRequest,
  SourceDossier,
} from "./types.js";
import type { DebugWarnLogger } from "../../framework/logging/debug-warn.js";
import type { z } from "zod";

const STRUCTURED_COMPLETE_OPTIONS = {
  temperature: 0,
  maxOutputTokens: FRAMEWORK_AGENT.MODEL_MAX_TOKENS,
  response_format: {
    type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT,
  },
} as const;

type ResearchRunnerDependencies = {
  modelClient: ModelClient;
  toolRunner: ToolRunner;
  renderToolsForPrompt(): string;
  logger?: AgentLogger;
  prompt?: ArchitectureLabSystemPromptDependencies;
};

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
  completeFn,
  logger,
}: {
  phase: ArchitectureLabPhase;
  traceLabel: string;
  messages: Parameters<typeof completeStructuredWithRepair<T>>[0]["messages"];
  schema: z.ZodType<T>;
  completeFn: ModelClient["complete"];
  logger?: DebugWarnLogger;
}): Promise<ArchitectureLabResult<T>> {
  try {
    const result = await completeStructuredWithRepair({
      messages,
      schema,
      completeFn,
      completeOptions: {
        ...STRUCTURED_COMPLETE_OPTIONS,
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
  const phase = request.phase === "case_setup" ? "case_research" : "architecture_evidence";
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
}: ResearchRunnerDependencies): ArchitectureLabResearchOperation {
  return async (request) => {
    const traceLabel =
      request.phase === "case_setup"
        ? ARCHITECTURE_LAB.TRACE_LABELS.CASE_RESEARCH
        : ARCHITECTURE_LAB.TRACE_LABELS.ARCHITECTURE_EVIDENCE;
    const runResearch = createAgentHarness({
      modelClient,
      toolRunner,
      renderToolsForPrompt,
      buildSystemPrompt: (renderedTools) => buildArchitectureLabSystemPrompt(renderedTools, prompt),
      parseResponse: (raw) =>
        parseJsonAgentResponse(raw, {
          maxResponseChars: FRAMEWORK_AGENT.MAX_RESPONSE_CHARS,
        }),
      logger,
      defaultMaxSteps: ARCHITECTURE_LAB.RESEARCH_MAX_STEPS,
      maxParseRepairAttempts: 1,
      modelOptions: {
        ...STRUCTURED_COMPLETE_OPTIONS,
        traceLabel,
      },
    });
    const task =
      request.phase === "case_setup"
        ? buildCaseResearchRequest(request)
        : buildArchitectureEvidenceResearchRequest(request);
    try {
      return parseResearchAnswer(
        await runResearch(task, { maxSteps: ARCHITECTURE_LAB.RESEARCH_MAX_STEPS }),
        request,
      );
    } catch {
      const phase = request.phase === "case_setup" ? "case_research" : "architecture_evidence";
      return failure(phase, "research_failed", "Lab research failed.");
    }
  };
}

async function callResearch(
  research: ArchitectureLabResearchOperation,
  request: ArchitectureLabResearchRequest,
): Promise<ArchitectureLabResult<SourceDossier | ArchitectureEvidence>> {
  const phase = request.phase === "case_setup" ? "case_research" : "architecture_evidence";
  try {
    return await research(request);
  } catch {
    return failure(phase, "research_failed", "Lab research failed.");
  }
}

export function createArchitectureLabOperations({
  research,
  completeFn,
  now = () => new Date(),
  logger,
}: ArchitectureLabOperationsDependencies): ArchitectureLabOperations {
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
      completeFn,
      logger,
    });
  }

  async function gatherArchitectureEvidence(
    request: GenerateReviewRequest,
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
    const evidenceResult = await gatherArchitectureEvidence(request);
    if (!evidenceResult.ok) {
      return evidenceResult;
    }
    const reviewResult = await completePhase({
      phase: "review",
      traceLabel: ARCHITECTURE_LAB.TRACE_LABELS.REVIEW,
      messages: buildReviewMessages({ ...request, evidence: evidenceResult.value }),
      schema: ArchitectureReviewSchema,
      completeFn,
      logger,
    });
    if (!reviewResult.ok) {
      return reviewResult;
    }
    const assessment = validateReviewEvidence(
      reviewResult.value,
      request.brief,
      evidenceResult.value,
    );
    if (!assessment.ok) {
      return failure("review", "invalid_evidence", assessment.message);
    }
    return {
      ok: true,
      value: { ...reviewResult.value, evidenceQuality: assessment.quality },
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
