import { z } from "zod";

import { ARCHITECTURE_LAB } from "./constants.js";

const NonEmptyTextSchema = z.string().trim().min(1);
const BoundedTextListSchema = z.array(NonEmptyTextSchema).max(ARCHITECTURE_LAB.MAX_LIST_ITEMS);

export const EvidenceQualitySchema = z.enum(["sufficient", "limited"]);

export const EvidenceSourceSchema = z.strictObject({
  id: NonEmptyTextSchema,
  title: NonEmptyTextSchema,
  url: NonEmptyTextSchema,
  publishedAt: NonEmptyTextSchema,
  excerpt: NonEmptyTextSchema,
});

export const CaseBriefSourceSchema = EvidenceSourceSchema.omit({ excerpt: true });

export const CitedClaimSchema = z.strictObject({
  claim: NonEmptyTextSchema,
  sourceIds: z.array(NonEmptyTextSchema).min(1).max(ARCHITECTURE_LAB.MAX_SOURCES),
});

export const SourceDossierSchema = z.strictObject({
  caseName: NonEmptyTextSchema,
  problem: NonEmptyTextSchema,
  actors: BoundedTextListSchema.min(1),
  constraints: BoundedTextListSchema.min(1),
  desiredOutcome: CitedClaimSchema,
  sources: z.array(EvidenceSourceSchema).min(1).max(ARCHITECTURE_LAB.MAX_SOURCES),
});

export const CaseBriefSchema = z.strictObject({
  title: NonEmptyTextSchema,
  problem: NonEmptyTextSchema,
  actors: BoundedTextListSchema.min(1),
  constraints: BoundedTextListSchema.min(1),
  desiredOutcome: CitedClaimSchema,
  evidenceQuality: EvidenceQualitySchema,
  sources: z.array(CaseBriefSourceSchema).min(1).max(ARCHITECTURE_LAB.MAX_SOURCES),
});

export const LeakageCategorySchema = z.enum(ARCHITECTURE_LAB.LEAKAGE_CATEGORIES);

export const OpeningSafetyCheckSchema = z.discriminatedUnion("safe", [
  z.strictObject({
    safe: z.literal(true),
    leakage: z.tuple([]),
    reason: NonEmptyTextSchema,
  }),
  z.strictObject({
    safe: z.literal(false),
    leakage: z.array(LeakageCategorySchema).min(1),
    reason: NonEmptyTextSchema,
  }),
]);

const FocusedQuestionSchema = NonEmptyTextSchema.refine(
  (question) => question.endsWith("?") && (question.match(/\?/g)?.length ?? 0) === 1,
  "Challenge must contain exactly one question.",
);

export const DesignDimensionSchema = z.enum(ARCHITECTURE_LAB.DESIGN_DIMENSIONS);

export const ArchitectureChallengeSchema = z.strictObject({
  dimension: DesignDimensionSchema,
  question: FocusedQuestionSchema,
});

export const ArchitectureEvidenceClaimSchema = z.strictObject({
  id: NonEmptyTextSchema,
  claim: NonEmptyTextSchema,
  sourceIds: z.array(NonEmptyTextSchema).min(1).max(ARCHITECTURE_LAB.MAX_SOURCES),
});

export const ArchitectureEvidenceSchema = z.strictObject({
  claims: z.array(ArchitectureEvidenceClaimSchema).max(ARCHITECTURE_LAB.MAX_EVIDENCE_CLAIMS),
  sources: z.array(EvidenceSourceSchema).min(1).max(ARCHITECTURE_LAB.MAX_SOURCES),
  evidenceQuality: EvidenceQualitySchema,
});

export const SupportedFactSchema = z.strictObject({
  claim: NonEmptyTextSchema,
  sourceIds: z.array(NonEmptyTextSchema).min(1).max(ARCHITECTURE_LAB.MAX_SOURCES),
});

const MASTERY_SCORE_PATTERN = new RegExp(
  [
    String.raw`\bmastery\s+score\b`,
    String.raw`\b(?:score(?:d)?|rating)\s*[:=-]?\s*\d+(?:\s*(?:\/|out\s+of)\s*(?:5|10|100))?\b`,
    String.raw`\brate(?:d)?\s+(?:this\s+architecture\s+)?\d+\s*(?:\/|out\s+of)\s*(?:5|10|100)\b`,
    String.raw`\b\d+\s*(?:\/|out\s+of)\s*(?:5|10|100)\b`,
  ].join("|"),
  "i",
);

export const ArchitectureReviewSchema = z
  .strictObject({
    strengths: BoundedTextListSchema,
    unresolvedRisks: BoundedTextListSchema,
    missingComponents: BoundedTextListSchema,
    alternatives: BoundedTextListSchema,
    supportedFacts: z.array(SupportedFactSchema).max(ARCHITECTURE_LAB.MAX_EVIDENCE_CLAIMS),
    inferences: BoundedTextListSchema,
    judgments: BoundedTextListSchema,
    nextChallenge: NonEmptyTextSchema,
    evidenceQuality: EvidenceQualitySchema,
  })
  .refine((review) => !MASTERY_SCORE_PATTERN.test(JSON.stringify(review)), {
    message: "Review must not include a mastery score.",
  });

export const LabTranscriptTurnSchema = z.discriminatedUnion("phase", [
  z.strictObject({
    role: z.literal("learner"),
    phase: z.literal("proposal"),
    content: NonEmptyTextSchema,
  }),
  z.strictObject({
    role: z.literal("birbal"),
    phase: z.literal("challenge"),
    dimension: DesignDimensionSchema,
    content: NonEmptyTextSchema,
  }),
  z.strictObject({
    role: z.literal("learner"),
    phase: z.literal("answer"),
    content: NonEmptyTextSchema,
  }),
]);
