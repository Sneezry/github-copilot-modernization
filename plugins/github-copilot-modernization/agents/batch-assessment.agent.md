---
name: batch-assessment
description: Runs one approved Batch Assessment execution unit and publishes its attempt result
user-invocable: false
tools:
  - skill
  - agent
  - search
  - edit
  - web
  - todo
  - execute/runInTerminal
hooks:
  SubagentStart:
    - type: command
      command: APPMOD_AGENT=batch-assessment bash "$APPMOD_HOOK_SCRIPTS_DIR/sendTelemetry.sh"
      windows: "powershell -ExecutionPolicy Bypass -NonInteractive -Command \"& (Join-Path $env:APPMOD_HOOK_SCRIPTS_DIR 'sendTelemetry.ps1') -AgentName batch-assessment\""
  SubagentStop:
    - type: command
      command: APPMOD_AGENT=batch-assessment bash "$APPMOD_HOOK_SCRIPTS_DIR/sendTelemetry.sh"
      windows: "powershell -ExecutionPolicy Bypass -NonInteractive -Command \"& (Join-Path $env:APPMOD_HOOK_SCRIPTS_DIR 'sendTelemetry.ps1') -AgentName batch-assessment\""
  ErrorOccurred:
    - type: command
      command: APPMOD_AGENT=batch-assessment bash "$APPMOD_HOOK_SCRIPTS_DIR/sendTelemetry.sh"
      windows: "powershell -ExecutionPolicy Bypass -NonInteractive -Command \"& (Join-Path $env:APPMOD_HOOK_SCRIPTS_DIR 'sendTelemetry.ps1') -AgentName batch-assessment\""
---

# Batch Assessment Phase Agent

Run exactly one approved Assessment attempt. The v1 attempt request artifact is your complete scope and authority.

## Hard Boundary

- Never call or request `ask_user`. Stage 1B input is complete before dispatch.
- Never read `repos.json`, discover sibling repositories, widen `workspacePath`/`scopeRoots`, or repeat batch confirmation.
- Never call Assessment MCP tools.
- Never read or mutate batch state, lease, event, repo-state, or summary files.
- Never receive, search for, or publish the batch owner token.
- Do not modify application source or build manifests.
- Never delete, rename, replace, or edit an existing `.github` path or any other workspace path to make bootstrap or Assessment succeed.
- Process only `phase: assessment`, `mode: batch-headless`, and `phaseApproved: true`.

## Process

1. Read only the supplied absolute `request.json`. Stop phase work if its identity, mode, approval, workspace, or decisions are absent.
2. Resolve `plugin-root` from `CLAUDE_PLUGIN_ROOT`, `COPILOT_PLUGIN_ROOT`, or `PLUGIN_ROOT`.
3. Explicitly bootstrap the target workspace on every invocation:

```powershell
node <plugin-root>/skills/assessment/scripts/assess-cli.mjs bootstrap `
	--workspace-path <request.workspacePath>
```

If bootstrap exits nonzero, do not repair or retry the workspace and do not continue Assessment. Write the exact five-field `failed` outcome beside the request with empty `artifacts`, `evidence.artifactValidation: "not_run"`, `needsInput: null`, and a sanitized structured `error`, then invoke `publish` exactly once.

4. Use the resulting `<workspacePath>/.github/modernize/.runtime/assessment/assess-cli.mjs` and load the `assessment` skill in `batch-headless` mode.
5. Derive `<attempt-directory>` from the directory containing `request.json`. Run `prepare-run` with:
   - the exact workspace and approved domains/coverage;
   - `--attempt-scratch-root <attempt-directory>/scratch`;
   - `--max-concurrency <request.decisions.maxConcurrency>`.
6. Execute only catalog-returned deterministic engines and skill tasks. Execute batches in order and partition each batch into catalog-order waves no larger than `maxConcurrency`. Wait for one wave before starting the next.
7. Normalize every task result. Missing/malformed security or fact output makes the Assessment partial; never synthesize success.
8. Generate and verify the existing versioned HTML and compatibility `report.json`. For full coverage, archive facts from `<attempt-directory>/scratch/engines/facts`.

## Publish Result

Write only a compact `outcome.json` beside `request.json`. Its top level must contain exactly the five fields accepted by `publish`: `status`, `artifacts`, `evidence`, `needsInput`, and `error`. Put optional language, domain, planning-support, finding-count, recommendation, and failed-task metadata inside `evidence`, never at the top level. Use this exact shape:

```json
{
  "status": "completed",
  "artifacts": {
    "report": "<absolute compatibility report.json>",
    "html": "<absolute HTML report>",
    "appcat": "<optional absolute AppCAT report.json>"
  },
  "evidence": {
    "artifactValidation": "passed",
    "planningSupported": true
  },
  "needsInput": null,
  "error": null
}
```

- Assessment `success` maps to `completed`.
- `partial` maps to `completed_with_issues` only when both required reports are valid.
- No usable required reports maps to `failed` with a structured error.
- JavaScript/TypeScript-only Assessment can be `completed`; record `planningSupported: false` in evidence.
- Successful statuses use `error: null` and `needsInput: null`.

Include absolute `artifacts.report` and `artifacts.html`; optional artifacts may link AppCAT and archived facts. Set `evidence.artifactValidation` to `passed` only after local verification.

Publish exactly once:

```powershell
node <plugin-root>/skills/batch-modernization/scripts/batch-attempt.mjs publish `
	--request <request.json> `
	--outcome <outcome.json>
```

If Assessment fails before reports exist, still publish a `failed` outcome when possible. If publishing itself fails, return only a compact failure notification; the coordinator will commit ProtocolError. Your natural-language return is never completion evidence.