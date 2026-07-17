import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, it } from "node:test";

const FRAMEWORK_ROOT = resolve("src/framework");
const RELATIVE_IMPORT_PATTERN = /\b(?:from\s+|import\s*)["'](\.[^"']+)["']/g;

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return typescriptFiles(path);
    }

    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("framework dependency boundaries", () => {
  it("does not import application modules", () => {
    const violations: string[] = [];

    for (const file of typescriptFiles(FRAMEWORK_ROOT)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(RELATIVE_IMPORT_PATTERN)) {
        const importPath = match[1];
        if (!importPath) {
          continue;
        }

        const resolvedImport = resolve(dirname(file), importPath);
        if (resolvedImport !== FRAMEWORK_ROOT && !resolvedImport.startsWith(`${FRAMEWORK_ROOT}/`)) {
          violations.push(`${relative(FRAMEWORK_ROOT, file)} -> ${importPath}`);
        }
      }
    }

    assert.deepEqual(violations, []);
  });
});
