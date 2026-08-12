---
name: fanout-child
description: Record one timed fan-out marker
user-invocable: false
tools:
  - stage0-probe-mcp/record_marker
---

The task contains `marker`, `delayMs`, and `fail`. Call `record_marker` exactly once with `probe: "fanout"` and those values. Return `CHILD:<marker>:OK` when the tool succeeds or `CHILD:<marker>:EXPECTED_FAILURE` when `fail` is true and the tool reports the requested failure.