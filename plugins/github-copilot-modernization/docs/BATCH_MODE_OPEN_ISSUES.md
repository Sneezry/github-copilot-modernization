# Batch Mode Open Issues

> Status: Open issue register
> Created: 2026-08-12
> Design baseline: `BATCH_MODE_DESIGN.md`
> Baseline SHA-256: `06E99B12BF05523FE0978E10F85AE5A7C6237B9E0A8286DB5C725DE6BF479750`

## 1. Purpose

This document tracks unresolved questions found during review of the batch-mode design. It is intentionally separate from `BATCH_MODE_DESIGN.md` so that the design remains a stable baseline while decisions are pending.

Working rules:

- Record new concerns here with a stable `BM-NNN` identifier.
- Update status, decisions, and evidence here instead of repeatedly editing the design.
- Do not modify the design baseline for an open issue.
- Change the design only after an explicit decision, then mark the corresponding issue `Closed` and link the implementing change.
- Status values are `Open`, `Decided`, `Closed`, or `Deferred`.

## 2. Summary

| ID | Priority | Status | Issue | Blocks |
|---|---|---|---|---|
| BM-001 | P0 | Deferred | Takeover does not fence the previous worker | Stage 1 recovery |
| BM-002 | P0 | Decided | `include_paths` has no execution-unit identity or enforceable scope | Stage 1 scope correctness |
| BM-003 | P0 | Decided | Assessment correctness assumes six/seven simultaneous subagents | Stage 1 platform gate |
| BM-004 | P1 | Deferred | `NeedsInput` has no complete persisted protocol | Stage 2 and Stage 3 |
| BM-005 | P1 | Decided | Normal pause assumes unverified mid-invocation user signaling | Stage 1 pause UX |
| BM-006 | P1 | Closed | Path, URL, branch, and clone safety rules are incomplete | Stage 1 workspace safety |
| BM-007 | P1 | Decided | Retry, progress, skip, and aggregate-result semantics conflict | Stage 1 state model |

## 3. Open Issues

### BM-001: Takeover Does Not Fence The Previous Worker

- **Priority:** P0
- **Status:** Deferred
- **Design references:** Sections 7.5, 8.2, 8.4, and 13.3

**Problem**

Lease rotation prevents the previous coordinator from committing more batch-state updates, but it cannot stop an already-running phase agent from continuing to modify application files or write phase artifacts. A new owner can mark that invocation `Interrupted` and start another attempt against the same workspace while the previous worker is still active.

The phase request also gives the child the batch owner `leaseToken`. This exposes a batch-wide write capability where an attempt-scoped capability would be sufficient.

Current Assessment output paths increase the risk because facts and security incoming files use canonical repository-level paths rather than attempt-scoped paths.

**Risk**

- Two attempts can concurrently modify the same worktree.
- Old and new Assessment attempts can clear or overwrite one another's files.
- State can report a clean takeover while side effects from the old invocation continue.

**Decision required**

Choose a fencing model before recovery is implemented. Candidate directions include an OS/process lock, explicit confirmation that the old process has terminated, or prohibiting a new attempt against the same workspace while liveness is uncertain. The owner token should remain with the coordinator; phase agents should receive only an attempt-scoped result capability.

**Stage 0 decision (2026-08-12)**

Takeover and cross-session retry are deferred from the initial Batch Assessment preview. A stale lease permits read-only inspection but never authorizes a new attempt against that workspace. The batch owner token remains coordinator-only; the v1 attempt-request schema rejects `leaseToken`. This issue must be closed before takeover can schedule work or before any Batch Execution capability is enabled.

**Closure criteria**

- A takeover test keeps an old worker alive and proves a new attempt cannot overlap its side effects.
- All retryable phase outputs are attempt-scoped or otherwise protected by the same fence.
- No batch-wide owner token is included in a phase-agent prompt.

### BM-002: `include_paths` Lacks Execution-Unit Identity And Scope Enforcement

