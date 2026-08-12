---
name: batch-modernization
description: Deterministic local control-plane utilities for parsing, preflighting, validating, and tracking multi-repository modernization batches.
user-invocable: false
---

# Batch Modernization Control Plane

This skill owns deterministic batch configuration and state operations. It does not assess source code, generate plans, execute migrations, or invoke MCP tools.

Stage 1A is not connected to the public `modernize` route. Use only the scripts under `scripts/`; never edit batch state files manually.

## Hard Boundaries

- Do not invoke agents, MCP tools, Assessment, Planning, or Execution.
- Do not modify application source or existing Git worktrees.
- Do not stash, switch branches, fetch, rewrite origins, discard changes, push, or create commits.
- Keep credentials out of command-line arguments and persisted files.
- Treat unknown schema versions, malformed inputs, path escapes, wrong owner tokens, and invalid evidence as blocking errors.
- A takeover lease is read-only. It cannot mutate batch state or schedule work until worker fencing exists.

## Inputs

- `config-path`: Absolute or workspace-relative path to `repos.json`.
- `launch-root`: Absolute directory that owns `.github/modernize/batches/` and the default `repos/` clone root.
- `allowed-roots`: Canonical paths already authorized by the host. Supply each separately to workspace inspection.
- `batch-root`: `.github/modernize/batches/<batch-id>` under the launch root.

Read [references/repos-json-compatibility.md](references/repos-json-compatibility.md) before resolving configuration and [references/phase-contract.md](references/phase-contract.md) before creating state or validating a phase result.

## 1. Resolve Configuration

```powershell
node skills/batch-modernization/scripts/resolve-repos.mjs `
	--config <config-path> `
	--launch-root <launch-root> `
	--output <batch-scratch>/resolved-repos.json
```

The resolver:

- accepts v1 array and v2 object formats;
- assigns separate `repoId` and `executionUnitId` values;
- creates one execution unit per selected project path;
- preserves unknown metadata while redacting secret-bearing values;
- strips URL credentials, query, and fragment from persisted URLs;
- rejects invalid names, duplicate/colliding IDs, unsafe include paths, invalid branches, and invalid app references.

Do not proceed after a nonzero exit.

## 2. Clone Missing URL Repositories

Clone only repositories marked as requiring clone. Pass the original URL through the process environment, never an argument or persisted intermediate file:

```powershell
$env:BATCH_CLONE_URL = <original-url>
node skills/batch-modernization/scripts/inspect-workspaces.mjs clone `
	--target <target-workspace> `
	--allowed-root <clone-root> `
	--branch <configured-branch>
Remove-Item Env:BATCH_CLONE_URL
```

The script strips HTTP credentials/query/fragment before invoking Git, clones into a unique temporary sibling, and publishes with an atomic rename. Failure removes the temporary directory and leaves the target absent.

## 3. Inspect Workspaces

```powershell
node skills/batch-modernization/scripts/inspect-workspaces.mjs inspect `
	--resolved <batch-scratch>/resolved-repos.json `
	--allowed-root <authorized-root-1> `
	--allowed-root <authorized-root-2> `
	--output <batch-scratch>/inspected-repos.json
```

Inspection validates the production schema before filesystem access, resolves real paths, rejects symlink/junction escapes, detects supported project languages, and checks Git origin, branch, and dirty status without changing the repository.

Only `ready` execution units can enter a phase. `needs_attention` requires a batch-level user decision. `blocked` cannot run.

## 4. Initialize Batch State

Create a sanitized immutable manifest input, then initialize:

```powershell
node skills/batch-modernization/scripts/batch-state.mjs initialize `
	--batch-root <batch-root> `
	--manifest <manifest-input.json>
```

Initialization refuses any pre-existing control file. It creates the v1 manifest, state, empty event log, repo directory, and attempt directory using durable writes.

## 5. Acquire And Hold The Lease

```powershell
$lease = node skills/batch-modernization/scripts/batch-state.mjs acquire-lease `
	--batch-root <batch-root> `
	--invocation-id <coordinator-invocation-id> | ConvertFrom-Json
$env:BATCH_OWNER_TOKEN = $lease.ownerToken
```

Keep `ownerToken` only in coordinator memory/environment. Never put it in a prompt, request artifact, state file, event, summary, or log. Every mutation validates the active digest and is serialized with takeover.

Available owner commands:

```text
read-state
update-status --status <status>
append-event --event <event-input.json>
write-repo-state --repo-id <repo-id> --state <repo-state-input.json>
write-summary --summary <summary-input.json> --markdown <summary.md>
assert-scheduling
release-lease
```

All mutation commands read `BATCH_OWNER_TOKEN` from the environment. Clear it after release.

## 6. Takeover Is Read-Only

Use `inspect-lease` to obtain the current `leaseFileDigest`. A user-approved takeover performs compare-and-swap:

```powershell
node skills/batch-modernization/scripts/batch-state.mjs takeover-lease `
	--batch-root <batch-root> `
	--expected-digest <lease-file-digest> `
	--invocation-id <new-invocation-id>
```

The returned lease has `schedulingAllowed: false`. It may be inspected or released, but every state/event/repo/summary mutation and `assert-scheduling` fail closed. Do not start a new attempt after takeover in Stage 1A.

## 7. Validate Attempt Results

```powershell
node skills/batch-modernization/scripts/validate-result.mjs `
	--result <attempt-result.json> `
	--batch-root <batch-root> `
	--workspace <execution-unit-workspace> `
	--batch-id <batch-id> `
	--invocation-id <invocation-id> `
	--repo-id <repo-id> `
	--execution-unit-id <execution-unit-id> `
	--phase <assessment|planning|execution> `
	--attempt <number>
```

Validation checks schema, identity, status/payload consistency, secret safety, canonical artifact containment, artifact existence, and phase-specific evidence. Any failure returns `protocol_error`; never convert it to success based on agent prose.

## Completion

Stage 1A completion means sanitized configuration and verified control artifacts exist. It does not authorize or start a business phase. The public route and current single-repository workflow remain unchanged.