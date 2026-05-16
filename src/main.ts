import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const args = process.argv.slice(2);
const traceEnabled = args.includes("--trace");
const task = args.filter((arg) => arg !== "--trace").join(" ").trim() ||
  "Say hello through the final response protocol.";

if (traceEnabled) {
  process.env.LOG_LEVEL = process.env.LOG_LEVEL?.trim() || "debug";
  process.env.LOG_PRETTY = process.env.LOG_PRETTY?.trim() || "true";
}

const { runAgent } = await import("./agent/run.js");
const { renderToolsForPrompt } = await import("./tools/registry.js");

const toolsText = renderToolsForPrompt();

console.log(toolsText);

const answer = await runAgent(task);

console.log(answer);