- **Priority:** P0
- **Status:** Decided
- **Design references:** Sections 5.5, 7.5, 8.1, and 13.6 scenario 19

**Problem**

The design can turn several `include_paths` entries into separate execution units, but persistence and idempotency remain keyed only by `repoId`. It does not define a stable execution-unit ID, artifact path, status record, or aggregation rule for multiple subprojects in one repository.

When the repository root is itself recognizable, the design instead passes `include_paths` as a scope constraint. Existing Assessment contracts accept only `workspace-path`; the deterministic engines and six fact/seven security skills are not required to enforce a set of included roots. A prompt-level constraint therefore cannot guarantee that excluded files are not analyzed or modified.

**Risk**

- Multiple subprojects can collide in state and attempt paths.
- Assessment can read outside the selected scope.
- Planning and Execution can silently operate on a broader scope than Assessment.

**Decision required**

Define an `executionUnitId` and canonical `scopeRoots`. Either run each included project with that path as its workspace or add deterministic scope enforcement to every participating engine and worker. Prompt instructions alone are not sufficient.

**Stage 0 decision (2026-08-12)**

Repository identity and execution-unit identity are separate v1 contract fields. With no `include_paths`, the repository root is one execution unit. When `include_paths` is present, every valid recognized project path becomes its own execution unit and its canonical path becomes `workspacePath` and the sole initial `scopeRoot`; the root-plus-prompt-constraint alternative is rejected. Execution units sharing a Git root remain serialized. Stage 1A must implement canonical path enforcement before this issue can close.

**Closure criteria**

- State and result schemas distinguish repository identity from execution-unit identity.
- Two valid paths in one Git root produce isolated results while worktree mutation remains serialized.
- Tests prove excluded sibling paths are not read or modified.

### BM-003: Assessment Requires Unverified Six/Seven-Way Concurrency

- **Priority:** P0
- **Status:** Decided
- **Design references:** Sections 7.1, 11, and 12 Stage 0

**Problem**

The local catalog declares facts as six parallel tasks and security as seven parallel tasks, and the Assessment skill requires every task in a batch to be issued concurrently. Existing platform probes establish repeated agent invocation and nesting depth, but not reliable seven-way fan-out, host capacity, throttling behavior, or partial completion semantics.

Correctness should not depend on every task starting simultaneously.

**Risk**

- Hosts with a lower concurrency limit can fail an otherwise valid Assessment.
- Throttling or one failed invocation can make the whole batch ambiguous.
- The documented maximum becomes a required pool size rather than a safe ceiling.

**Decision required**

Treat catalog concurrency as an upper bound. Define a scheduler that can use bounded waves or a sequential fallback without changing outputs or result semantics.

**Stage 0 decision (2026-08-12)**

`maxConcurrency` is a ceiling, never a required pool size. The scheduler must preserve results at a configured limit of one and may use bounded waves up to the host-observed capacity. Copilot CLI 1.0.79 completed fan-outs of 1, 2, 6, and 7, but the same two-child request has been observed both serialized and overlapped across runs; scheduling is therefore not stable enough to be a correctness condition. A seven-child run with one injected tool failure still launched and completed all seven child invocations. The latest per-run observations are stored in `tests/batch-mode/stage0/evidence/platform-probe.json`.

**Closure criteria**

- The same catalog passes with concurrency limits of 1 and 7.
- Stage 0 includes a real fan-out/throttling probe.
- Partial launch and partial completion have deterministic result states.

### BM-004: `NeedsInput` Has No Complete Persisted Protocol

- **Priority:** P1
- **Status:** Deferred
- **Design references:** Sections 7.2, 7.3, 7.5, and 9

**Problem**

The result example contains only `needsInput: null`. The design does not define question IDs, input types, options, validation, answer storage, source attempt linkage, or how an answer is injected into the replacement attempt. Repository state includes `Needs input`, but the batch-level result table has no `AwaitingInput` state and does not define lease behavior while waiting for a user response.

