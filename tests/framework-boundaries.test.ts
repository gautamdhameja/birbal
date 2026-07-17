import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, it } from "node:test";

const SOURCE_ROOT = resolve("src");
const APP_ROOT = resolve(SOURCE_ROOT, "app");
const FRAMEWORK_ROOT = resolve(SOURCE_ROOT, "framework");
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

function isWithin(directory: string, path: string): boolean {
  return path === directory || path.startsWith(`${directory}/`);
}

function relativeImportViolations(root: string, allowedRoots: readonly string[]): string[] {
  const violations: string[] = [];

  for (const file of typescriptFiles(root)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(RELATIVE_IMPORT_PATTERN)) {
      const importPath = match[1];
      if (!importPath) {
        continue;
      }

      const resolvedImport = resolve(dirname(file), importPath);
      if (!allowedRoots.some((allowedRoot) => isWithin(allowedRoot, resolvedImport))) {
        violations.push(`${relative(SOURCE_ROOT, file)} -> ${importPath}`);
      }
    }
  }

  return violations;
}

describe("framework dependency boundaries", () => {
  it("keeps application and framework code in explicit source roots", () => {
    const sourceEntries = readdirSync(SOURCE_ROOT, { withFileTypes: true })
      .map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    assert.deepEqual(sourceEntries, [
      { name: "app", type: "directory" },
      { name: "framework", type: "directory" },
    ]);
  });

  it("keeps application imports inside the application or framework", () => {
    assert.deepEqual(relativeImportViolations(APP_ROOT, [APP_ROOT, FRAMEWORK_ROOT]), []);
  });

  it("does not import application modules", () => {
    assert.deepEqual(relativeImportViolations(FRAMEWORK_ROOT, [FRAMEWORK_ROOT]), []);
  });
});
