// Purpose: Tests use case storage behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { initDb } from "../src/app/db/items.js";
import {
  contentHash,
  evidenceHash,
  getCachedUseCaseExtraction,
  getCachedUseCaseVerification,
  upsertUseCaseExtractionCache,
  upsertUseCaseVerificationCache,
  useCaseHash,
} from "../src/app/db/useCaseModelCache.js";
import { listRecentUseCases, listUseCasesByRun, upsertUseCase } from "../src/app/db/useCases.js";
import type { EnterpriseUseCaseStorageInput } from "../src/app/db/useCases.js";

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

  it("deduplicates by source URL, company name, and AI capability", () => {
    initDb(dbPath());

    upsertUseCase(useCase({ id: "first", businessOutcome: "Original outcome." }));
    upsertUseCase(useCase({ id: "second", businessOutcome: "Updated outcome." }));

    const recentUseCases = listRecentUseCases(10);

    assert.equal(recentUseCases.length, 1);
    assert.equal(recentUseCases[0]?.businessOutcome, "Updated outcome.");
  });

  it("preserves case-sensitive URL paths in persistent IDs", () => {
    initDb(dbPath());

    upsertUseCase(useCase({ sourceUrl: "https://example.com/Case" }));
    upsertUseCase(useCase({ sourceUrl: "https://example.com/case" }));

    const recentUseCases = listRecentUseCases(10);
    assert.equal(recentUseCases.length, 2);
    assert.equal(new Set(recentUseCases.map((storedUseCase) => storedUseCase.id)).size, 2);
  });

  it("deduplicates URLs that differ only by hostname casing", () => {
    initDb(dbPath());

    upsertUseCase(useCase({ sourceUrl: "https://EXAMPLE.com/acme-support" }));
    upsertUseCase(
      useCase({
        sourceUrl: "https://example.com/acme-support",
        businessOutcome: "Updated outcome.",
      }),
    );

    const recentUseCases = listRecentUseCases(10);
    assert.equal(recentUseCases.length, 1);
    assert.equal(recentUseCases[0]?.businessOutcome, "Updated outcome.");
  });

  it("lists use cases by run ID", () => {
    initDb(dbPath());

    upsertUseCase(useCase({ id: "run-1-case", runId: "run-1", companyName: "First" }));
    upsertUseCase(
      useCase({
        id: "run-1-case-2",
        runId: "run-1",
        companyName: "Second",
        sourceUrl: "https://example.com/second",
        aiSystemOrCapability: "Procurement assistant",
      }),
    );
    upsertUseCase(
      useCase({
        id: "run-2-case",
        runId: "run-2",
        companyName: "Beta",
        sourceUrl: "https://example.com/beta",
        aiSystemOrCapability: "Finance assistant",
      }),
    );

    assert.deepEqual(
      listUseCasesByRun("run-1").map((storedUseCase) => storedUseCase.companyName),
      ["First", "Second"],
    );
  });

  it("does not trust duplicate model-generated IDs as persistent IDs", () => {
    initDb(dbPath());

    upsertUseCase(useCase({ id: "use-case-1", companyName: "Acme" }));
    upsertUseCase(
      useCase({
        id: "use-case-1",
        companyName: "Beta",
        sourceUrl: "https://example.com/beta",
        aiSystemOrCapability: "Finance assistant",
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

  it("caches extracted use cases by source URL, content hash, and extractor version", () => {
    initDb(dbPath());
    const extracted = [useCase()];
    const hashedContent = contentHash("article text");

    upsertUseCaseExtractionCache({
      contentHash: hashedContent,
      extractorVersion: "extractor:v1",
      sourceUrl: "https://example.com/acme-support",
      useCases: extracted,
    });

    assert.deepEqual(
      getCachedUseCaseExtraction({
        contentHash: hashedContent,
        extractorVersion: "extractor:v1",
        sourceUrl: "https://example.com/acme-support",
      }),
      extracted,
    );
    assert.equal(
      getCachedUseCaseExtraction({
        contentHash: hashedContent,
        extractorVersion: "extractor:v2",
        sourceUrl: "https://example.com/acme-support",
      }),
      null,
    );
  });

  it("caches use-case verification by use case, evidence, and verifier version", () => {
    initDb(dbPath());
    const cachedUseCase = useCase();
    const hashedUseCase = useCaseHash(cachedUseCase);
    const hashedEvidence = evidenceHash({
      source: {
        url: cachedUseCase.sourceUrl,
        plainText: "Acme deployed an AI assistant.",
      },
    });
    const verification = {
      verified: true,
      confidenceScore: 4,
      evidenceLinks: [cachedUseCase.sourceUrl],
      notes: "Supported by source evidence.",
    };

    upsertUseCaseVerificationCache({
      evidenceHash: hashedEvidence,
      useCaseHash: hashedUseCase,
      verification,
      verifierVersion: "verifier:v1",
    });

    assert.deepEqual(
      getCachedUseCaseVerification({
        evidenceHash: hashedEvidence,
        useCaseHash: hashedUseCase,
        verifierVersion: "verifier:v1",
      }),
      verification,
    );
    assert.equal(
      getCachedUseCaseVerification({
        evidenceHash: hashedEvidence,
        useCaseHash: hashedUseCase,
        verifierVersion: "verifier:v2",
      }),
      null,
    );
  });
});
