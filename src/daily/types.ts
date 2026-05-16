export type CandidateItem = {
  id: string;
  source: "arxiv" | "hackernews";
  title: string;
  url: string;
  summary: string;
  publishedAt: string;
  raw: unknown;
};
