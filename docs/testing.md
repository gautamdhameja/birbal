# Testing

Run the complete local verification set:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

Tests use Node's test runner through `tsx`. Network-facing modules inject or replace fetch so the default suite is deterministic and does not require live APIs.

Coverage includes the agent loop, protocol repair, model-provider configuration, tool schemas and dispatch, source normalization, configured-domain filtering, URL extraction, SSRF controls, response bounds, and CLI loading.
