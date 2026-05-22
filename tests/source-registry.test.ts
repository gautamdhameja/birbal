import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { SOURCE_REGISTRY, SOURCES } from "../src/constants.js";
import { loadSourceRegistry } from "../src/config/sourceRegistry.js";

function writeSourceRegistryConfig(value: unknown): string {
  const configPath = join(
    mkdtempSync(join(tmpdir(), "birbal-source-registry-")),
    "source-registry.json",
  );
  writeFileSync(configPath, JSON.stringify(value));
  return configPath;
}

describe("source registry", () => {
  it("loads and validates source registry config", () => {
    const configPath = writeSourceRegistryConfig({
      sources: [
        {
          id: "enterprise-ai",
          name: "Enterprise AI",
          domains: ["example.com"],
          priority: 1,
          sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
          searchQueries: ["LLM agents"],
          enabled: true,
        },
      ],
    });

    assert.deepEqual(loadSourceRegistry(configPath), {
      sources: [
        {
          id: "enterprise-ai",
          name: "Enterprise AI",
          domains: ["example.com"],
          priority: 1,
          sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
          searchQueries: ["LLM agents"],
          enabled: true,
        },
      ],
    });
  });

  it("rejects invalid source registry JSON", () => {
    const configPath = join(
      mkdtempSync(join(tmpdir(), "birbal-source-registry-")),
      "source-registry.json",
    );
    writeFileSync(configPath, "{");

    assert.throws(() => loadSourceRegistry(configPath), /not valid JSON/);
  });

  it("rejects invalid source registry shapes", () => {
    const configPath = writeSourceRegistryConfig({
      sources: [
        {
          id: SOURCES.HACKER_NEWS,
          name: "Hacker News",
          domains: [],
          priority: 1,
          sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
          searchQueries: ["LLM agents"],
          enabled: true,
        },
      ],
    });

    assert.throws(() => loadSourceRegistry(configPath), /Source registry config is invalid/);
  });
});
