# Structured Output

The model must return one strict JSON object for either a tool call or final answer. Surrounding prose and embedded JSON are rejected.

`completeStructuredWithRepair()` supports typed model calls outside the main protocol. It parses strict JSON, validates against a Zod schema, sends one repair turn with the target schema when needed, and returns either typed data or a structured parse error.

Logs record bounded diagnostics and output shape, not full model payloads.
