import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { PREFERENCES } from "../src/constants.js";
import { loadPreferences } from "../src/memory/preferences.js";
import type { UserPreferences } from "../src/memory/types.js";

function preferences(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    interests: ["LLM agents", "agent evaluation"],
    avoid: ["press release"],
    preferredDifficulty: "advanced",
    enableAcademicFallback: false,
    minFinalScoreForDigest: 3.4,
    maxItemsPerSource: 2,
    dailyMix: {
      arxiv: 0.6,
      hackernews: 0.4,
    },
    ...overrides,
  };
}

function writePreferencesConfig(value: unknown): string {
  const configPath = join(mkdtempSync(join(tmpdir(), "birbal-preferences-")), "preferences.json");
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(value));
  return configPath;
}

describe("user preferences", () => {
  it("loads and validates preferences", () => {
    const configPath = writePreferencesConfig(preferences());

    assert.deepEqual(loadPreferences(configPath), preferences());
  });

  it("allows source registry driven daily mix keys", () => {
    const customPreferences = preferences({
      dailyMix: {
        "openai-blog": 1,
      },
    });
    const configPath = writePreferencesConfig(customPreferences);

    assert.deepEqual(loadPreferences(configPath), customPreferences);
  });

  it("rejects invalid JSON", () => {
    const configPath = join(mkdtempSync(join(tmpdir(), "birbal-preferences-")), "preferences.json");
    writeFileSync(configPath, "{");

    assert.throws(() => loadPreferences(configPath), new RegExp(PREFERENCES.ERRORS.INVALID_JSON));
  });

  it("rejects invalid preference shapes", () => {
    const configPath = writePreferencesConfig(preferences({ interests: [] }));

    assert.throws(() => loadPreferences(configPath), new RegExp(PREFERENCES.ERRORS.INVALID_CONFIG));
  });

  it("rejects a daily mix with no enabled sources", () => {
    const configPath = writePreferencesConfig(
      preferences({
        dailyMix: {
          arxiv: 0,
          hackernews: 0,
        },
      }),
    );

    assert.throws(
      () => loadPreferences(configPath),
      new RegExp(PREFERENCES.ERRORS.INVALID_DAILY_MIX),
    );
  });
});
