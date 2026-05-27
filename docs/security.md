# Security Notes

Birbal is local-first, but it still touches external URLs, local files, model outputs, and package dependencies. Treat those boundaries carefully.

## Dependency Policy

Before installing or upgrading npm packages:

- Check for known supply-chain attacks.
- Check for malicious releases or typosquats.
- Check current audit status.
- Prefer the safest acceptable version, even if it is not the newest release.

## URL Fetching

Content fetching uses public HTTP safety checks:

- Rejects unsafe URL shapes.
- Resolves hosts before fetch.
- Blocks private address targets.
- Revalidates redirect targets.
- Uses timeouts and retry policy.
- Does not treat blocked pages as crashes.

## Model Output

Model output is untrusted. Structured steps must:

- Parse strict JSON.
- Validate with Zod.
- Repair at most once.
- Return or throw structured errors.

Never execute model-generated code.

## Tool Calls

The model cannot call tools directly. It can only request a tool call through JSON. The harness validates the response, then the tool executor validates arguments before running the tool.

## Local Data

`data/agent.db` and `digests/` are local runtime outputs and are ignored by Git. The database may contain raw fetched text and model outputs.
