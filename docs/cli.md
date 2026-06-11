# CLI

Birbal ships a top-level command named `birbal`.

For local development, install dependencies and link the package:

```sh
pnpm install
pnpm link --global
```

The package binary is `bin/birbal.js`. It launches the TypeScript CLI in `src/cli.ts` through the local `tsx` runtime, so the command works without a separate build step.

## Commands

Run the agent harness:

```sh
birbal agent "Use a tool to get the current time."
```

Run the daily reading pipeline:

```sh
birbal daily
```

Run the enterprise use-case scout:

```sh
birbal use-cases
```

`birbal use-cases` uses bounded adaptive search. By default it searches up to five configured
queries, processes the accumulated URL snapshot, and repeats with the next query batch if the
selector cannot fill the requested report size. The configured default is at most three attempts,
so the normal cap is 15 Brave Search calls for one full use-case run.

Search once, then rerun model processing against the stored URL snapshot:

```sh
birbal use-cases search
birbal use-cases process --snapshot latest
```

Shortcut form:

```sh
birbal use cases
```

Run any configured pipeline by ID:

```sh
birbal pipeline use_cases
birbal pipeline daily
```

Dry-run a pipeline without network or model calls:

```sh
birbal pipeline use_cases --dry-run
birbal use-cases --dry-run --limit 3
```

`--limit` controls the final output count for full pipeline runs. It does not reduce the upstream
search, fetch, extraction, or verification pool. For `birbal use-cases search`, `--limit` controls
the stored search snapshot candidate count because that command only creates a URL snapshot.

Enable trace logs:

```sh
birbal agent --trace "Use a tool to get the current time."
birbal use-cases --trace
```

## PNPM Script Wrappers

The pnpm scripts remain available for repo-local workflows, but they call the same CLI:

```sh
pnpm dev -- "Use a tool to get the current time."
pnpm daily
pnpm use-cases
pnpm run-pipeline daily
```

Prefer `birbal ...` when using the project interactively.
