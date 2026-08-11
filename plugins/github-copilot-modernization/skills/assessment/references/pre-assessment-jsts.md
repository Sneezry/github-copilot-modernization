# JavaScript/TypeScript Pre-Assessment

Run the pinned npm-check-updates release through the project-local Node runtime:

```bash
node .github/modernize/.runtime/assessment/assess-cli.mjs run-ncu \
  --package-json <absolute-path-to-package.json> \
  --output-dir .github/modernize/.memory/runs/<run-id> \
  --run-id <run-id> \
  --findings .github/modernize/.memory/findings.yaml
```

The command uses `npx --yes npm-check-updates@19.6.3`, writes `js-assessment-report.md`, and writes `js-assessment-result.json`. Persist the normalized result through the standard contract:

```bash
node .github/modernize/.runtime/assessment/assess-cli.mjs record-result \
  --skill javascript-dependency-updates \
  --input .github/modernize/.memory/runs/<run-id>/js-assessment-result.json \
  --findings .github/modernize/.memory/findings.yaml \
  --run-id <run-id> \
  --run-dir .github/modernize/.memory/runs/<run-id>
```

Node.js and npm/npx must be available. AppCAT and the modernization MCP server are not required for this path.