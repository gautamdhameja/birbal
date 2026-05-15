import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const { complete } = await import("./llama/client.js");
const { buildSystemPrompt } = await import("./agent/prompts.js");
const { parseAgentResponse } = await import("./utils/json.js");

const response = await complete([
  {
    role: "system",
    content: buildSystemPrompt(""),
  },
  {
    role: "user",
    content: "Say hello through the final response protocol.",
  },
]);

const parsed = parseAgentResponse(response);

console.dir(parsed, { depth: null });
