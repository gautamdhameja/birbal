# Structured Output Repair

Structured LLM steps use `completeStructuredWithRepair()` from `src/framework/llm/repair.ts`.

The helper performs a strict two-step flow:

1. Call the model.
2. Parse as strict JSON.
3. Validate with a Zod schema.
4. If parsing or validation fails, retry once with a repair prompt.
5. Return either a valid typed object or a structured `model_parse_error`.

## Example

```ts
const result = await completeStructuredWithRepair({
  messages,
  schema: MySchema,
  completeFn: llamaCppModelAdapter.complete,
  repairInstructions: "Repair this response to match the schema exactly.",
  completeOptions: {
    temperature: 0,
    response_format: { type: "json_object" },
  },
});

if (!result.ok) {
  throw new ModelParseError(result.error);
}
```

## Design Rules

- Validate every structured model output.
- Retry repair once, not forever.
- Include the invalid output and schema description in the repair prompt.
- Treat failed repair as data, not mystery.
- Keep schema ownership near the domain that consumes the output.

This pattern is used by daily scoring, classification, generic rubric scoring, and enterprise use-case extraction.
