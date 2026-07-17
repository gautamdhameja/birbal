import type { EnterpriseUseCase } from "../../pipelines/useCases/schema.js";
import type { SourceEvidence } from "../../pipelines/useCases/sourceEvidence.js";

export type VerificationFixture = {
  id: string;
  name: string;
  evidenceText: string;
  expected: {
    verified: boolean;
    confidenceScore: number;
    accepted: boolean;
    notes: string;
  };
  roiMetric?: string;
  promptClaims: readonly string[];
};

export const VERIFICATION_SOURCE_URL = "https://example.com/acme-support";

export function verificationUseCase(roiMetric = "20% faster response time"): EnterpriseUseCase {
  return {
    id: "use-case:acme-support",
    companyName: "Acme",
    industry: "Manufacturing",
    businessFunction: "Customer support",
    aiSystemOrCapability: "Customer-support AI assistant",
    humanRoleChange: "Agents review drafts and handle escalations.",
    systemIntegrations: "CRM and support desk",
    deploymentStage: "Production",
    roiMetric,
    businessOutcome: "Reduced support backlog.",
    governanceOrRiskNotes: "Human review remains in the loop.",
    implementationDetails: "Integrated with the existing ticket queue.",
    sourceTitle: "Acme deploys an AI support assistant",
    sourceUrl: VERIFICATION_SOURCE_URL,
    sourceName: "Example",
    publishDate: "2026-06-20",
    evidenceSummary: "Acme deployed an AI assistant in its support workflow.",
    confidenceScore: 4,
  };
}

export function verificationEvidence(plainText: string): SourceEvidence {
  return {
    source: {
      url: VERIFICATION_SOURCE_URL,
      title: "Enterprise AI customer story",
      plainText,
    },
    linkedEvidence: [],
  };
}

export const verificationFixtures: VerificationFixture[] = [
  {
    id: "verification_accepts_supported_use_case",
    name: "accepts a fully source-supported use case",
    evidenceText:
      "Acme deployed a customer-support AI assistant in production. It drafts replies and reduced response time by 20%.",
    expected: {
      verified: true,
      confidenceScore: 5,
      accepted: true,
      notes: "The source directly supports",
    },
    promptClaims: ['"companyName":"Acme"', "Customer-support AI assistant", "20%"],
  },
  {
    id: "verification_rejects_wrong_company",
    name: "rejects evidence about a different company",
    evidenceText: "Globex deployed a customer-support AI assistant in production.",
    expected: {
      verified: false,
      confidenceScore: 1,
      accepted: false,
      notes: "The evidence describes Globex, not Acme",
    },
    promptClaims: ['"companyName":"Acme"', "Globex"],
  },
  {
    id: "verification_accepts_core_story_with_unsupported_metric",
    name: "retains a real deployment while flagging an unsupported metric",
    evidenceText:
      "Acme deployed the assistant for support agents. The source reports no quantitative cost savings.",
    roiMetric: "40% lower support costs",
    expected: {
      verified: true,
      confidenceScore: 3,
      accepted: true,
      notes: "40% cost reduction is not supported",
    },
    promptClaims: ["40% lower support costs", "no quantitative cost savings"],
  },
  {
    id: "verification_rejects_aggregated_evidence",
    name: "rejects a claim assembled from unrelated organizations",
    evidenceText:
      "Acme piloted a generic chatbot. Separately, Globex reported a 30% reduction in support costs from an AI assistant.",
    roiMetric: "30% lower support costs",
    expected: {
      verified: false,
      confidenceScore: 2,
      accepted: false,
      notes: "The metric belongs to Globex",
    },
    promptClaims: ['"companyName":"Acme"', "Globex", "30% lower support costs"],
  },
];
