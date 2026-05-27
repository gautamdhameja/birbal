# Extension Guide

This guide explains how to add a new app or pipeline without changing the framework.

## Add A Tool

1. Create a tool definition under `src/tools/`.
2. Define `argsSchema` and `resultSchema` with Zod.
3. Implement `run()`.
4. Register it in the Birbal tool registry.
5. Add tests for validation and execution.

## Add A Pipeline Component

Implement one of the framework interfaces:

```ts
const myCollector: SourceCollector = {
  async collect(method, context) {
    return [{ id: "item-1" }];
  },
};
```

Register it:

```ts
registry.registerCollector("my_collector", myCollector);
```

Reference it from pipeline config:

```json
{
  "collectionMethods": [
    {
      "id": "my_collection",
      "collectorId": "my_collector"
    }
  ]
}
```

## Add A Pipeline

1. Create `config/pipelines/my-pipeline.json`.
2. Reference registered component IDs.
3. Set source IDs, limits, content policy, and failure policy.
4. Run a dry-run validation.
5. Add tests for config and component behavior.

```sh
npm run run-pipeline -- my_pipeline --dry-run
```

## Add A Model Adapter

Implement `ModelClient` in a provider-specific module. Keep provider auth, URLs, request shaping, response parsing, and error translation inside the adapter.

Do not put provider-specific behavior in the agent harness.

## Keep Boundaries Clean

- Framework modules should stay generic.
- App modules should adapt domain logic into framework interfaces.
- Config should reference component IDs, not direct imports.
- Structured model outputs should always be schema-validated.
