# Batch Mode Stage 0

This directory contains the non-production assets for the Batch Mode regression baseline and platform gates. Nothing here is registered as a product agent, skill, hook, or route.

## Contract Tests

Run every Stage 0 contract test from the repository root:

```powershell
$tests = Get-ChildItem "plugins/github-copilot-modernization/tests/batch-mode/stage0/*.test.mjs" -File |
  Select-Object -ExpandProperty FullName
node --test $tests
```

The tests cover:

- current single-repository routing and artifact anchors;
- seven versioned v1 protocol schemas and examples;
- issue decisions required before Stage 1A;
- integrity of the recorded Copilot CLI platform evidence.

## Real Platform Probe

The real probe uses the isolated plugin under `fixtures/platform-probe/`. It invokes Copilot CLI sessions and therefore is not run by the default test command.

```powershell
node "plugins/github-copilot-modernization/tests/batch-mode/stage0/platform-probe.mjs"
```

Use `--resume` after a failed run to retain already completed repeat/depth evidence when the fixture digest is unchanged:

```powershell
node "plugins/github-copilot-modernization/tests/batch-mode/stage0/platform-probe.mjs" --resume
```

The generated `evidence/platform-probe.json` records the CLI version, fixture digest, repeated-agent markers, depth/tool inheritance, observed fan-out concurrency, and injected partial failure. Concurrency is observational: serialized scheduling is a valid host behavior and must not change Assessment correctness.