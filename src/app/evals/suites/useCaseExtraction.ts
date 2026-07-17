import { SOURCE_REGISTRY } from "../../constants/source-registry.js";
import { CONTENT_FETCH_STATUSES } from "../../constants/candidates.js";
import type { CandidateItem } from "../../daily/types.js";
import type { EvalCase, EvalSuite } from "../../../framework/evals/types.js";
import type { ChatMessage } from "../../../framework/llm/types.js";
import { extractEnterpriseUseCases } from "../../pipelines/useCases/extractor.js";
import { hasNamedEnterpriseCompany } from "../../pipelines/useCases/schema.js";
import { expectEqual, expectIncludes, expectTrue } from "../assertions.js";

type MockCompletion = {
  calls: ChatMessage[][];
  complete(messages: ChatMessage[]): Promise<string>;
};

function candidate(overrides: Partial<CandidateItem> = {}): CandidateItem {
  return {
    id: "use-case:https://example.com/customer-story",
    sourceId: "openai",
    sourceName: "Example Vendor",
    sourceType: SOURCE_REGISTRY.SOURCE_TYPES.VENDOR,
    title: "Acme uses AI assistant for field service",
    url: "https://example.com/customer-story",
    summary: "Acme rolled out an AI assistant to support field service technicians.",
    publishedAt: "2026-06-20",
    discoveredAt: "2026-07-11T09:00:00.000Z",
    contentFetchStatus: CONTENT_FETCH_STATUSES.FETCHED,
    raw: {},
    ...overrides,
  };
}

function completion(response: unknown): MockCompletion {
  const calls: ChatMessage[][] = [];

  return {
    calls,
    async complete(messages) {
      calls.push([...messages]);
      return JSON.stringify(response);
    },
  };
}

const concreteUseCaseCase: EvalCase = {
  id: "use_case_concrete_customer_story",
  name: "extracts a concrete deployed enterprise AI use case",
  async run() {
    const mock = completion({
      useCases: [
        {
          id: "acme-field-service-assistant",
          companyName: "Acme Manufacturing",
          industry: "Manufacturing",
          businessFunction: "Field service",
          aiSystemOrCapability: "AI assistant for technician knowledge retrieval",
          humanRoleChange:
            "Technicians use the assistant to find repair guidance before escalating to specialists.",
          systemIntegrations: "Service knowledge base, work order system",
          deploymentStage: "Rolled out in production",
          roiMetric: "Reduced average troubleshooting time by 20%",
          businessOutcome:
            "Acme reduced troubleshooting time and improved first-time fix support for technicians.",
          governanceOrRiskNotes: "Technicians remain responsible for final repair decisions.",
          implementationDetails:
            "The assistant retrieves service procedures and summarizes relevant steps for active work orders.",
          sourceTitle: "Acme uses AI assistant for field service",
          sourceUrl: "https://example.com/customer-story",
          sourceName: "Example Vendor",
          publishDate: "2026-06-20",
          evidenceSummary:
            "Acme Manufacturing is using an AI assistant to help field service technicians find repair guidance while working on customer equipment. The workflow changes from manual search and escalation to assistant-supported knowledge retrieval inside the service process. Technicians still make the repair decision, but the assistant reduces troubleshooting time and supports faster first-time fixes.",
          confidenceScore: 5,
        },
      ],
    });
    const useCases = await extractEnterpriseUseCases(
      candidate(),
      [
        "Acme Manufacturing rolled out an AI assistant for field service technicians.",
        "The assistant searches service procedures and work-order context.",
        "Acme reports a 20% reduction in average troubleshooting time.",
      ].join(" "),
      {
        completeFn: mock.complete,
        maxContentChars: 2_000,
      },
    );
    const first = useCases[0];

    return {
      assertions: [
        expectEqual("one use case extracted", useCases.length, 1),
        expectEqual("company name", first?.companyName, "Acme Manufacturing"),
        expectTrue(
          "company is named, not generic",
          first ? hasNamedEnterpriseCompany(first) : false,
        ),
        expectIncludes(
          "summary focuses on workflow",
          first?.evidenceSummary ?? "",
          "field service technicians",
        ),
        expectEqual("model called once", mock.calls.length, 1),
      ],
      metadata: {
        modelCalls: mock.calls.length,
      },
    };
  },
};

const genericFrameworkCase: EvalCase = {
  id: "use_case_rejects_framework_article",
  name: "rejects generic framework content with no real use case",
  async run() {
    const mock = completion({
      useCases: [
        {
          id: "generic-contact-center",
          companyName: "contact center organizations",
          industry: "Customer service",
          businessFunction: "Contact center",
          aiSystemOrCapability: "AI measurement framework",
          humanRoleChange: "",
          systemIntegrations: "",
          deploymentStage: "",
          roiMetric: "",
          businessOutcome: "Organizations can improve measurement of AI performance.",
          governanceOrRiskNotes: "",
          implementationDetails: "",
          sourceTitle: "How to measure AI agent performance",
          sourceUrl: "https://example.com/measurement-framework",
          sourceName: "Example Blog",
          publishDate: "2026-06-21",
          evidenceSummary:
            "The article describes how organizations should measure AI agent performance in contact centers.",
          confidenceScore: 5,
        },
      ],
    });
    const useCases = await extractEnterpriseUseCases(
      candidate({
        title: "How to measure AI agent performance",
        url: "https://example.com/measurement-framework",
        summary: "A framework for measuring AI agent performance.",
      }),
      "This article provides best practices for measuring AI agent performance. It does not name a customer deployment.",
      {
        completeFn: mock.complete,
        maxContentChars: 2_000,
      },
    );

    return {
      assertions: [
        expectEqual("generic company output filtered", useCases.length, 0),
        expectEqual("model called once", mock.calls.length, 1),
      ],
      metadata: {
        modelCalls: mock.calls.length,
      },
    };
  },
};

export const useCaseExtractionEvalSuite: EvalSuite = {
  id: "use_case_extraction",
  name: "Enterprise Use-Case Extraction",
  description: "Extraction quality gates for concrete enterprise use cases.",
  cases: [concreteUseCaseCase, genericFrameworkCase],
};
