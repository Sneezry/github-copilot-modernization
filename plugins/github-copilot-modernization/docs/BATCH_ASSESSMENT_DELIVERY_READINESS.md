# Batch Assessment Delivery Readiness

> Review date: 2026-08-19
>
> Scope: local, sequential, whole-repository Batch Assessment
>
> Current verdict: **Go for product-ready release within the documented Stage 1B scope**

## 1. Executive Summary

The Batch Assessment implementation is functionally complete for its narrow scope and has strong deterministic evidence. It is beyond PoC: the real packaged `modernize → batch-review → batch-coordinator → batch-assessment` chain has completed multiple repositories, continued after a natural repository failure, produced request-bound reports, and published a digest-bound aggregate report.

Single Assessment parity is implemented. Windows and POSIX product-host E2E pass on the same package digest, and matching Spring Petclinic/Airsonic acceptance passes with unchanged tracked files. The documented Stage 1B release gate is complete.

Product readiness is not blocked by Batch Planning/Execution, retry, resume, pause, takeover scheduling, `include_paths`, telemetry correlation, feature flags, app distribution, or cross-repository concurrency. Those capabilities are outside the design rather than deferred release requirements.

## 2. Current Quality Matrix

| Quality area | Status | Evidence | Release impact |
|---|---|---|---|
| Single routing isolation | Ready | Single fallback creates no Batch execution artifacts; Single golden tests pass | Pass |
| Mode and approval UX | Ready | Batch/Single first question; Review and Start are separate | Pass |
| Config/path/Git safety | Ready | Resolver, preflight, containment, redaction, clone tests | Pass |
| Sequential scheduling | Ready | One active repository; strict event/time ordering | Pass |
| Result integrity | Ready | Request-bound schema, HTML, AppCAT, facts, security, digests | Pass |
| Crash consistency | Ready | Validation/finalization journals and fault injection | Pass |
| Aggregate delivery | Ready | Atomic `assessment/reports-*`, index, aggregate, snapshots, journal digests | Pass |
| Failure continuation | Ready | Natural repository failure followed by successful repository | Pass |
| Whole-repository scope | Ready | `include_paths` rejected before initialization | Pass |
| Full Single config parity | Ready | Six optional fields are Review/request/report/aggregate-bound | Pass |
| Language/default parity | Ready | Per-unit Single defaults; mixed-language units fail before state | Pass |
| Summary parity | Ready | Validated severity/state/recommendation/Planning summaries | Pass |
| Current Windows package | Ready for supported scenarios | Final digest passes 7 supported product scenarios | Pass |
| Current POSIX package | Ready | Supported scenarios and natural child failure pass; permission diagnostics unavailable | Pass |
| Current real repositories | Ready | Same-digest Spring/Airsonic 2/2; tracked files unchanged | Pass |

## 3. Verified Implementation

### 3.1 Entry And Approval

- `modernize` is the only public agent.
- Every other plugin agent and skill is explicitly internal.
- The default config probe is read-only and does not require plugin-root discovery.
- A found default config always asks Batch or Single first.
- Single returns to the classic route.
- Batch Review is read-only.
- **Start batch** is a distinct approval bound to reviewed paths and digests.
- Cancel before Start produces no manifest, lease, attempts, or aggregate report.

### 3.2 Assessment Execution

- Each repository receives a fresh `batch-assessment` invocation.
- Cross-repository execution is sequential.
- The existing Assessment runtime and skill are reused.
- AppCAT/NCU, facts, security, findings memory, and canonical reports retain Single behavior.
- Application source and build manifests are not modified.
- JavaScript/TypeScript Assessment records Planning as unsupported without degrading Assessment success.

### 3.3 Control Plane And Validation

- Immutable manifest, request, result, validation, and finalization records.
- Raw lease owner token remains private to a local worker.
- Atomic state and append-only events.
- Operation-key event deduplication.
- Missing result becomes `ProtocolError`.
- Partial usable result becomes `Completed with issues`.
- False success is rejected for empty/stale/fabricated/mismatched artifacts.
- Artifact paths, identities, and SHA-256 digests are revalidated at finalization.
- Start/commit/finalize can replay the same identity after local persistence faults.

### 3.4 User Delivery

- Canonical repository reports remain in Single locations.
- Finalization publishes:

```text
.github/modernize/assessment/reports-<timestamp>/
├── index.html
├── aggregate-report.json
└── repos/<identity>/
    ├── report.json
    ├── report.html
    └── facts/
```

- Shared aggregate fields align with the Modernization CLI outer shape.
- Plugin-only data is under `extensions.github-copilot-modernization`.
- The entire report tree is atomically published and digest-bound.
- TUI output presents `index.html` before private diagnostics.

## 4. Remaining Blockers

None within the documented local, sequential, whole-repository Batch Assessment scope.

## 5. Evidence Snapshot

As of 2026-08-19:

- Full Node regression: **174 tests, 172 passed, 0 failed, 2 platform-conditional skips**.
- Editor diagnostics: 0.
- Current product package: `89f7c3cb010d88711bca02c5944f499de9e21ae7c5f09c6f49d3a976bef64825`.
- Current Windows supported product scenarios passed:
  - default-config Single selection;
  - default-config Batch selection plus separate Start;
  - explicit two-repository Batch success;
  - Cancel before approval;
  - Batch Planning rejection;
  - Batch Execution rejection;
  - natural repository failure with later continuation.
- Missing-result and partial-Assessment behavior pass deterministic control-plane tests.
- ACP fault injection remains `not_supported`: the host emits permission requests but none identifies nested `batch-assessment` dispatch precisely enough to cancel that target.
- Linux evidence binds the same package and passes all supported scenarios plus natural child-failure continuation. Permission diagnostics are `not_supported`; mandatory deterministic missing/partial tests pass.
- Same-digest Spring/Airsonic acceptance passed: 2/2 completed, 11 and 27 findings, strict sequencing, aggregate/report validation, and unchanged tracked files.

## 6. Permission-Event Evidence Decision

Permission-event fault injection is not a product feature. The product does not rely on ACP permission events for normal execution.

Release requires:

- deterministic tests proving missing result → `ProtocolError` and continuation;
- deterministic tests proving partial result aggregation;
- real-host natural failure and continuation;
- real-host normal success and Cancel.

A host-specific inability to expose a target-identifiable nested-agent permission request does not block release and must not be reported as a product failure. The product-host evidence may retain `not_supported` as diagnostic metadata.

## 7. Release Gate

Change the verdict to Go only when:

- [x] BM-011 is closed.
- [x] BM-012 is closed.
- [x] BM-013 is closed.
- [x] Current-package Windows and POSIX supported product scenarios pass.
- [x] Current-package real Java repository acceptance passes.
- [x] Result validation and crash consistency are complete.
- [x] Aggregate report delivery is complete.
- [x] Whole-repository scope fails closed for `include_paths`.
- [x] Single mode regression remains unchanged.
- [x] User documentation states the Assessment-only boundary.
- [x] Full MJS regression has zero failures.

## 8. Explicit Non-Gates

The following are not release work for Batch Assessment:

- Batch Planning or Execution;
- full modernization workflows;
- retry/resume/pause/abandon;
- takeover scheduling;
- `include_paths` support;
- cross-repository parallelism or resource scaling;
- cloud execution;
- app output distribution;
- Batch-specific telemetry correlation;
- a new Batch feature-flag framework;
- worker certification or rearchitecture routing.

## 9. Rollback

If Batch routing must be withdrawn, remove/disable the Batch route while preserving repository-local and aggregate reports. Do not modify Single routing, delete user reports, or reset user repositories.