**Risk**

- Answers can be applied to the wrong repository or stale attempt.
- Recovery cannot reliably reconstruct pending questions.
- A batch can remain neither terminal nor resumable after the coordinator session ends.

**Decision required**

Specify versioned question and answer schemas, an `AwaitingInput` batch state, lease release/reacquisition behavior, validation rules, and skip/cancel semantics.

**Stage 0 decision (2026-08-12)**

The v1 question/answer shape is drafted for compatibility, but the behavior is deferred to Stage 2. Initial Batch Assessment accepts only fully approved inputs and must stop rather than synthesize defaults if input is missing. Batch Planning and Batch Execution remain disabled until this protocol is implemented and tested across sessions.

**Closure criteria**

- Pending questions survive a new top-level session.
- Stale or duplicate answers are rejected deterministically.
- Answering, skipping, and cancelling each lead to a defined state transition.

### BM-005: Normal Pause Assumes Mid-Invocation User Signaling

- **Priority:** P1
- **Status:** Decided
- **Design references:** Sections 8.4 and 13.6 scenario 14

**Problem**

The design says the coordinator can record `pause requested` while a phase agent is running, then wait for the invocation boundary. It has not established that Copilot CLI can deliver a new user instruction to a coordinator that is blocked on an active subagent call. `Ctrl+C` is separately classified as an abnormal interruption and cannot provide the normal pause semantics.

**Decision required**

Validate queued input during an active invocation, or redesign scheduling to yield control at explicit repository checkpoints. If neither is available, remove normal mid-invocation pause from the contract and support pause only between user-triggered continuation turns.

**Stage 0 decision (2026-08-12)**

The initial implementation supports normal pause only at an invocation boundary where the coordinator has control. It does not promise delivery of a pause request while blocked on a child invocation. `Ctrl+C` remains an abnormal interruption. Mid-invocation normal pause may be reconsidered only after a separate platform probe demonstrates queued input delivery.

**Closure criteria**

- A platform probe demonstrates the selected interaction model.
- Pause behavior is deterministic both during and between repository invocations.

### BM-006: Workspace And Git Safety Rules Are Incomplete

- **Priority:** P1
- **Status:** Closed
- **Design references:** Sections 5.4 through 5.8, 7.5, and 13.3

**Problem**

The design requires paths to remain within approved roots but does not define canonical `realpath` handling for symlinks, Windows junctions, or other reparse points. URL redaction mentions secret query parameters but not credentials in URL userinfo or fragments. Existing-directory behavior does not fully specify equivalent origin forms, a clean repository on the wrong configured branch, fetch policy, or partial clone cleanup.

**Risk**

- Lexically valid paths can escape through links or junctions.
- Credentials can leak into manifest, events, errors, or summaries.
- Equivalent Git remotes can be rejected, or the wrong branch can be assessed.
- A failed clone can leave a directory that blocks every retry.

**Decision required**

Define canonical path containment, reparse-point policy, complete URL sanitization, normalized remote identity, branch/fetch behavior, and clone-to-temporary-then-rename semantics.

**Stage 0 decision (2026-08-12)**

Stage 1A must compare canonical real paths, reject scope escapes through symlinks or Windows reparse points, strip URL userinfo/query/fragment from every persisted or displayed form, normalize equivalent HTTPS/SSH remote identities, and clone into a unique temporary sibling before atomic rename. Existing clean repositories must match the requested normalized origin and branch; no implicit fetch, branch switch, stash, or origin rewrite is allowed during preflight.

**Closure evidence (2026-08-12)**

`skills/batch-modernization/scripts/inspect-workspaces.test.mjs`, `resolve-repos.test.mjs`, and `batch-state.test.mjs` cover canonical containment, POSIX symlink/Windows junction escape, sanitized ID collisions, reserved filenames, URL and plain credential redaction, equivalent SSH/HTTPS origin identity, branch mismatch, dirty workspace, temporary clone publication, failed clone cleanup, and persisted-state secret rejection. The control plane performs no fetch, switch, stash, origin rewrite, source edit, or commit.

