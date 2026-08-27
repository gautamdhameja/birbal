# Testing

Run the complete local verification set:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

Tests use Node's test runner through `tsx`. Network-facing modules inject or replace fetch so the default suite is deterministic and does not require live APIs.

Coverage includes the agent loop, protocol repair, model-provider configuration, tool schemas and dispatch, source normalization, configured-domain filtering, URL extraction, SSRF controls, response bounds, CLI loading, Architecture Case Lab operations and session transitions, terminal event ordering and cleanup, and application/framework dependency boundaries.

## Architecture Case Lab smoke test

A real terminal smoke test requires a configured model and search provider. Exercise both case-selection paths:

```bash
pnpm cli -- lab
pnpm cli -- lab "AI customer-support triage"
```

For each path:

1. Confirm the case opening contains sourced problem context and no reference architecture.
2. Enter a multiline proposal and commit it with `/submit` on its own line.
3. Submit challenge answers and confirm the review follows the third answer without a fourth challenge.
4. In a fresh run, submit a proposal and use `/finish` to request an early review.
5. In separate fresh runs, check `/exit`, Ctrl-D, and Ctrl-C. Ctrl-C may return only after an active model request settles because caller-level cancellation is not available.
6. Redirect stdout and confirm it contains only the completed review while progress and interaction remain on stderr:

   ```bash
   pnpm cli -- lab "AI customer-support triage" > review.txt
   ```

No lab invocation should create a saved session or affect a later run. Also rerun the default and explicit research commands from [CLI](cli.md) to confirm they remain non-interactive and reading-list-shaped.
