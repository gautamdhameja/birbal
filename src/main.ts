import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const { runAgent } = await import("./agent/run.js");
const { renderToolsForPrompt } = await import("./tools/registry.js");

const toolsText = renderToolsForPrompt();
const task = process.argv.slice(2).join(" ").trim() || "Say hello through the final response protocol.";

console.log(toolsText);

const answer = await runAgent(task);

console.log(answer);
