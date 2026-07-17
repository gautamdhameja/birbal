import { z } from "zod";

import { FRAMEWORK_TOOLS } from "./constants.js";
import type { ToolDefinition } from "./types.js";

export type ToolRegistryOptions = {
  allowOverwrite?: boolean;
};

function assertToolName(name: string): void {
  if (name.trim().length === 0) {
    throw new Error("Tool name must not be empty.");
  }
}

function renderArgsSchema(argsSchema: z.ZodType): string {
  const { $schema: _schema, ...jsonSchema } = z.toJSONSchema(argsSchema);
  const objectSchema = jsonSchema as {
    properties?: Record<string, { default?: unknown }>;
    required?: string[];
  };

  if (objectSchema.properties && objectSchema.required) {
    objectSchema.required = objectSchema.required.filter(
      (propertyName) => !("default" in (objectSchema.properties?.[propertyName] ?? {})),
    );
  }

  return JSON.stringify(jsonSchema);
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(private readonly options: ToolRegistryOptions = {}) {}

  register(tool: ToolDefinition): void {
    assertToolName(tool.name);
    if (!this.options.allowOverwrite && this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
  }

  registerMany(tools: readonly ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  renderForPrompt(): string {
    return this.list()
      .map((tool) =>
        [
          `${FRAMEWORK_TOOLS.PROMPT_LABELS.NAME}: ${tool.name}`,
          `${FRAMEWORK_TOOLS.PROMPT_LABELS.DESCRIPTION}: ${tool.description}`,
          `${FRAMEWORK_TOOLS.PROMPT_LABELS.ARGS}: ${renderArgsSchema(tool.argsSchema)}`,
        ].join("\n"),
      )
      .join("\n\n");
  }
}
