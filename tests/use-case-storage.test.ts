import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { initDb } from "../src/db/items.js";
import { listRecentUseCases, listUseCasesByRun, upsertUseCase } from "../src/db/useCases.js";
import type { EnterpriseUseCaseStorageInput } from "../src/db/useCases.js";

function dbPath(): string {
  return join(mkdtempSync(join(tmpdir(), "birbal-use-cases-db-")), "agent.db");
}

function useCase(
  overrides: Partial<EnterpriseUseCaseStorageInput> = {},
): EnterpriseUseCaseStorageInput {
  return {
    id: "use-case:acme-support",
    companyName: "Acme",
    industry: "Manufacturing",
    businessFunction: "Customer support",
    workflowAffected: "Support ticket triage",
    workflowBefore: "Agents manually read and route incoming tickets.",
    workflowAfter: "AI drafts responses and routes escalations.",
    aiSystemOrCapability: "Customer support AI assistant",
    humanRoleChange: "Agents review drafts and handle escalations.",
    systemIntegrations: "CRM and support desk",
    deploymentStage: "production",
    roiMetric: "20% faster response time",
    businessOutcome: "Reduced support backlog.",
    governanceOrRiskNotes: "Human review remains in the loop.",
    implementationDetails: "Integrated with existing ticket queue.",
    sourceTitle: "Acme deploys AI support assistant",
    sourceUrl: "https://example.com/acme-support",
    sourceName: "Example",
    publishDate: "2026-05-25",
    evidenceSummary: "Named production deployment with measurable support outcome.",
    confidenceScore: 4,
    ...overrides,
  };
}

describe("enterprise use case storage", () => {
  it("upserts use cases and lists recent records", () => {
    initDb(dbPath());

    upsertUseCase(
      useCase({
        runId: "run-1",
        rawJson: { source: "test" },
      }),
    );

    const recentUseCases = listRecentUseCases(10);

    assert.equal(recentUseCases.length, 1);
    assert.deepEqual(recentUseCases[0], {
      ...useCase(),
      id: recentUseCases[0]?.id,
      runId: "run-1",
      createdAt: recentUseCases[0]?.createdAt,
      rawJson: { source: "test" },
    });
    assert.match(recentUseCases[0]?.id ?? "", /^use-case:[a-f0-9]{16}$/);
  });

  it("deduplicates by source URL, company name, and workflow affected", () => {
    initDb(dbPath());

    upsertUseCase(useCase({ id: "first", businessOutcome: "Original outcome." }));
    upsertUseCase(useCase({ id: "second", businessOutcome: "Updated outcome." }));

    const recentUseCases = listRecentUseCases(10);

    assert.equal(recentUseCases.length, 1);
    assert.equal(recentUseCases[0]?.businessOutcome, "Updated outcome.");
  });

  it("lists use cases by run ID", () => {
    initDb(dbPath());

    upsertUseCase(useCase({ id: "run-1-case", runId: "run-1" }));
    upsertUseCase(
      useCase({
        id: "run-2-case",
        runId: "run-2",
        companyName: "Beta",
        sourceUrl: "https://example.com/beta",
        workflowAffected: "Finance close",
      }),
    );

    assert.equal(listUseCasesByRun("run-1").length, 1);
  });

  it("does not trust duplicate model-generated IDs as persistent IDs", () => {
    initDb(dbPath());

    upsertUseCase(useCase({ id: "use-case-1", companyName: "Acme" }));
    upsertUseCase(
      useCase({
        id: "use-case-1",
        companyName: "Beta",
        sourceUrl: "https://example.com/beta",
        workflowAffected: "Finance close",
      }),
    );

    const recentUseCases = listRecentUseCases(10);

    assert.equal(recentUseCases.length, 2);
    assert.equal(new Set(recentUseCases.map((storedUseCase) => storedUseCase.id)).size, 2);
  });

  it("rejects invalid recent use case limits", () => {
    initDb(dbPath());

    assert.throws(() => listRecentUseCases(0), /positive integer/);
  });
});
