import { SOURCES } from "../constants/sources.js";

export type CandidateItem = {
  id: string;
  source: (typeof SOURCES)[keyof typeof SOURCES];
  title: string;
  url: string;
  summary: string;
  publishedAt: string;
  raw: unknown;
};

export type ItemScore = {
  relevance: number;
  technical_depth: number;
  novelty: number;
  practicality: number;
  reason: string;
  finalScore: number;
};

export type ScoredCandidateItem = CandidateItem & {
  score: ItemScore;
};
