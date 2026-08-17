---
name: batch-modernization
description: Deterministic local control-plane utilities for parsing, preflighting, validating, and tracking multi-repository modernization batches.
user-invocable: false
---

# Batch Modernization Control Plane

This skill owns deterministic batch configuration and state operations. It does not assess source code, generate plans, execute migrations, or invoke MCP tools.

Stage 1B exposes an explicit-intent private preview for Batch Assessment. Planning, Execution, implicit configuration discovery, retry, and takeover scheduling remain disabled. Use only the scripts under `scripts/`; never edit batch state files manually.

## Hard Boundaries

- Deterministic scripts do not invoke agents, MCP tools, Assessment, Planning, or Execution. The internal coordinator owns phase-agent dispatch.
- Do not modify application source or existing Git worktrees.
- Do not stash, switch branches, fetch, rewrite origins, discard changes, push, or create commits.
- Keep credentials out of command-line arguments and persisted files.
- Treat unknown schema versions, malformed inputs, path escapes, wrong owner tokens, and invalid evidence as blocking errors.
- A takeover lease is read-only. It cannot mutate batch state or schedule work until worker fencing exists.
- Stage 1B starts only attempt 1 for a pending execution unit and permits only one active phase invocation across the batch.

## Inputs

- `config-path`: Absolute or workspace-relative path to `repos.json`.
- `launch-root`: Absolute directory that owns `.github/modernize/batches/` and the default `repos/` clone root.
- `allowed-roots`: Canonical paths already authorized by the host. Supply each separately to workspace inspection.
- `batch-root`: `.github/modernize/batches/<batch-id>` under the launch root.
- `plugin-root`: Resolve from `CLAUDE_PLUGIN_ROOT`, `COPILOT_PLUGIN_ROOT`, or `PLUGIN_ROOT` before invoking plugin scripts.

Read [references/repos-json-compatibility.md](references/repos-json-compatibility.md) before resolving configuration and [references/phase-contract.md](references/phase-contract.md) before creating state or validating a phase result.

## 1. Resolve Configuration

```powershell
node <plugin-root>/skills/batch-modernization/scripts/resolve-repos.mjs `
	--config <config-path> `
	--launch-root <launch-root> `
	--output <batch-scratch>/resolved-repos.json
```

The resolver accepts v1/v2, assigns stable repository and execution-unit IDs, preserves safe unknown metadata, strips URL secrets, and rejects invalid names, path collisions, unsafe include paths, branches, and app references. Do not proceed after a nonzero exit.

## 2. Clone Missing URL Repositories

Clone only repositories approved in the Review. Pass the original URL through the process environment, never an argument or persisted intermediate file:

```powershell
$env:BATCH_CLONE_URL = <original-url>
node <plugin-root>/skills/batch-modernization/scripts/inspect-workspaces.mjs clone `
	--target <target-workspace> `
	--allowed-root <clone-root> `
	--branch <configured-branch>
Remove-Item Env:BATCH_CLONE_URL
```

The script strips HTTP credentials/query/fragment before invoking Git, clones into a unique temporary sibling, and publishes with an atomic rename. Failure removes the temporary directory and leaves the target absent.

## 3. Inspect Workspaces

```powershell
node <plugin-root>/skills/batch-modernization/scripts/inspect-workspaces.mjs inspect `
	--resolved <batch-scratch>/resolved-repos.json `
	--allowed-root <authorized-root-1> `
	--allowed-root <authorized-root-2> `
	--output <batch-scratch>/inspected-repos.json
```

Inspection resolves real paths, rejects symlink/junction escapes, detects supported project languages, and checks Git origin, branch, and dirty state without modifying the repository. `needs_attention` requires a batch-level decision; `blocked` cannot run.

## 4. Initialize Batch State

Initialize Stage 1B from the inspected repositories, approved selection, and Assessment input:

```powershell
node <plugin-root>/skills/batch-modernization/scripts/batch-attempt.mjs initialize-assessment `
	--batch-root <batch-root> `
	--resolved <inspected-repos.json> `
	--selection <selection.json> `
	--input <assessment-input.json>
```

The selection lists `executionUnitIds` and explicitly approved `approvedNeedsAttention` IDs. The input contains a stable `batchId`, original request, `phaseApproved: true`, and decisions for domains, coverage, and `maxConcurrency` from 1 through 7. Blocked or unapproved attention items fail closed.

## 5. Open A Lease Session

```powershell
$session = node <plugin-root>/skills/batch-modernization/scripts/batch-attempt.mjs open-session `
	--batch-root <batch-root> `
	--invocation-id <coordinator-invocation-id> `
	--execution-unit-id <first-execution-unit-id> | ConvertFrom-Json
```

`open-session` starts the first unit and returns its `requestPath` plus a random `leaseSessionId`. The private local worker keeps the raw owner token only in memory. The token is never returned, logged, written to disk, placed in a terminal environment, or sent to a phase agent. Use the session ID only for coordinator lifecycle commands and never include it in the phase prompt.

## 6. Takeover Is Read-Only

A stale lease may be inspected or explicitly taken over for read-only inspection, but `schedulingAllowed` remains false. Do not start a new attempt after takeover in Stage 1B.

## 7. Validate Attempt Results

`validate-result.mjs` checks schema, identity, status/payload consistency, secret safety, canonical artifact containment, artifact existence, and Assessment evidence. Any failure returns `protocol_error`; never convert it to success based on agent prose.

## 8. Stage 1B Attempt Lifecycle

`open-session` starts the first pending unit. Start each later unit through the same lease session:

```powershell
node <plugin-root>/skills/batch-modernization/scripts/batch-attempt.mjs session-start `
	--lease-session-id <lease-session-id> `
	--execution-unit-id <execution-unit-id>
```

The command writes immutable `request.json`, persists Running before dispatch, and returns the request path. Pass only that path to `batch-assessment`.

The phase agent publishes exactly one identity-bound result without an owner token:

```powershell
node <plugin-root>/skills/batch-modernization/scripts/batch-attempt.mjs publish `
	--request <request.json> `
	--outcome <outcome.json>
```

After the phase invocation returns, commit the result regardless of its natural-language return:

```powershell
node <plugin-root>/skills/batch-modernization/scripts/batch-attempt.mjs session-commit `
	--lease-session-id <lease-session-id> `
	--request <request.json>
```

Missing, malformed, mismatched, or unsupported evidence becomes `protocol_error`. Once all units are terminal, write the aggregate summary and release the lease:

```powershell
node <plugin-root>/skills/batch-modernization/scripts/batch-attempt.mjs session-finalize-assessment `
	--lease-session-id <lease-session-id>
```

## Completion

Stage 1B completion means an explicitly approved set of execution units can run sequential Batch Assessment attempts, produce verified existing report formats, and finish with an aggregate summary. It does not authorize Planning or Execution, retry terminal units, or schedule work after takeover. Single-repository defaults and artifacts remain unchanged.