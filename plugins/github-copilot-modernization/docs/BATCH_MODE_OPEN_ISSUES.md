# Batch Assessment Issue Register

> Status: Assessment-only issue register
>
> Updated: 2026-08-19
>
> Scope: local, sequential, whole-repository Batch Assessment only

## 1. Rules

- An issue belongs here only when it blocks current Batch Assessment or its parity with Single Assessment.
- Future Batch Planning, Execution, retry, resume, pause, takeover scheduling, `include_paths`, distribution, concurrency, and cloud work are not tracked as deferred issues.
- Existing defensive primitives may remain in code without creating future product commitments.
- Status values are `Open` or `Closed`.

## 2. Summary

| ID | Priority | Status | Issue |
|---|---:|---|---|
| BM-002 | P0 | Closed | Unenforceable `include_paths` scope |
| BM-003 | P1 | Closed | Assessment correctness depended on high fan-out concurrency |
| BM-006 | P0 | Closed | Workspace, Git, path, and credential safety |
| BM-008 | P0 | Closed | Assessment result validation permitted false success |
| BM-009 | P0 | Closed | Attempt lifecycle was not crash-consistent |
| BM-010 | P0 | Closed | Current package lacks complete cross-platform/real-repository release evidence |
| BM-011 | P0 | Closed | Batch drops explicit Single Assessment configuration fields |
| BM-012 | P0 | Closed | Language defaults and mixed-language unit behavior diverge from Single |
| BM-013 | P1 | Closed | Batch aggregate summary omits Single severity/state/recommendation semantics |

## 3. Closed Issues

### BM-002: Unenforceable `include_paths` Scope

**Status:** Closed by exclusion

Prompt-only scope could not prove that production search/read tools excluded sibling paths. Stage 1B now rejects every `source: include-path` execution unit before manifest, state, lease, or attempt creation.

There is no plan in the current design to reopen `include_paths`. Resolver identity support may remain as an inert compatibility primitive.

### BM-003: Concurrency-Dependent Assessment Correctness

**Status:** Closed

Facts and security task sets are capacity-independent. Capacity is a ceiling, and correctness is verified at `maxConcurrency=1`. Cross-repository scheduling is always sequential and no future concurrency work is planned here.

### BM-006: Workspace, Git, Path, And Credential Safety

**Status:** Closed

Implemented evidence covers canonical containment, symlink/junction escape rejection, safe repository IDs, URL credential/query/fragment redaction, origin/branch validation, dirty workspace Review, temporary clone publication, failed clone cleanup, and secret-safe persisted state.

### BM-008: Assessment Result Validation Permitted False Success

**Status:** Closed

Successful and partial results now require:

- `artifactValidation: passed`;
- compatibility-report v1.1.0 schema;
- request-bound run, language, domain, and coverage identity;
- matching self-contained HTML payload;
- AppCAT when applicable;
- all six facts for full coverage;
- terminal security evidence;
- canonical contained artifact paths;
- immutable SHA-256 digests.

Missing, empty, stale, fabricated, or mismatched evidence becomes `ProtocolError`.

### BM-009: Attempt Lifecycle Was Not Crash-Consistent

**Status:** Closed

Each attempt persists digest-bound validation before terminal state. Start, commit, and finalization replay the same immutable identity, reject conflicts, and deduplicate lifecycle events. Finalization binds the aggregate report and summaries before releasing the lease.

This is local crash consistency, not a user-facing resume feature.

### BM-011: Explicit Single Assessment Configuration Was Dropped

**Status:** Closed

All six optional Single fields now flow through Review, immutable request, phase execution, canonical report intent, validation, and aggregate metadata. Omitted values remain omitted; unsupported shapes fail closed.

### BM-012: Language Defaults And Mixed-Language Units Diverged

**Status:** Closed

Effective domains are resolved per execution unit using Single defaults. Review exposes each effective Assessment. A unit with more than one detected language is excluded in Review and rejected again before manifest/state creation.

### BM-013: Aggregate Summary Was Below Single Semantics

**Status:** Closed

Validated HTML payloads now drive repository and aggregate severity/state buckets, top recommendations, and normalized Planning support. The publisher, index, internal summary, TUI contract, and product-evidence validator use the same deterministic values.

## 4. Open Issues

### BM-010: Current-Package Release Evidence Is Incomplete

**Priority:** P0

**Status:** Closed

Windows and POSIX supported product-host scenarios pass on the same package digest. Same-digest Spring Petclinic/Airsonic acceptance passes with aggregate report delivery, request-bound repository reports, strict sequencing, source canaries, and unchanged tracked files.

ACP permission-event injection is diagnostic, not a closure requirement. The current host emits permission requests but does not expose a target-identifiable request for nested `batch-assessment` dispatch. Missing-result and partial aggregation remain covered by deterministic control-plane tests.

## 5. Removed From Scope

The following historical issue IDs are no longer open or deferred work:

| ID | Previous topic | Current decision |
|---|---|---|
| BM-001 | Takeover fencing and cross-session recovery | Removed. Product does not schedule after takeover or resume stale batches. Existing CAS primitives remain inert. |
| BM-004 | Persisted `NeedsInput` protocol | Removed. Batch Assessment requires complete approved input before Start. |
| BM-005 | Normal pause signaling | Removed. Product offers no normal mid-run pause contract. |
| BM-007 | Retry waves and reopened progress | Removed. Product offers no terminal-unit retry; users start a new Batch Assessment. |

Reintroducing any removed topic requires a new product proposal rather than changing this Assessment issue register.

## 6. Decision Log

| Date | Decision |
|---|---|
| 2026-08-12 | Establish deterministic repository resolution, execution-unit identity, lease, and result protocols. |
| 2026-08-18 | Close false-success and crash-consistency issues; reject `include_paths` before execution. |
| 2026-08-19 | Keep `modernize` as the sole public entry and require default-config Batch/Single selection. |
| 2026-08-19 | Publish user-facing aggregate reports using the shared Modernization CLI outer layout. |
| 2026-08-19 | Remove all unstarted non-Assessment expansion from the Batch plan. |
| 2026-08-19 | Define remaining work strictly by Single Assessment parity and current-package release evidence. |
