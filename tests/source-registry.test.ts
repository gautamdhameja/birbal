import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { loadSourceRegistry } from "../src/app/config/sourceRegistry.js";
import { SOURCE_REGISTRY } from "../src/app/constants/source-registry.js";

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
          sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
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
          sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
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
          id: "hackernews",
          name: "Hacker News",
          domains: [],
          sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
          enabled: true,
        },
      ],
    });

    assert.throws(() => loadSourceRegistry(configPath), /Source registry config is invalid/);
  });
});
