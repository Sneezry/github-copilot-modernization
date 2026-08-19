# Batch Assessment Implementation Plan

> Status: Assessment-only implementation complete; parity and release evidence remain
>
> Updated: 2026-08-19
>
> Design baseline: `BATCH_MODE_DESIGN.md`

## 1. Purpose

This plan completes local, sequential Batch Assessment by reusing the existing Single Assessment implementation.

It does not plan Batch Planning, Batch Execution, a complete modernization pipeline, retry/resume/pause, takeover scheduling, `include_paths`, app output distribution, cross-repository concurrency, cloud delegation, or Batch-specific worker/telemetry architecture.

Already implemented defensive primitives are retained. They are not commitments to expose additional product behavior.

## 2. Implementation Principles

1. Single Assessment remains unchanged.
2. Batch adds orchestration, isolation, validation, and aggregate delivery around Single Assessment.
3. Only `modernize` is user-invocable.
4. Batch mode and execution approval are separate decisions.
5. Whole repositories run one at a time.
6. Agent prose never proves completion.
7. Repository-local reports remain canonical.
8. User-facing aggregate output follows the shared Modernization CLI outer layout.
9. Unsupported scope fails closed instead of triggering a broader implementation project.

## 3. Product Scope

### Included

- Default-config Batch/Single mode selection.
- Explicit Batch Assessment routing.
- Read-only Review and separate Start/Cancel approval.
- URL/local repository resolution and preflight.
- Whole-repository Java, .NET, JavaScript, and TypeScript Assessment.
- Sequential continuation after repository failure.
- Request/result/validation identity and artifact digest checks.
- Crash-consistent start, commit, and finalization.
- Aggregate HTML/JSON delivery and canonical report snapshots.

### Excluded

- Batch Planning and Execution.
- Full modernization workflows.
- Mixed-language execution until deterministic rejection is implemented.
- `include_paths` execution.
- Retry, resume, pause, abandon, or takeover scheduling.
- Parallel repository scheduling.
- Cloud/remote execution.
- `apps[].output` distribution.
- Rearchitecture/deployment/upgrade/remediation Batch modes.
- New Batch-specific feature-flag, telemetry, or worker-certification systems.

## 4. Completed Work

### 4.1 Routing And Entry

- [x] `modernize` is the only public agent.
- [x] All other plugin agents and skills explicitly declare `user-invocable: false`.
- [x] A read-only internal probe checks the fixed default `repos.json` path.
- [x] A found default config makes Batch/Single the first user-visible question.
- [x] Single selection returns to the classic route without Batch artifacts.
- [x] Batch selection proceeds to Review but does not approve execution.
- [x] Start and Cancel are exact, separately bound decisions.

### 4.2 Configuration And Preflight

- [x] v1 array and v2 object `repos.json` forms parse deterministically.
- [x] Unknown fields are preserved safely and secret-like values are redacted.
- [x] Repository names, Git URLs, branches, paths, and app references are validated.
- [x] URL credentials/query/fragment are removed before persistence.
- [x] Local paths use canonical containment checks.
- [x] Clone publication is temporary-directory-first and atomic.
- [x] Dirty/origin/branch mismatches are surfaced in Review.
- [x] `include_paths` are rejected before Batch execution state is created.

### 4.3 Control Plane

- [x] Immutable manifest and explicit execution-unit identity.
- [x] Single-owner lease with owner token retained only in a private worker.
- [x] Atomic state, repository state, summary, and append-only event updates.
- [x] One active repository attempt at a time.
- [x] Attempt-scoped request, result, validation, and scratch paths.
- [x] Request-bound UUID invocation and deterministic run identity.
- [x] Missing result maps to `ProtocolError`.
- [x] Partial usable result maps to `Completed with issues`.
- [x] A failed repository does not prevent the next repository from running.
- [x] Start/commit/finalize are replayable for the same immutable identity after local persistence faults.
- [x] Finalization journal binds summary and user report digests before lease release.

### 4.4 Assessment Reuse

- [x] Batch uses the existing plugin-owned Assessment skill and runtime.
- [x] Assessment uses no Assessment MCP dependency.
- [x] AppCAT/NCU behavior and canonical report paths remain unchanged.
- [x] Full coverage uses the same six fact skills.
- [x] Security uses the same seven top-level skills.
- [x] Attempt scratch isolates fact/security outputs.
- [x] Per-repository task waves obey `maxConcurrency`; repository scheduling remains sequential.
- [x] JavaScript/TypeScript Assessment completes with `planningSupported: false`.

### 4.5 Validation

- [x] Compatibility JSON is checked against a versioned schema.
- [x] JSON/HTML run identity, language, domains, and counts are request-bound.
- [x] Java/.NET AppCAT evidence is required when applicable.
- [x] Full coverage requires all six facts.
- [x] Security requires terminal evidence for all selected tasks.
- [x] Successful results require `artifactValidation: passed`.
- [x] Paths and symlinks cannot escape allowed roots.
- [x] Validation records and artifact SHA-256 digests are immutable.
- [x] Empty, stale, fabricated, or mismatched artifacts fail closed.

### 4.6 User Delivery

- [x] Canonical repository artifacts remain in the Single locations.
- [x] Finalization atomically publishes `.github/modernize/assessment/reports-<timestamp>/`.
- [x] Published output includes `index.html`, `aggregate-report.json`, and per-repository snapshots.
- [x] Shared aggregate fields align with the Modernization CLI outer data shape.
- [x] Plugin-only aggregate data is isolated under `extensions.github-copilot-modernization`.
- [x] The final TUI response presents `index.html` before private diagnostics.
- [x] Directory/index/aggregate digests are bound in `finalization.json`.

