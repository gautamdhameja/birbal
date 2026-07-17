#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsxCli = resolve(packageRoot, "node_modules", "tsx", "dist", "cli.mjs");
const birbalCli = resolve(packageRoot, "src", "app", "cli.ts");

const result = spawnSync(process.execPath, [tsxCli, birbalCli, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
