import { CANDIDATE_CATEGORIES, CONTENT_FETCH_STATUSES } from "../constants/candidates.js";
import type { SOURCE_REGISTRY } from "../constants/source-registry.js";
export { CANDIDATE_CATEGORIES, CONTENT_FETCH_STATUSES };

export type ContentFetchStatus =
  (typeof CONTENT_FETCH_STATUSES)[keyof typeof CONTENT_FETCH_STATUSES];

export type CandidateCategory = (typeof CANDIDATE_CATEGORIES)[keyof typeof CANDIDATE_CATEGORIES];

export type CandidateSourceType =
  (typeof SOURCE_REGISTRY.SOURCE_TYPES)[keyof typeof SOURCE_REGISTRY.SOURCE_TYPES];

export type CandidateItem = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: CandidateSourceType;
  title: string;
  url: string;
  summary: string;
  publishedAt: string;
  discoveredAt: string;
  contentText?: string;
  contentFetchStatus: ContentFetchStatus;
  category?: CandidateCategory;
  raw: unknown;
};

export type ItemScore = {
  enterpriseRelevance: number;
  workflowRedesignDepth: number;
  realUseCaseSpecificity: number;
  deploymentFdeRelevance: number;
  businessOutcomeClarity: number;
  technicalImplementationUsefulness: number;
  recency: number;
  nonGenericInsight: number;
  rejected: boolean;
  rejectionReason?: string;
  reason: string;
  finalScore: number;
};

export type ScoredCandidateItem = CandidateItem & {
  score: ItemScore;
};
