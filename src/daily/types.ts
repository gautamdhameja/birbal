import { SOURCES } from "../constants.js";

export type CandidateItem = {
  id: string;
  source: (typeof SOURCES)[keyof typeof SOURCES];
  title: string;
  url: string;
  summary: string;
  publishedAt: string;
  raw: unknown;
};
