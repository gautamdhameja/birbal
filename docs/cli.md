# CLI

Birbal ships a top-level command named `birbal`.

For local development, install dependencies and link the package:

```sh
npm install
npm link
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

Enable trace logs:

```sh
birbal agent --trace "Use a tool to get the current time."
birbal use-cases --trace
```

## NPM Script Wrappers

The npm scripts remain available for repo-local workflows, but they call the same CLI:

```sh
npm run dev -- "Use a tool to get the current time."
npm run daily
npm run use-cases
npm run run-pipeline -- daily
```

Prefer `birbal ...` when using the project interactively.
