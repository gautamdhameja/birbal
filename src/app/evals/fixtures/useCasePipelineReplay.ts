import { CONTENT_FETCH_STATUSES } from "../../constants/candidates.js";
import { SOURCE_REGISTRY } from "../../constants/source-registry.js";
import type { CandidateItem } from "../../daily/types.js";
import type { SourceEvidence } from "../../pipelines/useCases/sourceEvidence.js";

export const replayCandidate: CandidateItem = {
  id: "use-case:https://example.com/enterprise-ai",
  sourceId: "example",
  sourceName: "Example Research",
  sourceType: SOURCE_REGISTRY.SOURCE_TYPES.VENDOR,
  title: "Two enterprise AI deployments",
  url: "https://example.com/enterprise-ai",
  summary: "Acme and Globex describe AI deployments.",
  publishedAt: "2026-06-20",
  discoveredAt: "2026-06-21T09:00:00.000Z",
  contentFetchStatus: CONTENT_FETCH_STATUSES.FETCHED,
  raw: {},
};

export const replaySourceText = [
  "Acme deployed an AI assistant that helps field technicians retrieve repair procedures.",
  "Acme reports 20% faster troubleshooting while technicians retain final decisions.",
  "Globex published general advice about how companies could use AI in finance.",
].join(" ");

export const replaySourceEvidence: SourceEvidence = {
  source: {
    url: replayCandidate.url,
    title: replayCandidate.title,
    plainText: replaySourceText,
  },
  linkedEvidence: [],
};

export const replayExtractionResponse = {
  useCases: [
    {
      id: "acme-field-service",
      companyName: "Acme",
      industry: "Manufacturing",
      businessFunction: "Field service",
      aiSystemOrCapability: "AI repair-procedure assistant",
      humanRoleChange: "Technicians review retrieved guidance and make the repair decision.",
      systemIntegrations: "Service knowledge base",
      deploymentStage: "Production",
      roiMetric: "20% faster troubleshooting",
      businessOutcome: "Faster field repairs",
      governanceOrRiskNotes: "Technicians retain final responsibility.",
      implementationDetails: "Retrieves repair procedures for active jobs.",
      sourceTitle: replayCandidate.title,
      sourceUrl: replayCandidate.url,
      sourceName: replayCandidate.sourceName,
      publishDate: replayCandidate.publishedAt,
      evidenceSummary:
        "Acme field technicians use an AI assistant to retrieve repair procedures and troubleshoot equipment faster.",
      confidenceScore: 5,
    },
    {
      id: "globex-finance-advice",
      companyName: "Globex",
      industry: "Financial services",
      businessFunction: "Finance",
      aiSystemOrCapability: "AI finance assistant",
      humanRoleChange: "Unknown",
      systemIntegrations: "Unknown",
      deploymentStage: "Hypothetical",
      roiMetric: "Unknown",
      businessOutcome: "Potential efficiency",
      governanceOrRiskNotes: "Unknown",
      implementationDetails: "Unknown",
      sourceTitle: replayCandidate.title,
      sourceUrl: replayCandidate.url,
      sourceName: replayCandidate.sourceName,
      publishDate: replayCandidate.publishedAt,
      evidenceSummary: "The article advises companies how they could use AI in finance.",
      confidenceScore: 4,
    },
  ],
};
