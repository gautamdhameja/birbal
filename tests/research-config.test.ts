import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { loadResearchConfig } from "../src/app/research/config.js";

function writeConfig(value: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), "birbal-research-config-")), "research.json");
  writeFileSync(path, JSON.stringify(value));
  return path;
}

describe("research config", () => {
  it("loads the checked-in reading preferences", () => {
    const config = loadResearchConfig();

    assert.ok(config.interests.includes("LLM agents"));
    assert.equal(config.preferredDifficulty, "advanced");
    assert.equal(config.maxReadingListItems, 8);
  });

  it("rejects malformed JSON and invalid list limits", () => {
    const malformedPath = join(
      mkdtempSync(join(tmpdir(), "birbal-research-config-")),
      "research.json",
    );
    writeFileSync(malformedPath, "{");

    assert.throws(() => loadResearchConfig(malformedPath), /Invalid research config JSON/);
    assert.throws(
      () =>
        loadResearchConfig(
          writeConfig({
            interests: ["agents"],
            avoid: [],
            preferredDifficulty: "advanced",
            maxReadingListItems: 0,
          }),
        ),
      /Invalid research config/,
    );
  });
});