**Closure criteria**

- Cross-platform tests cover symlink/junction escape and path collisions.
- URL userinfo, query, and fragment secrets never reach persisted artifacts.
- Existing clean repositories and interrupted clones have deterministic outcomes.

### BM-007: Retry And Aggregate Result Semantics Conflict

- **Priority:** P1
- **Status:** Decided
- **Design references:** Sections 6.5, 7.4, 8.5, 9, and 13.2

**Problem**

Progress counts only terminal repositories and must never decrease, while retrying a terminal repository creates a new running attempt. The design does not say whether the repository remains terminal, whether the batch reopens, or whether progress starts a new retry wave.

The same state model also uses `Skipped` for user exclusion, expected language non-applicability, and failed prerequisites. Any `Skipped` result makes the aggregate `Completed with issues`, so a successful Java-only action over an intentionally mixed portfolio is reported as problematic merely because .NET and JavaScript repositories were expectedly not applicable.

**Decision required**

Separate current repository state from attempt history and define retry-wave progress. Distinguish at least `NotApplicable`, `Excluded`, and failed/blocked prerequisites, then specify which outcomes affect the denominator and aggregate health.

**Stage 0 decision (2026-08-12)**

The initial Batch Assessment preview has no retry action. The v1 state contract separates `not_applicable`, `excluded`, and `blocked`; expected non-applicability and user exclusion do not degrade aggregate health and are excluded from the eligible denominator. When retry is later enabled, it creates a new wave with its own monotonic progress counters while preserving prior attempt history.

**Closure criteria**

- Progress remains meaningful and monotonic during retry.
- Reopening a completed batch has a defined batch state.
- Expected non-applicability does not degrade a successful aggregate result.

## 4. Confirmed Non-Issues

The following points were reviewed and are currently consistent. Do not reopen them without new evidence:

- Assessment is local and has no Assessment MCP dependency.
- Full coverage uses exactly six fact skills.
- Security uses exactly seven independent top-level skills.
- The maximum catalog batch is seven; there is no fixed twelve-subagent pool. BM-003 concerns scheduling semantics, not inventory size.
- Cross-session recovery does not require restoring an old subagent. Reconstructing state from disk and creating a new attempt is valid; BM-001 concerns overlapping side effects during takeover.
- `modernize` remains the single public agent entry. No separate user-invocable batch agent is required.

## 5. Decision Log

| Date | Issue | Decision | Status | Evidence |
|---|---|---|---|---|
| 2026-08-12 | BM-001 through BM-007 | Issues recorded separately; design baseline intentionally unchanged | Open | Initial design review |
| 2026-08-12 | BM-001 | Defer takeover scheduling; stale leases are read-only | Deferred | Stage 0 attempt-request v1 |
| 2026-08-12 | BM-002 | Model every selected project as a distinct execution unit | Decided | Stage 0 execution-unit v1 |
| 2026-08-12 | BM-003 | Treat concurrency as a ceiling with sequential fallback | Decided | `tests/batch-mode/stage0/evidence/platform-probe.json` |
| 2026-08-12 | BM-004 | Draft schema now; defer persisted interaction to Stage 2 | Deferred | Stage 0 needs-input v1 |
| 2026-08-12 | BM-005 | Support normal pause only at invocation boundaries | Decided | Stage 0 capability review |
| 2026-08-12 | BM-006 | Require canonical containment, complete redaction, and atomic clone publish | Decided | Stage 0 capability review |
| 2026-08-12 | BM-007 | Defer retry; separate non-applicable, excluded, and blocked states | Decided | Stage 0 batch-state v1 |
| 2026-08-12 | BM-006 | Stage 1A path, Git, credential, and clone safety implementation verified | Closed | `skills/batch-modernization/scripts/*.test.mjs` |