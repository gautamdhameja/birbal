import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { describe, it } from "node:test";
import ts from "typescript";

const SOURCE_ROOT = resolve("src");
const APP_ROOT = resolve(SOURCE_ROOT, "app");
const FRAMEWORK_ROOT = resolve(SOURCE_ROOT, "framework");

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return typescriptFiles(path);
    }

    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

function isWithin(directory: string, candidate: string): boolean {
  const candidatePath = relative(directory, candidate);
  return (
    candidatePath === "" ||
    (!isAbsolute(candidatePath) && candidatePath !== ".." && !candidatePath.startsWith(`..${sep}`))
  );
}

function relativeModuleSpecifiers(source: string, file = "source.ts"): string[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  function addSpecifier(node: ts.Node | undefined): void {
    if (node && ts.isStringLiteralLike(node) && node.text.startsWith(".")) {
      specifiers.push(node.text);
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addSpecifier(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      addSpecifier(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      addSpecifier(node.arguments[0]);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      addSpecifier(node.argument.literal);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function relativeImportViolations(root: string, allowedRoots: readonly string[]): string[] {
  const violations: string[] = [];

  for (const file of typescriptFiles(root)) {
    for (const importPath of relativeModuleSpecifiers(readFileSync(file, "utf8"), file)) {
      const resolvedImport = resolve(dirname(file), importPath);
      if (!allowedRoots.some((allowedRoot) => isWithin(allowedRoot, resolvedImport))) {
        violations.push(`${relative(SOURCE_ROOT, file)} -> ${importPath}`);
      }
    }
  }

  return violations;
}

describe("framework dependency boundaries", () => {
  it("recognizes relative dependencies across supported TypeScript syntax", () => {
    const source = `
      import value from "./static.js";
      export { value } from "../exported.js";
      const dynamic = import("./dynamic.js");
      type Imported = import("../type.js").Imported;
      import legacy = require("./legacy.js");
      const required = require("../required.js");
    `;

    assert.deepEqual(relativeModuleSpecifiers(source), [
      "./static.js",
      "../exported.js",
      "./dynamic.js",
      "../type.js",
      "./legacy.js",
      "../required.js",
    ]);
  });

  it("keeps application and framework code in explicit source roots", () => {
    const sourceEntries = readdirSync(SOURCE_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || (entry.isFile() && entry.name.endsWith(".ts")))
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
