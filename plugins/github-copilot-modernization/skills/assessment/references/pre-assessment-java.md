# Java Pre-Assessment

Java pre-assessment uses the project-local Node runtime. Do not call assessment MCP tools.

## Install Or Verify AppCAT

```bash
node .github/modernize/.runtime/assessment/assess-cli.mjs ensure-appcat \
  --language java
```

Use `--force true` only when the installed binary is corrupt or below the required version. AppCAT is installed under `~/.appcat/`; minimum version is 7.7.0.8.

## Run AppCAT

Create the current run directory first, then run:

```bash
node .github/modernize/.runtime/assessment/assess-cli.mjs run-appcat \
  --language java \
  --workspace-path <absolute-project-root> \
  --run-dir .github/modernize/.memory/runs/<run-id> \
  --targets azure-aks,azure-appservice,azure-container-apps \
  --mode issue-only
```

Add `--capabilities openjdk21,containerization` or `--target-os linux,windows` only when the user explicitly selected those constraints. The command writes `.github/modernize/.memory/runs/<run-id>/report.json`.

## Integrate Findings

```bash
node .github/modernize/.runtime/assessment/assess-cli.mjs integrate-appcat \
  --report .github/modernize/.memory/runs/<run-id>/report.json \
  --findings .github/modernize/.memory/findings.yaml \
  --run-id <run-id>
```

The integration aggregates AppCAT incidents by stable rule identity, drops discovery-only rules, preserves user-owned finding state, and propagates rationale, links, effort, and all evidence locations.

Skip AppCAT when the selected assessment is security-only. CVE and CWE groups run through their atomic skills instead.