import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodePersistedJson } from "../src/db/json.js";

describe("persisted JSON decoding", () => {
  it("decodes valid JSON values", () => {
    assert.deepEqual(decodePersistedJson('{"value":1}', null), { value: 1 });
  });

  it("returns the caller-selected fallback for malformed values", () => {
    assert.equal(decodePersistedJson("not-json", "not-json"), "not-json");
    assert.deepEqual(decodePersistedJson("not-json", {}), {});
    assert.equal(decodePersistedJson("not-json", undefined), undefined);
  });
});