## 5. Remaining Work

Only release-evidence refresh remains under this plan. IP-209 through IP-212 are implemented and covered by deterministic tests.

### IP-209: Complete Single Assessment Configuration Parity

**Status:** Completed

Carry these explicit fields through Review, handoff, immutable request, phase command construction, validation policy, and aggregate metadata:

- `targetRuntime`
- `targetComputeServices`
- `enableContainerization`
- `targetOS`
- `minimumCveSeverity`
- `cveScanScope`

Acceptance:

- Batch never silently drops an explicit Single Assessment option.
- Request identity and reports prove the effective configuration.
- Omitted values retain Single defaults.

### IP-210: Apply Language-Specific Defaults Per Unit

**Status:** Completed

Compute effective domains for each repository using the same defaults as Single:

- Java: `java-upgrade, cloud-readiness`
- .NET: `cloud-readiness`
- JavaScript/TypeScript: dependency assessment

Acceptance:

- Mixed-language portfolios do not receive one incorrect global default.
- Explicit user domains still override defaults consistently.

### IP-211: Fail Closed On Mixed-Language Execution Units

**Status:** Completed

Replace the current implicit `languages[0]` selection with deterministic rejection when one execution unit reports multiple languages.

This plan intentionally chooses fail-closed behavior instead of adding project decomposition. Supporting mixed-language units requires a separate product requirement.

Acceptance:

- No detected language is silently omitted.
- Review identifies the blocked execution unit and detected languages.
- No manifest/state/attempt is created for the blocked unit.

### IP-212: Match Single Summary Semantics

**Status:** Completed

Add deterministic aggregate and TUI output for:

- finding counts by severity;
- finding counts by state;
- per-repository top recommendation;
- aggregate top recommendations;
- normalized `planningSupported` evidence.

Acceptance:

- Values are derived from validated canonical reports, not agent prose.
- Aggregate values equal the union/sum of repository report values.

### IP-213: Refresh Release Evidence

**Status:** Completed

- [x] Current-package Windows product-host scenarios: Single fallback, Batch success, Cancel, unsupported routes, and natural child failure.
- [x] Current-package POSIX product-host scenarios.
- [x] Current-package real Spring Petclinic/Airsonic acceptance.
- [x] Full `*.test.mjs` regression with zero failures on the final package digest.
- [x] Package content smoke includes every required agent, skill, schema, script, hook, and report publisher.

Permission-event injection is diagnostic only. A host that does not expose a target-identifiable nested-agent permission request may report the injection as `not_supported`; deterministic missing-result and partial-result tests remain mandatory.

## 6. Release Gate

Batch Assessment is product-ready only when:

- [x] IP-209 through IP-212 are complete.
- [x] Current-package Windows and POSIX supported product scenarios pass.
- [x] Current-package real-repository acceptance passes.
- [x] Every successful artifact traces to an attempt-bound validation record and digest.
- [x] Single mode routing and artifact golden tests remain unchanged.
- [x] User documentation states the exact Assessment-only limitations.
- [x] Full MJS regression has zero failures.

No gate depends on future Batch Planning, Execution, retry, resume, takeover scheduling, feature flags, or Batch-specific telemetry.

## 7. Validation Matrix

| Layer | Required Coverage |
|---|---|
| Schema/unit | Config, identity, status, path, secret, report, aggregate, and digest positive/negative cases. |
| Crash integration | Request/state/validation/repository/event/report/summary/finalization/lease boundaries. |
| Control-plane integration | Resolve → inspect → Review → initialize → sequential attempts → aggregate report. |
| Product host | Real packaged agents, mode choice, Review/Start, two repositories, Cancel, unsupported routes, natural failure. |
| Real repositories | Java repositories with AppCAT, report completeness, source canaries, and unchanged tracked files. |
| Regression | Full `*.test.mjs`; Single golden contracts; package content smoke. |

## 8. Change Boundary

Allowed changes:

- Batch agents, Batch skill/scripts/schemas, Batch tests, and Batch documentation.
- Narrow optional Assessment parameters whose omission preserves Single behavior.
- Routing changes required to select Batch versus existing Single mode.

Protected:

- README product contract.
- Single Assessment defaults and artifact locations.
- Single Planning and Execution coordinators.
- Existing specialized workers.
- Plugin public-entry structure other than keeping `modernize` as the sole entry.

## 9. Rollback

Disable/remove Batch routing while preserving repository-local Assessment reports. Do not delete or rewrite user repositories, reports, plans, or source changes. Single mode continues through its existing route.

## 10. Removed From This Plan

The following previously proposed work is intentionally removed rather than deferred:

- persisted `NeedsInput` workflows;
- Batch Planning;
- Batch Execution and worker allowlists;
- full modernization pipelines;
- retry waves and terminal-unit retry;
- cross-session resume;
- normal pause/abandon UX;
- takeover scheduling and side-effect fencing work;
- cross-repository concurrency and resource scaling;
- `include_paths` reopening;
- app output distribution;
- depth-safe rearchitecture routes;
- Batch-specific telemetry correlation;
- a new Batch feature-flag framework.

Their already-shipped primitives may remain in code for compatibility, but no task in this plan activates them.
