import { pathToFileURL } from "node:url";

import dotenv from "dotenv";

import { collectDailyCandidates } from "./pipeline.js";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint ? import.meta.url === pathToFileURL(entryPoint).href : false;
}

if (isMainModule()) {
  const candidates = await collectDailyCandidates();
  console.log(JSON.stringify(candidates, null, 2));
}
