export type ProductionUseCaseScoutConfig = {
  dailyQueries: string[];
  sourceSpecificQueries: string[];
  prioritizedDomains: string[];
  maxSearchResultsPerQuery: number;
  maxCandidatesForExtraction: number;
  maxResults: number;
  freshness?: string;
};

export type UseCaseSearchCandidate = {
  id: string;
  query: string;
  title: string;
  url: string;
  description: string;
  publishedAt: string;
  sourceName?: string;
  raw: unknown;
};

export type ProductionUseCase = {
  company: string;
  workflow: string;
  whatAiDoes: string;
  productionEvidence: string;
  businessMetric: string;
  sourceLink: string;
  publishDate: string;
  whyThisMattersForEnterpriseAiWorkflowRedesign: string;
};

export type ProductionUseCaseRunResult = {
  searchedQueries: number;
  collected: number;
  fetched: number;
  accepted: number;
  rejected: number;
  searchErrors: Array<{ query: string; error: string }>;
  fetchErrors: Array<{ url: string; error: string }>;
  extractionErrors: Array<{ url: string; error: string }>;
  results: ProductionUseCase[];
  failed: boolean;
};

export type ProductionUseCaseRunOptions = {
  maxResults?: number;
};
