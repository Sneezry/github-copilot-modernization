# .NET Pre-Assessment

.NET pre-assessment uses the project-local Node runtime. Do not call assessment MCP tools.

## Install Or Verify AppCAT

```bash
node .github/modernize/.runtime/assessment/assess-cli.mjs ensure-appcat \
  --language dotnet
```

This requires .NET SDK 8, 9, or 10 and installs or updates `dotnet-appcat` under `~/.appcat-dotnet/`. Minimum supported version is 1.0.1127. Use `--force true` only for repair.

## Run AppCAT

```bash
node .github/modernize/.runtime/assessment/assess-cli.mjs run-appcat \
  --language dotnet \
  --workspace-path <absolute-project-root> \
  --run-dir .github/modernize/.memory/runs/<run-id>
```

The command requires a `.sln` or `.slnx` file, preferring `.slnx`, and excludes `bin/` and `obj/`. It runs APPMODJSON analysis with protected privacy mode and writes `.github/modernize/.memory/runs/<run-id>/report.json`.

## Integrate Findings

```bash
node .github/modernize/.runtime/assessment/assess-cli.mjs integrate-appcat \
  --report .github/modernize/.memory/runs/<run-id>/report.json \
  --findings .github/modernize/.memory/findings.yaml \
  --run-id <run-id>
```

The integration step is mandatory whenever AppCAT succeeds.